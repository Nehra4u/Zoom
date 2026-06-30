import crypto from 'crypto';
import { ActiveMeeting } from '../models/ActiveMeeting.js';
import { User } from '../models/User.js';
import { writeAuditLog } from './auditService.js';
import {
  createInstantMeeting,
  endMeeting as endZoomMeeting,
  removeLiveParticipant,
  isMockMode,
} from './zoomApi.js';
import { forceLeaveUser, notifySessionStarted } from './notificationService.js';

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
  };
}

export async function getLiveMeeting() {
  return ActiveMeeting.findOne({ status: 'live' }).sort({ startedAt: -1 });
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
  const live = await getLiveMeeting();
  if (!live) return false;

  const normalized = String(meetingId);
  return (
    normalized === live.meetingNumber ||
    normalized === live.zoomMeetingUuid ||
    normalized === live.zoomMeetingId
  );
}

export async function startMeeting(actor) {
  const existing = await getLiveMeeting();
  if (existing) {
    const err = new Error('A meeting is already live');
    err.status = 409;
    throw err;
  }

  let meetingData;
  if (isMockMode()) {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    meetingData = {
      meetingNumber: id,
      password: 'mock-pass',
      zoomMeetingUuid: `mock-uuid-${id}`,
      zoomMeetingId: id,
      topic: 'ZoomControl Session (Mock)',
    };
  } else {
    meetingData = await createInstantMeeting();
  }

  const meeting = await ActiveMeeting.create({
    meetingNumber: meetingData.meetingNumber,
    password: meetingData.password ?? '',
    zoomMeetingUuid: meetingData.zoomMeetingUuid,
    zoomMeetingId: meetingData.zoomMeetingId ?? meetingData.meetingNumber,
    hostUserId: process.env.ZOOM_HOST_USER_ID ?? null,
    topic: meetingData.topic ?? 'ZoomControl Session',
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

  const activeUsers = await User.find({ status: 'active' });
  for (const user of activeUsers) {
    notifySessionStarted(user._id.toString(), {
      meetingNumber: meeting.meetingNumber,
      password: meeting.password,
    });
  }

  return toPublicMeeting(meeting);
}

export async function endMeeting(actor) {
  const live = await getLiveMeeting();
  if (!live) {
    const err = new Error('No live meeting to end');
    err.status = 404;
    throw err;
  }

  if (!isMockMode()) {
    await endZoomMeeting(live.zoomMeetingUuid || live.meetingNumber);
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

export async function removeParticipantFromCall(userId, actor) {
  const session = await SessionState.findOne({ userId, inCall: true });
  if (!session) {
    const err = new Error('User is not in the call');
    err.status = 404;
    throw err;
  }

  const live = await getLiveMeeting();
  if (live && !isMockMode() && session.zoomParticipantId) {
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

export { toPublicMeeting };
