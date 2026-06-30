import { getIo } from './io.js';

export function notifySessionStarted(userId, credentials = {}) {
  const io = getIo();
  if (!io) {
    console.log(`[notification] SESSION_STARTED → client:${userId}`, credentials);
    return;
  }

  io.of('/client').to(`client:${userId}`).emit('SESSION_STARTED', {
    meetingNumber: credentials.meetingNumber ?? null,
    password: credentials.password ?? null,
    message: 'A meeting has started. Request your join token to enter.',
  });
}

export function forceLeaveUser(userId, reason = 'account_deactivated') {
  const io = getIo();
  if (!io) {
    console.log(`[notification] FORCE_LEAVE → client:${userId}`, { reason });
    return;
  }

  io.of('/client').to(`client:${userId}`).emit('FORCE_LEAVE', {
    reason,
    message:
      reason === 'account_deactivated'
        ? 'Your account has been deactivated. You have been removed from the call.'
        : reason === 'removed_from_call'
          ? 'You have been removed from the meeting by an admin.'
          : 'You have been removed from the call.',
  });
}

export function notifyRejoinAllowed(userId, credentials = {}) {
  const io = getIo();
  if (!io) {
    console.log(`[notification] REJOIN_ALLOWED → client:${userId}`, credentials);
    return;
  }

  io.of('/client').to(`client:${userId}`).emit('REJOIN_ALLOWED', {
    meetingToken: credentials.sdkJwt ?? null,
    meetingNumber: credentials.meetingNumber ?? null,
    password: credentials.password ?? null,
    pending: credentials.pending ?? false,
  });
}

export function sendStatusSync(socket, { isActive, shouldBeInMeeting }) {
  socket.emit('STATUS_SYNC', { isActive, shouldBeInMeeting });
}

// ─── New events for Android client flow ───────────────────────────────────────

export function forceLogoutUser(userId, reason = 'SESSION_REVOKED') {
  const io = getIo();
  if (!io) {
    console.log(`[notification] FORCE_LOGOUT → client:${userId}`, { reason });
    return;
  }

  io.of('/client').to(`client:${userId}`).emit('FORCE_LOGOUT', {
    type: 'FORCE_LOGOUT',
    status: 'LOGGED_OUT',
    reason,
    message: 'You have been logged out. Please login again.',
  });
}

export function notifyUserDeactivated(userId) {
  const io = getIo();
  if (!io) {
    console.log(`[notification] USER_DEACTIVATED → client:${userId}`);
    return;
  }

  io.of('/client').to(`client:${userId}`).emit('USER_DEACTIVATED', {
    type: 'USER_DEACTIVATED',
    status: 'USER_DEACTIVATED',
    message: 'Your account has been deactivated. Please contact support.',
  });
}

export function notifyMeetingUpdated(meetingData = {}) {
  const io = getIo();
  if (!io) {
    console.log(`[notification] MEETING_UPDATED → all clients`, meetingData);
    return;
  }

  io.of('/client').emit('MEETING_UPDATED', {
    type: 'MEETING_UPDATED',
    meeting: meetingData,
  });
}
