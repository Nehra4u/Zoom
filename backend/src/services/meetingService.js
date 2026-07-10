import crypto from 'crypto';
import { ActiveMeeting } from '../models/ActiveMeeting.js';
import { Admin } from '../models/Admin.js';
import { SessionState } from '../models/SessionState.js';
import { User } from '../models/User.js';
import { writeAuditLog } from './auditService.js';
import {
  assertAdminOwnsUser,
  assertCanManageMeeting,
  assertRegularAdmin,
  canManageMeeting,
  isSuperAdmin,
  userScopeQuery,
} from './adminScope.js';
import {
  createInstantMeeting,
  endMeeting as endZoomMeeting,
  muteLiveParticipant,
  removeLiveParticipant,
  isMockMode,
  fetchHostZakToken,
  fetchLiveMeetingParticipants,
  normalizeMeetingNumber,
  verifyMeetingExists,
} from './zoomApi.js';
import {
  forceLeaveUser,
  notifyAdminSessionStarted,
  notifySessionStarted,
} from './notificationService.js';
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

/** Live meeting this admin owns or can access via shared Zoom host account. */
export async function getAccessibleLiveMeeting(actor) {
  if (!actor?.sub || isSuperAdmin(actor)) return null;

  const own = await getLiveMeetingForAdmin(actor.sub);
  if (own) {
    return { meeting: own, ownedByMe: true, canEnd: true };
  }

  const hostUserId = await resolveHostUserId(actor.sub);
  if (!hostUserId) return null;

  const onHost = await ActiveMeeting.findOne({ status: 'live', hostUserId }).sort({ startedAt: -1 });
  if (!onHost) return null;

  const ownedByMe = onHost.startedBy?.toString() === actor.sub;
  const canEnd = canManageMeeting(actor, onHost) || onHost.hostUserId === hostUserId;
  return { meeting: onHost, ownedByMe, canEnd };
}

