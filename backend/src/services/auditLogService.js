import { AuditLog } from '../models/AuditLog.js';
import { Admin } from '../models/Admin.js';
import { User } from '../models/User.js';

function toPublicLog(log, actorMap, targetUserMap) {
  const actorId = log.actorId?.toString();
  const targetUserId = log.targetUserId?.toString() ?? null;
  const targetUser = targetUserId ? targetUserMap.get(targetUserId) : null;
  return {
    id: log._id.toString(),
    actorId,
    actorName: actorMap.get(actorId)?.name ?? null,
    actorEmail: actorMap.get(actorId)?.email ?? null,
    actorRole: log.actorRole,
    action: log.action,
    targetAdminId: log.targetAdminId?.toString() ?? null,
    targetAdminName: actorMap.get(log.targetAdminId?.toString())?.name ?? null,
    targetUserId,
    // Additive: resolved name/phone for the target user, so the UI doesn't have to show raw IDs.
    targetUserName: targetUser?.name ?? null,
    targetUserPhone: targetUser?.phone ?? null,
    meta: log.meta ?? {},
    createdAt: log.createdAt,
  };
}

export async function listAuditLogs({ actorId, isSuperAdmin, filters = {} }) {
  const query = {};

  if (!isSuperAdmin) {
    query.actorId = actorId;
  }

  if (filters.action) query.action = filters.action;
  if (filters.targetUserId) query.targetUserId = filters.targetUserId;

  const limit = Math.min(parseInt(filters.limit ?? '100', 10), 500);

  const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(limit);

  const adminIds = [
    ...new Set(
      logs
        .flatMap((l) => [l.actorId?.toString(), l.targetAdminId?.toString()])
        .filter(Boolean)
    ),
  ];
  const admins = await Admin.find({ _id: { $in: adminIds } }).select('name email');
  const actorMap = new Map(admins.map((a) => [a._id.toString(), a]));

  const targetUserIds = [...new Set(logs.map((l) => l.targetUserId?.toString()).filter(Boolean))];
  const targetUsers = await User.find({ _id: { $in: targetUserIds } }).select('name phone');
  const targetUserMap = new Map(targetUsers.map((u) => [u._id.toString(), u]));

  return logs.map((log) => toPublicLog(log, actorMap, targetUserMap));
}
