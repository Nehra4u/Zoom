import { User } from '../models/User.js';

export function userScopeQuery(admin) {
  if (!admin || admin.role === 'super_admin') return {};
  return { createdBy: admin.sub };
}

export function recordingScopeQuery(admin) {
  if (!admin || admin.role === 'super_admin') return {};
  return { startedBy: admin.sub };
}

export function ownsUser(admin, user) {
  if (!user) return false;
  if (admin.role === 'super_admin') return true;
  return user.createdBy?.toString() === admin.sub;
}

export function canManageMeeting(admin, meeting) {
  if (!meeting) return false;
  if (admin.role === 'super_admin') return true;
  return meeting.startedBy?.toString() === admin.sub;
}

export async function getUserForAdmin(admin, userId) {
  const query = { _id: userId, status: { $ne: 'deleted' }, ...userScopeQuery(admin) };
  return User.findOne(query);
}

export async function assertAdminOwnsUser(admin, userId) {
  const user = await getUserForAdmin(admin, userId);
  if (!user) {
    const err = new Error('User not found or access denied');
    err.status = 403;
    throw err;
  }
  return user;
}

export async function assertCanManageMeeting(admin, meeting) {
  if (!canManageMeeting(admin, meeting)) {
    const err = new Error('You can only manage meetings you started');
    err.status = 403;
    throw err;
  }
  return meeting;
}
