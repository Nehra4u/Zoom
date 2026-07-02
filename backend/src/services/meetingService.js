import crypto from 'crypto';
import { ActiveMeeting } from '../models/ActiveMeeting.js';
import { Admin } from '../models/Admin.js';
import { SessionState } from '../models/SessionState.js';
import { User } from '../models/User.js';
import { writeAuditLog } from './auditService.js';
import {
  assertAdminOwnsUser,
  assertCanManageMeeting,
  userScopeQuery,
} from './adminScope.js';
import {
  createInstantMeeting,
  endMeeting as endZoomMeeting,
  muteLiveParticipant,
  removeLiveParticipant,
  isMockMode,
  fetchHostZakToken,
} from './zoomApi.js';
import { forceLeaveUser, notifySessionStarted } from './notificationService.js';
import { generateZoomSdkJwt } from './zoomTokenService.js';

function toPublicMeeting(doc) {
  if (!doc) return null;
  return {
    id: doc._id.toString(),
    meetingNumber: doc.meetingNumber,
    password: doc.password,
    zoomMeetingUuid: doc.zoomMeetingUuid,
    topic: doc.topic,
    status: doc.status,
    startedAt: doc.startedAt?.toISOString() ?? null,
    endedAt: doc.endedAt?.toISOString() ?? null,
    startUrl: doc.startUrl ?? null,
    joinUrl: doc.joinUrl ?? null,
    startedBy: doc.startedBy?.toString() ?? null,
    hostDisplayName: doc.hostDisplayName ?? null,
  };
}

function zoomIdMatch(normalized) {
  return {
    $or: [
      { meetingNumber: normalized },
      { zoomMeetingUuid: normalized },
      { zoomMeetingId: normalized },
    ],
  };
}

export async function getLiveMeetingForAdmin(adminId) {
  if (!adminId) return null;
  return ActiveMeeting.findOne({ status: 'live', startedBy: adminId }).sort({ startedAt: -1 });
}

export async function findLiveMeetingByZoomId(meetingId) {
  if (!meetingId) return null;
  return ActiveMeeting.findOne({ status: 'live', ...zoomIdMatch(String(meetingId)) });
}

export async function findMeetingByZoomId(meetingId) {
  if (!meetingId) return null;
  return ActiveMeeting.findOne(zoomIdMatch(String(meetingId))).sort({ startedAt: -1 });
}

/** @deprecated Prefer getLiveMeetingForAdmin */
export async function getLiveMeeting() {
  return ActiveMeeting.findOne({ status: 'live' }).sort({ startedAt: -1 });
}

export async function getLiveMeetingCredentialsForAdmin(adminId) {
  const live = await getLiveMeetingForAdmin(adminId);
  if (!live) {
    return { meetingNumber: '', password: '', meetingUuid: null };
  }
  return {
    meetingNumber: live.meetingNumber,
    password: live.password ?? '',
    meetingUuid: live.zoomMeetingUuid,
  };
}

export async function getLiveMeetingCredentials() {
  const live = await getLiveMeeting();
  if (!live) {
    return { meetingNumber: '', password: '', meetingUuid: null };
  }
  return {
    meetingNumber: live.meetingNumber,
    password: live.password ?? '',
    meetingUuid: live.zoomMeetingUuid,
  };
}

export async function isMeetingEventForActiveSession(meetingId) {
  if (!meetingId) return true;
  const live = await findLiveMeetingByZoomId(meetingId);
  return Boolean(live);
}

async function getAdminDisplayName(adminId) {
  const admin = await Admin.findById(adminId);
  return admin?.name ?? 'Admin';
}

async function resolveHostUserId(adminId) {
  const admin = await Admin.findById(adminId);
  return admin?.zoomHostUserId || process.env.ZOOM_HOST_USER_ID || null;
}

export async function startMeeting(actor) {
  const existing = await getLiveMeetingForAdmin(actor.sub);
  if (existing) {
    const err = new Error('You already have a live meeting');
    err.status = 409;
    throw err;
  }

  const hostUserId = await resolveHostUserId(actor.sub);
  const existingOnHost = hostUserId
    ? await ActiveMeeting.findOne({ status: 'live', hostUserId })
    : null;
  if (existingOnHost && existingOnHost.startedBy?.toString() !== actor.sub) {
    const err = new Error(
      'This Zoom host account already has a live meeting. Assign a dedicated Zoom user to each admin for parallel meetings.'
    );
    err.status = 409;
    throw err;
  }

  const hostDisplayName = await getAdminDisplayName(actor.sub);
  const topic = `${hostDisplayName} Session`;

  let meetingData;
  if (isMockMode()) {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    meetingData = {
      meetingNumber: id,
      password: 'mock-pass',
      zoomMeetingUuid: `mock-uuid-${id}`,
      zoomMeetingId: id,
      topic,
      startUrl: `https://zoom.us/s/${id}`,
      joinUrl: `https://zoom.us/j/${id}`,
    };
  } else {
    meetingData = await createInstantMeeting({ topic, hostUserId });
  }

  const meeting = await ActiveMeeting.create({
    meetingNumber: meetingData.meetingNumber,
    password: meetingData.password ?? '',
    zoomMeetingUuid: meetingData.zoomMeetingUuid,
    zoomMeetingId: meetingData.zoomMeetingId ?? meetingData.meetingNumber,
    hostUserId,
    startUrl: meetingData.startUrl ?? null,
    joinUrl: meetingData.joinUrl ?? null,
    topic: meetingData.topic ?? topic,
    hostDisplayName,
    status: 'live',
    startedBy: actor.sub,
  });

  await writeAuditLog({
    actor,
    action: 'meeting_started',
    meta: {
      meetingNumber: meeting.meetingNumber,
      meetingId: meeting._id.toString(),
    },
  });

  const userQuery = { status: 'active', ...userScopeQuery(actor) };
  const activeUsers = await User.find(userQuery);
  for (const user of activeUsers) {
    notifySessionStarted(user._id.toString(), {
      meetingNumber: meeting.meetingNumber,
      password: meeting.password,
    });
  }

  return toPublicMeeting(meeting);
}

