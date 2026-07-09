import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { DeviceSession } from '../models/DeviceSession.js';
import { SessionState } from '../models/SessionState.js';
import { writeAuditLog } from './auditService.js';
import {
  forceLeaveUser,
  forceLogoutUser,
  notifySessionStarted,
  notifyUserActivated,
  notifyUserDeactivated,
} from './notificationService.js';
import { handleParticipantLeft } from './sessionService.js';
import { revokeOutstandingUserToken } from './zoomTokenService.js';
import { getUserForAdmin, userScopeQuery } from './adminScope.js';
import { getOnlineUserIds } from '../socket/index.js';

// Maximum number of APK user accounts that can exist at once (excludes deleted accounts).
export const MAX_USERS = 300;

function toPublicUser(user, deviceSession = null, onlineUserIds = null) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    phone: user.phone ?? null,
    status: user.status,
    zoomDisplayName: user.zoomDisplayName,
    createdBy: user.createdBy?.toString() ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastActiveAt: user.lastActiveAt,
    // Additive fields: last-seen falls back to lastActiveAt when no device session exists yet.
    lastSeenAt: deviceSession?.lastSeenAt ?? user.lastActiveAt ?? null,
    device: deviceSession
      ? {
          deviceId: deviceSession.deviceId,
          deviceModel: deviceSession.deviceModel,
          manufacturer: deviceSession.manufacturer,
          androidVersion: deviceSession.androidVersion,
          appVersion: deviceSession.appVersion,
          active: deviceSession.active,
          loggedOut: deviceSession.loggedOut,
        }
      : null,
    // "isOnline" = currently has a live /client websocket connection (distinct from
    // `status === 'active'`, which just means the account is eligible/activated).
    isOnline: onlineUserIds ? onlineUserIds.has(user._id.toString()) : false,
  };
}

async function getLatestDeviceSessionsByUserIds(userIds) {
  if (!userIds.length) return new Map();
  const sessions = await DeviceSession.find({ userId: { $in: userIds } }).sort({ lastSeenAt: -1 });
  const latestByUser = new Map();
  for (const session of sessions) {
    const key = session.userId.toString();
    if (!latestByUser.has(key)) latestByUser.set(key, session);
  }
  return latestByUser;
}

export async function listUsers(filters = {}, admin = null) {
  const query = { status: { $ne: 'deleted' }, ...userScopeQuery(admin) };
  if (filters.status) query.status = filters.status;

  const users = await User.find(query).sort({ createdAt: -1 });
  const deviceByUser = await getLatestDeviceSessionsByUserIds(users.map((u) => u._id));
  const onlineUserIds = getOnlineUserIds();
  return users.map((user) =>
    toPublicUser(user, deviceByUser.get(user._id.toString()) ?? null, onlineUserIds)
  );
}

export async function getUserById(id, admin = null) {
  let user;
  if (admin) {
    user = await getUserForAdmin(admin, id);
    if (!user) return null;
  } else {
    user = await User.findOne({ _id: id, status: { $ne: 'deleted' } });
    if (!user) return null;
  }

  const deviceSession = await DeviceSession.findOne({ userId: user._id }).sort({ lastSeenAt: -1 });
  return toPublicUser(user, deviceSession, getOnlineUserIds());
}

export async function createUser({ name, email, phone, password, zoomDisplayName, status, createdBy }) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    const err = new Error('Email already in use');
    err.status = 409;
    throw err;
  }

  const activeUserCount = await User.countDocuments({ status: { $ne: 'deleted' } });
  if (activeUserCount >= MAX_USERS) {
    const err = new Error(`User limit reached — a maximum of ${MAX_USERS} users can be created`);
    err.status = 400;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await User.create({
    name,
    email: email.toLowerCase(),
    phone: phone || null,
    passwordHash,
    zoomDisplayName: zoomDisplayName || name,
    status: status ?? 'pending',
    createdBy: createdBy.sub,
  });

  await writeAuditLog({
    actor: createdBy,
    action: 'user_created',
    targetUserId: user._id,
    meta: { status: user.status },
  });

  return toPublicUser(user);
}

