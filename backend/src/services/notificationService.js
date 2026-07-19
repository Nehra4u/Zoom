import { getIo } from './io.js';
import { buildClientMeetingPayload, buildClientStatusPayload } from './clientMeetingPayload.js';

function adminRoom(adminId) {
  return `admin:${adminId}`;
}

function clientRoom(userId) {
  return `client:${userId}`;
}

export async function notifySessionStarted(userId, user) {
  const meeting = await buildClientMeetingPayload(user);
  const payload = {
    ...(meeting ?? {}),
    meetingNumber: meeting?.meetingId ?? null,
    password: meeting?.meetingPassword ?? null,
    message: meeting
      ? 'A meeting has started. Join now.'
      : 'A meeting has started. Request your join token to enter.',
  };

  const io = getIo();
  if (!io) {
    console.log(`[notification] SESSION_STARTED → ${clientRoom(userId)}`, payload);
    return;
  }

  io.of('/client').to(clientRoom(userId)).emit('SESSION_STARTED', payload);
}

export function forceLeaveUser(userId, reason = 'account_deactivated') {
  const io = getIo();
  if (!io) {
    console.log(`[notification] FORCE_LEAVE → ${clientRoom(userId)}`, { reason });
    return;
  }

  io.of('/client').to(clientRoom(userId)).emit('FORCE_LEAVE', {
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
    console.log(`[notification] REJOIN_ALLOWED → ${clientRoom(userId)}`, credentials);
    return;
  }

  io.of('/client').to(clientRoom(userId)).emit('REJOIN_ALLOWED', {
    sdkKey: credentials.sdkKey ?? process.env.ZOOM_SDK_KEY ?? null,
    meetingToken: credentials.sdkJwt ?? credentials.jwtToken ?? null,
    meetingNumber: credentials.meetingNumber ?? credentials.meetingId ?? null,
    password: credentials.password ?? credentials.meetingPassword ?? null,
    pending: credentials.pending ?? false,
  });
}

export async function sendStatusSync(socket, user) {
  const payload = await buildClientStatusPayload(user);
  socket.emit('STATUS_SYNC', payload);
}

export async function notifyUserActivated(userId, user) {
  const statusPayload = await buildClientStatusPayload(user);
  const meeting = statusPayload.shouldBeInMeeting
    ? {
        meetingId: statusPayload.meetingId,
        meetingPassword: statusPayload.meetingPassword,
        meetingHostUrl: statusPayload.meetingHostUrl,
        sdkKey: statusPayload.sdkKey ?? null,
        jwtToken: statusPayload.jwtToken,
      }
    : null;

  const io = getIo();
  if (!io) {
    console.log(`[notification] USER_ACTIVATED → ${clientRoom(userId)}`, meeting);
    return;
  }

  io.of('/client').to(clientRoom(userId)).emit('USER_ACTIVATED', meeting ?? {});

  if (meeting) {
    notifyRejoinAllowed(userId, {
      sdkKey: meeting.sdkKey,
      sdkJwt: meeting.jwtToken,
      meetingNumber: meeting.meetingId,
      password: meeting.meetingPassword,
    });
  }
}

export function notifyUserDeactivated(userId) {
  const io = getIo();
  if (!io) {
    console.log(`[notification] USER_DEACTIVATED → ${clientRoom(userId)}`);
    return;
  }

  io.of('/client').to(clientRoom(userId)).emit('USER_DEACTIVATED', {});
}

export function notifyAdminSessionStarted(meeting) {
  const io = getIo();
  if (!io) {
    console.log('[notification] session:started → admin:session', meeting);
    return;
  }

  io.of('/admin').to('admin:session').emit('session:started', { meeting });
}

export function notifyAdminSessionRevoked(adminId, activeSessionId) {
  const io = getIo();
  if (!io) {
    console.log(`[notification] admin:session:revoked → ${adminRoom(adminId)}`, { activeSessionId });
    return;
  }

  io.of('/admin').to(adminRoom(adminId)).emit('admin:session:revoked', {
    message: 'Logged in from another device.',
    activeSessionId,
  });
}

export function notifySessionEnded(userIds, meetingId = null) {
  const io = getIo();
  if (!io) {
    console.log(`[notification] SESSION_ENDED → ${userIds.length} client(s)`, { meetingId });
    return;
  }

  const clientNS = io.of('/client');
  for (const userId of userIds) {
    clientNS.to(clientRoom(userId)).emit('SESSION_ENDED');
    clientNS.to(clientRoom(userId)).emit('session:ended', { meetingId: meetingId ?? null });
  }
}

export function forceLogoutUser(userId, reason = 'SESSION_REVOKED') {
  const io = getIo();
  if (!io) {
    console.log(`[notification] FORCE_LOGOUT → ${clientRoom(userId)}`, { reason });
    return;
  }

  io.of('/client').to(clientRoom(userId)).emit('FORCE_LOGOUT', {
    type: 'FORCE_LOGOUT',
    status: 'LOGGED_OUT',
    reason,
    message: 'You have been logged out. Please login again.',
  });
}

export function notifyUserPresence(userId, isOnline) {
  const io = getIo();
  if (!io) {
    console.log(`[notification] user:presence → admins`, { userId, isOnline });
    return;
  }

  io.of('/admin').emit('user:presence', {
    userId: String(userId),
    isOnline: Boolean(isOnline),
  });
}

export function notifySubscriptionExpired() {
  const io = getIo();
  if (!io) {
    console.log('[notification] admin:subscription:expired → all admins');
    return;
  }

  io.of('/admin').emit('admin:subscription:expired', {
    message: 'Your subscription has ended. Please contact Administration for reactivating.',
  });
}

export function notifyAdminLicenseExpired(adminId) {
  const io = getIo();
  if (!io) {
    console.log(`[notification] admin:subscription:expired → admin:${adminId}`);
    return;
  }

  io.of('/admin').to(`admin:${adminId}`).emit('admin:subscription:expired', {
    message: 'Your subscription has ended. Please contact Administration for reactivating.',
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