export async function endMeeting(actor) {
  const live = await getLiveMeetingForAdmin(actor.sub);
  if (!live) {
    const err = new Error('No live meeting to end');
    err.status = 404;
    throw err;
  }

  await assertCanManageMeeting(actor, live);

  if (!isMockMode()) {
    try {
      await endZoomMeeting(live.zoomMeetingUuid || live.meetingNumber);
    } catch (err) {
      if (!/404|400|Invalid meeting/i.test(err.message)) {
        throw err;
      }
    }
  }

  live.status = 'ended';
  live.endedAt = new Date();
  await live.save();

  const { handleSessionEnded } = await import('./sessionService.js');
  await handleSessionEnded(live.meetingNumber);

  await writeAuditLog({
    actor,
    action: 'meeting_ended',
    meta: {
      meetingNumber: live.meetingNumber,
      meetingId: live._id.toString(),
    },
  });

  return toPublicMeeting(live);
}

export async function getMeetingJoinInfo(actor) {
  const live = await getLiveMeetingForAdmin(actor.sub);
  if (!live) {
    const err = new Error('No live meeting');
    err.status = 404;
    throw err;
  }

  await assertCanManageMeeting(actor, live);

  return {
    meetingNumber: live.meetingNumber,
    password: live.password ?? '',
    startUrl: live.startUrl ?? null,
    joinUrl: live.joinUrl ?? `https://zoom.us/j/${live.meetingNumber}`,
    displayName: live.hostDisplayName ?? (await getAdminDisplayName(actor.sub)),
  };
}

export async function issueAdminJoinToken(actor) {
  const live = await getLiveMeetingForAdmin(actor.sub);
  if (!live) {
    const err = new Error('No live meeting');
    err.status = 404;
    throw err;
  }

  await assertCanManageMeeting(actor, live);

  const displayName = live.hostDisplayName ?? (await getAdminDisplayName(actor.sub));
  const admin = await Admin.findById(actor.sub);

  // Role 1 + ZAK starts the meeting as host; userName keeps the admin's display name in Zoom.
  const { token: sdkJwt } = generateZoomSdkJwt(live.meetingNumber, 1);
  const zak = await fetchHostZakToken(live.hostUserId);

  await writeAuditLog({
    actor,
    action: 'admin_join_token_issued',
    meta: { meetingNumber: live.meetingNumber, displayName },
  });

  return {
    sdkJwt,
    zak,
    meetingNumber: live.meetingNumber,
    password: live.password ?? '',
    sdkKey: process.env.ZOOM_SDK_KEY ?? null,
    role: 1,
    displayName,
    userEmail: admin?.email ?? actor.email ?? null,
  };
}

export async function removeParticipantFromCall(userId, actor) {
  await assertAdminOwnsUser(actor, userId);

  const live = await getLiveMeetingForAdmin(actor.sub);
  if (!live) {
    const err = new Error('No live meeting');
    err.status = 404;
    throw err;
  }

  await assertCanManageMeeting(actor, live);

  const session = await SessionState.findOne({ userId, inCall: true, meetingId: live.meetingNumber });
  if (!session) {
    const err = new Error('User is not in the call');
    err.status = 404;
    throw err;
  }

  if (!isMockMode() && session.zoomParticipantId) {
    await removeLiveParticipant(live.zoomMeetingUuid || live.meetingNumber, session.zoomParticipantId);
  }

  forceLeaveUser(userId.toString(), 'removed_from_call');
  const { handleParticipantLeft } = await import('./sessionService.js');
  await handleParticipantLeft({ userId, zoomParticipantId: session.zoomParticipantId });

  await writeAuditLog({
    actor,
    action: 'participant_removed',
    targetUserId: userId,
    meta: { zoomParticipantId: session.zoomParticipantId },
  });

  return { ok: true };
}

export async function setParticipantMuted(userId, muted, actor) {
  await assertAdminOwnsUser(actor, userId);

  const live = await getLiveMeetingForAdmin(actor.sub);
  if (!live) {
    const err = new Error('No live meeting');
    err.status = 404;
    throw err;
  }

  await assertCanManageMeeting(actor, live);

  const session = await SessionState.findOne({ userId, inCall: true, meetingId: live.meetingNumber });
  if (!session) {
    const err = new Error('User is not in the call');
    err.status = 404;
    throw err;
  }

  if (!isMockMode() && session.zoomParticipantId) {
    await muteLiveParticipant(
      live.zoomMeetingUuid || live.meetingNumber,
      session.zoomParticipantId,
      muted
    );
  }

  const { handleParticipantMuted } = await import('./sessionService.js');
  await handleParticipantMuted({
    userId,
    zoomParticipantId: session.zoomParticipantId,
    muted,
  });

  await writeAuditLog({
    actor,
    action: muted ? 'participant_muted' : 'participant_unmuted',
    targetUserId: userId,
    meta: { zoomParticipantId: session.zoomParticipantId },
  });

  return { ok: true, isMuted: muted };
}

export { toPublicMeeting };
