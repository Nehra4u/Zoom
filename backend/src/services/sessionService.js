import { SessionState } from '../models/SessionState.js';
import { User } from '../models/User.js';
import { getIo } from './io.js';
import { getLiveMeeting, toPublicMeeting } from './meetingService.js';

function emitAdmin(event, payload) {
  const io = getIo();
  if (!io) return;
  io.of('/admin').to('admin:session').emit(event, payload);
}

function toParticipant(session, user) {
  return {
    userId: session.userId.toString(),
    zoomParticipantId: session.zoomParticipantId,
    displayName: user?.name ?? session.zoomDisplayName,
    zoomDisplayName: session.zoomDisplayName,
    isMuted: session.isMuted,
    inCall: session.inCall,
    joinedAt: session.joinedAt?.toISOString() ?? null,
    leftAt: session.leftAt?.toISOString() ?? null,
    userStatus: user?.status ?? null,
    email: user?.email ?? null,
  };
}

export async function getCurrentSession() {
  const liveMeeting = await getLiveMeeting();
  const sessions = await SessionState.find({ inCall: true }).sort({ joinedAt: -1 });
  const userIds = sessions.map((s) => s.userId);
  const users = await User.find({ _id: { $in: userIds } });
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  return {
    sessionActive: Boolean(liveMeeting) || sessions.length > 0,
    meetingLive: Boolean(liveMeeting),
    meeting: toPublicMeeting(liveMeeting),
    participants: sessions.map((s) => toParticipant(s, userMap.get(s.userId.toString()))),
  };
}

export async function handleParticipantJoined({
  userId,
  zoomParticipantId,
  displayName,
  zoomDisplayName,
  meetingId,
  joinedAt = new Date(),
  eventTs = Date.now(),
}) {
  const user = await User.findById(userId);
  if (!user) return null;

  const session = await SessionState.findOneAndUpdate(
    { userId },
    {
      zoomParticipantId,
      zoomDisplayName: zoomDisplayName || user.zoomDisplayName,
      inCall: true,
      isMuted: false,
      joinedAt,
      leftAt: null,
      meetingId: meetingId ?? null,
      updatedAt: new Date(eventTs),
    },
    { upsert: true, new: true }
  );

  user.lastActiveAt = joinedAt;
  await user.save();

  const payload = {
    userId: userId.toString(),
    zoomParticipantId,
    displayName: displayName || user.name,
    zoomDisplayName: session.zoomDisplayName,
    isMuted: false,
    joinedAt: joinedAt.toISOString(),
    userStatus: user.status,
  };

  emitAdmin('participant:joined', payload);
  return toParticipant(session, user);
}

export async function handleParticipantLeft({ zoomParticipantId, userId, leftAt = new Date(), eventTs = Date.now() }) {
  const update = { inCall: false, leftAt, updatedAt: new Date(eventTs) };

  let session = null;
  if (userId) {
    session = await SessionState.findOneAndUpdate({ userId, inCall: true }, update, { new: true });
  }
  if (!session && zoomParticipantId) {
    session = await SessionState.findOneAndUpdate({ zoomParticipantId }, update, { new: true });
  }
  if (!session) return null;

  const user = await User.findById(session.userId);
  const payload = {
    userId: session.userId.toString(),
    zoomParticipantId: session.zoomParticipantId,
    displayName: user?.name ?? session.zoomDisplayName,
    leftAt: leftAt.toISOString(),
  };

  emitAdmin('participant:left', payload);
  return toParticipant(session, user);
}

export async function handleParticipantMuted({ zoomParticipantId, userId, muted = true, eventTs = Date.now() }) {
  const query = zoomParticipantId ? { zoomParticipantId } : { userId, inCall: true };
  const session = await SessionState.findOneAndUpdate(
    query,
    { isMuted: muted, updatedAt: new Date(eventTs) },
    { new: true }
  );
  if (!session) return null;

  const user = await User.findById(session.userId);
  const event = muted ? 'participant:muted' : 'participant:unmuted';
  const payload = {
    userId: session.userId.toString(),
    zoomParticipantId: session.zoomParticipantId,
    displayName: user?.name ?? session.zoomDisplayName,
    isMuted: muted,
  };

  emitAdmin(event, payload);
  return toParticipant(session, user);
}

export async function handleSessionEnded(meetingId) {
  const query = meetingId ? { meetingId, inCall: true } : { inCall: true };
  await SessionState.updateMany(query, { inCall: false, leftAt: new Date() });

  const io = getIo();
  if (io) {
    io.of('/admin').to('admin:session').emit('session:ended', { meetingId: meetingId ?? null });
    io.of('/client').emit('session:ended', { meetingId: meetingId ?? null });
  }

  const { ActiveMeeting } = await import('../models/ActiveMeeting.js');
  await ActiveMeeting.updateMany({ status: 'live' }, { status: 'ended', endedAt: new Date() });
}