export async function updateUser(id, updates, actor) {
  const user = await getUserForAdmin(actor, id);
  if (!user) {
    const err = new Error('User not found or access denied');
    err.status = 403;
    throw err;
  }

  if (updates.email && updates.email.toLowerCase() !== user.email) {
    const existing = await User.findOne({ email: updates.email.toLowerCase() });
    if (existing) {
      const err = new Error('Email already in use');
      err.status = 409;
      throw err;
    }
    user.email = updates.email.toLowerCase();
  }

  if (updates.name !== undefined) user.name = updates.name;
  const phoneChanged =
    updates.phone !== undefined && (updates.phone || null) !== (user.phone || null);
  if (updates.phone !== undefined) user.phone = updates.phone || null;
  if (updates.zoomDisplayName !== undefined) user.zoomDisplayName = updates.zoomDisplayName;
  if (updates.status !== undefined) user.status = updates.status;

  await user.save();

  await writeAuditLog({
    actor,
    action: 'user_updated',
    targetUserId: user._id,
    meta: { updated: Object.keys(updates), phoneChanged },
  });

  if (phoneChanged) {
    return logoutUserDevices(id, actor);
  }

  const deviceSession = await DeviceSession.findOne({ userId: user._id }).sort({ lastSeenAt: -1 });
  return toPublicUser(user, deviceSession, getOnlineUserIds());
}

export async function activateUser(id, actor) {
  const user = await getUserForAdmin(actor, id);
  if (!user) {
    const err = new Error('User not found or access denied');
    err.status = 403;
    throw err;
  }

  user.status = 'active';
  await user.save();

  await writeAuditLog({
    actor,
    action: 'user_activated',
    targetUserId: user._id,
  });

  await notifyUserActivated(user._id.toString(), user);

  return toPublicUser(user);
}

export async function deactivateUser(id, actor) {
  const user = await getUserForAdmin(actor, id);
  if (!user) {
    const err = new Error('User not found or access denied');
    err.status = 403;
    throw err;
  }

  user.status = 'inactive';
  await user.save();

  await writeAuditLog({
    actor,
    action: 'user_deactivated',
    targetUserId: user._id,
  });

  await writeAuditLog({
    actor,
    action: 'user_force_dropped',
    targetUserId: user._id,
  });

  await revokeOutstandingUserToken(user, actor);

  notifyUserDeactivated(user._id.toString());
  forceLeaveUser(user._id.toString());

  const activeSession = await SessionState.findOne({ userId: user._id, inCall: true });
  if (activeSession) {
    await handleParticipantLeft({
      userId: user._id,
      zoomParticipantId: activeSession.zoomParticipantId,
    });
  } else {
    await handleParticipantLeft({ userId: user._id });
  }

  return toPublicUser(user);
}

// Additive: force-logs-out a user's devices without changing their account status
// (distinct from deactivate, which also disables the account).
export async function logoutUserDevices(id, actor) {
  const user = await getUserForAdmin(actor, id);
  if (!user) {
    const err = new Error('User not found or access denied');
    err.status = 403;
    throw err;
  }

  await DeviceSession.updateMany(
    { userId: user._id, active: true },
    { $set: { active: false, loggedOut: true } }
  );

  await writeAuditLog({
    actor,
    action: 'user_logged_out',
    targetUserId: user._id,
  });

  await revokeOutstandingUserToken(user, actor);

  // Tell the client it's actually logged out (clears its session), not just removed from a call.
  forceLogoutUser(user._id.toString(), 'admin_logout');

  const activeSession = await SessionState.findOne({ userId: user._id, inCall: true });
  if (activeSession) {
    await handleParticipantLeft({
      userId: user._id,
      zoomParticipantId: activeSession.zoomParticipantId,
    });
  }

  const deviceSession = await DeviceSession.findOne({ userId: user._id }).sort({ lastSeenAt: -1 });
  return toPublicUser(user, deviceSession);
}

export async function deleteUser(id, actor) {
  const user = await getUserForAdmin(actor, id);
  if (!user) {
    const err = new Error('User not found or access denied');
    err.status = 403;
    throw err;
  }

  if (user.status === 'active') {
    await revokeOutstandingUserToken(user, actor);
    forceLeaveUser(user._id.toString(), 'account_deleted');
    const activeSession = await SessionState.findOne({ userId: user._id, inCall: true });
    if (activeSession) {
      await handleParticipantLeft({
        userId: user._id,
        zoomParticipantId: activeSession.zoomParticipantId,
      });
    }
  }

  user.status = 'deleted';
  user.deletedAt = new Date();
  await user.save();

  await writeAuditLog({
    actor,
    action: 'user_deleted',
    targetUserId: user._id,
  });

  return toPublicUser(user);
}

export { toPublicUser };
