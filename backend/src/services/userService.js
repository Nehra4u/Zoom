import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { SessionState } from '../models/SessionState.js';
import { writeAuditLog } from './auditService.js';
import { forceLeaveUser, notifyRejoinAllowed } from './notificationService.js';
import { handleParticipantLeft } from './sessionService.js';
import { issueZoomCredentialsForUser, revokeOutstandingUserToken } from './zoomTokenService.js';
import { getUserForAdmin, userScopeQuery } from './adminScope.js';

function toPublicUser(user) {
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
  };
}

export async function listUsers(filters = {}, admin = null) {
  const query = { status: { $ne: 'deleted' }, ...userScopeQuery(admin) };
  if (filters.status) query.status = filters.status;

  const users = await User.find(query).sort({ createdAt: -1 });
  return users.map(toPublicUser);
}

export async function getUserById(id, admin = null) {
  if (admin) {
    const user = await getUserForAdmin(admin, id);
    return user ? toPublicUser(user) : null;
  }

  const user = await User.findOne({ _id: id, status: { $ne: 'deleted' } });
  if (!user) return null;
  return toPublicUser(user);
}

export async function createUser({ name, email, phone, password, zoomDisplayName, status, createdBy }) {
  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    const err = new Error('Email already in use');
    err.status = 409;
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
  if (updates.phone !== undefined) user.phone = updates.phone || null;
  if (updates.zoomDisplayName !== undefined) user.zoomDisplayName = updates.zoomDisplayName;
  if (updates.status !== undefined) user.status = updates.status;

  await user.save();

  await writeAuditLog({
    actor,
    action: 'user_updated',
    targetUserId: user._id,
    meta: { updated: Object.keys(updates) },
  });

  return toPublicUser(user);
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

  const credentials = await issueZoomCredentialsForUser(user, actor);
  notifyRejoinAllowed(user._id.toString(), {
    sdkJwt: credentials.sdkJwt,
    meetingNumber: credentials.meetingNumber,
    password: credentials.password,
  });

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