async function assertCanAccessMeeting(actor, meeting) {
  if (canManageMeeting(actor, meeting)) return meeting;
  const hostUserId = await resolveHostUserId(actor.sub);
  if (hostUserId && meeting.hostUserId === hostUserId) return meeting;
  const err = new Error('You cannot access this meeting');
  err.status = 403;
  throw err;
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

const SYNC_GRACE_MS = parseInt(process.env.MEETING_SYNC_GRACE_MS ?? '120000', 10);

async function isAbsentFromZoomMetrics(liveMeeting) {
  const ids = [
    ...new Set(
      [liveMeeting.zoomMeetingUuid, liveMeeting.meetingNumber, liveMeeting.zoomMeetingId]
        .filter(Boolean)
        .map(String)
    ),
  ];
  if (!ids.length) return false;

  for (const id of ids) {
    const { notLive } = await fetchLiveMeetingParticipants(id);
    if (!notLive) return false;
  }
  return true;
}

export async function syncMeetingEndIfStale(liveMeeting) {
  if (!liveMeeting || isMockMode()) return false;

  const startedAt = liveMeeting.startedAt?.getTime() ?? 0;
  if (Date.now() - startedAt < SYNC_GRACE_MS) return false;

  if (!(await isAbsentFromZoomMetrics(liveMeeting))) return false;

  // Metrics 404 for all identifiers — instant meetings may not appear in metrics
  // until someone joins, and GET /meetings can outlive the live session.
  const exists = await verifyMeetingExists(liveMeeting.meetingNumber);
  if (exists) {
    const hadActivity = await SessionState.exists({
      meetingId: liveMeeting.meetingNumber,
    });
    if (!hadActivity) return false;
  }

  liveMeeting.status = 'ended';
  liveMeeting.endedAt = new Date();
  await liveMeeting.save();

  const { handleSessionEnded } = await import('./sessionService.js');
  await handleSessionEnded(liveMeeting.meetingNumber);
  return true;
}

export async function startMeeting(actor) {
  assertRegularAdmin(actor);
  const existing = await getLiveMeetingForAdmin(actor.sub);
  if (existing) {
    const err = new Error('You already have a live meeting');
    err.status = 409;
    err.code = 'MEETING_ALREADY_LIVE';
    err.meeting = toPublicMeeting(existing);
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
    err.code = 'ZOOM_HOST_BUSY';
    err.meeting = toPublicMeeting(existingOnHost);
    throw err;
  }

  const hostDisplayName = await getAdminDisplayName(actor.sub);
  const topic = `${hostDisplayName} Session`;

  let meetingData;
  if (isMockMode()) {
    const id = String(Date.now()).padStart(10, '0').slice(-10);
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
    if (!isMockMode()) {
      await verifyMeetingExists(meetingData.meetingNumber);
    }
  }

  const meeting = await ActiveMeeting.create({
    meetingNumber: normalizeMeetingNumber(meetingData.meetingNumber),
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

  const publicMeeting = toPublicMeeting(meeting);
  notifyAdminSessionStarted(publicMeeting);

  const userQuery = { status: 'active', ...userScopeQuery(actor) };
  const activeUsers = await User.find(userQuery);
  for (const user of activeUsers) {
    await notifySessionStarted(user._id.toString(), user);
  }

  return publicMeeting;
}

export async function endMeeting(actor) {
  assertRegularAdmin(actor);
  const accessible = await getAccessibleLiveMeeting(actor);
  if (!accessible?.canEnd) {
    const err = new Error('No live meeting to end');
    err.status = 404;
    throw err;
  }
  const live = accessible.meeting;

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
  assertRegularAdmin(actor);
  const accessible = await getAccessibleLiveMeeting(actor);
  if (!accessible) {
    const err = new Error('No live meeting');
    err.status = 404;
    throw err;
  }
  const live = accessible.meeting;
  await assertCanAccessMeeting(actor, live);

  return {
    meetingNumber: live.meetingNumber,
    password: live.password ?? '',
    startUrl: live.startUrl ?? null,
    joinUrl: live.joinUrl ?? `https://zoom.us/j/${live.meetingNumber}`,
    displayName: live.hostDisplayName ?? (await getAdminDisplayName(actor.sub)),
  };
}

export async function issueAdminJoinToken(actor) {
  assertRegularAdmin(actor);
  const accessible = await getAccessibleLiveMeeting(actor);
  if (!accessible) {
    const err = new Error('No live meeting');
    err.status = 404;
    throw err;
  }
  const live = accessible.meeting;
  await assertCanAccessMeeting(actor, live);

  if (!isMockMode()) {
    const zoomMeeting = await verifyMeetingExists(live.meetingNumber);
    if (!zoomMeeting) {
      live.status = 'ended';
      live.endedAt = new Date();
      await live.save();
      const { handleSessionEnded } = await import('./sessionService.js');
      await handleSessionEnded(live.meetingNumber);
      const err = new Error('Meeting no longer exists on Zoom');
      err.status = 404;
      err.code = 'MEETING_ENDED';
      throw err;
    }
  }

  const meetingNumber = normalizeMeetingNumber(live.meetingNumber);
  const displayName = await getAdminDisplayName(actor.sub);
  const admin = await Admin.findById(actor.sub);
  const isMeetingHost = live.startedBy?.toString() === actor.sub;

  let role = 0;
  let zak = null;
  let joinMode = 'attendee';
  let sdkJwt;

  if (isMeetingHost) {
    try {
      const fetchedZak = await fetchHostZakToken(live.hostUserId);
      if (!fetchedZak || typeof fetchedZak !== 'string' || !fetchedZak.length) {
        const err = new Error(
          'Unable to fetch Zoom host token. Check Zoom API credentials and host user ID.'
        );
        err.status = 503;
        throw err;
      }
      zak = fetchedZak;
      role = 1;
      joinMode = 'host';
    } catch (zakErr) {
      const err = new Error(
        `Unable to fetch Zoom host token: ${zakErr.message}. Check Zoom API credentials and host user ID.`
      );
      err.status = 503;
      throw err;
    }
  }

  ({ token: sdkJwt } = generateZoomSdkJwt(meetingNumber, role));

  await writeAuditLog({
    actor,
    action: 'admin_join_token_issued',
    meta: { meetingNumber, displayName, role, joinMode, zakUsed: Boolean(zak) },
  });

  return {
    sdkJwt,
    zak,
    meetingNumber,
    password: live.password ?? '',
    sdkKey: process.env.ZOOM_SDK_KEY ?? null,
    role,
    joinMode,
    displayName,
    userEmail: admin?.email ?? actor.email ?? null,
  };
}

export async function removeParticipantFromCall(userId, actor) {
  assertRegularAdmin(actor);
  await assertAdminOwnsUser(actor, userId);

  const accessible = await getAccessibleLiveMeeting(actor);
  const live = accessible?.meeting ?? null;
  if (!live) {
    const err = new Error('No live meeting');
    err.status = 404;
    throw err;
  }

  await assertCanAccessMeeting(actor, live);

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
  assertRegularAdmin(actor);
  await assertAdminOwnsUser(actor, userId);

  const accessible = await getAccessibleLiveMeeting(actor);
  const live = accessible?.meeting ?? null;
  if (!live) {
    const err = new Error('No live meeting');
    err.status = 404;
    throw err;
  }

  await assertCanAccessMeeting(actor, live);

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

export { toPublicMeeting, resolveHostUserId };
