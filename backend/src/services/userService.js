import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { DeviceSession } from '../models/DeviceSession.js';
import { SessionState } from '../models/SessionState.js';
import { writeAuditLog } from './auditService.js';
import {
  forceLeaveUser,
  forceLogoutUser,
  notifyUserActivated,
  notifyUserDeactivated,
} from './notificationService.js';
import { handleParticipantLeft } from './sessionService.js';
import { revokeOutstandingUserToken } from './zoomTokenService.js';
import { getUserForAdmin, userScopeQuery, assertRegularAdmin } from './adminScope.js';
import { getOnlineUserIds } from '../socket/index.js';

export const MAX_USERS = 300;

function toPublicUser(user, deviceSession = null, onlineUserIds = null) {
  return {
    id: user._id.toString(),
    username: user.username,
    name: user.name,
    email: user.email ?? null,
    phone: user.phone ?? null,
    status: user.status,
    zoomDisplayName: user.zoomDisplayName,
    createdBy: user.createdBy?.toString() ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    lastActiveAt: user.lastActiveAt,
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

export async function createUser({ username, phone, email, password, status, createdBy }) {
  assertRegularAdmin(createdBy);
  const normalizedUsername = String(username ?? '').toLowerCase().trim();
  if (!normalizedUsername) {
    const err = new Error('Username is required');
    err.status = 400;
    throw err;
  }

  const existing = await User.findOne({ username: normalizedUsername });
  if (existing) {
    const err = new Error('Username already in use');
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
    username: normalizedUsername,
    name: normalizedUsername,
    email: email ? String(email).toLowerCase().trim() : null,
    phone: phone || null,
    passwordHash,
    zoomDisplayName: normalizedUsername,
    status: status ?? 'active',
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
  assertRegularAdmin(actor);
  const user = await getUserForAdmin(actor, id);
  if (!user) {
    const err = new Error('User not found or access denied');
    err.status = 403;
    throw err;
  }

  if (updates.username !== undefined) {
    const normalizedUsername = String(updates.username).toLowerCase().trim();
    if (!normalizedUsername) {
      const err = new Error('Username cannot be empty');
      err.status = 400;
      throw err;
    }
    if (normalizedUsername !== user.username) {
      const existing = await User.findOne({ username: normalizedUsername });
      if (existing) {
        const err = new Error('Username already in use');
        err.status = 409;
        throw err;
      }
      user.username = normalizedUsername;
      user.name = normalizedUsername;
      if (!updates.zoomDisplayName) {
        user.zoomDisplayName = normalizedUsername;
      }
    }
  }

  if (updates.email !== undefined) {
    user.email = updates.email ? String(updates.email).toLowerCase().trim() : null;
  }

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
  assertRegularAdmin(actor);
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
  assertRegularAdmin(actor);
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

export async function logoutUserDevices(id, actor) {
  assertRegularAdmin(actor);
  const user = await getUserForAdmin(actor, id);
  if (!user) {
    const err = new Error('User not found or access denied');
    err.status = 403;
    throw err;
  }

  await writeAuditLog({
    actor,
    action: 'user_logged_out',
    targetUserId: user._id,
  });

  await revokeOutstandingUserToken(user, actor);

  forceLogoutUser(user._id.toString(), 'admin_logout');

  const activeSession = await SessionState.findOne({ userId: user._id, inCall: true });
  if (activeSession) {
    await handleParticipantLeft({
      userId: user._id,
      zoomParticipantId: activeSession.zoomParticipantId,
    });
  }

  await DeviceSession.deleteMany({ userId: user._id });

  return toPublicUser(user, null, getOnlineUserIds());
}

export async function deleteUser(id, actor) {
  assertRegularAdmin(actor);
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
