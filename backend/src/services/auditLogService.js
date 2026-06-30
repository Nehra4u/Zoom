import { AuditLog } from '../models/AuditLog.js';
import { Admin } from '../models/Admin.js';

function toPublicLog(log, actorMap) {
  const actorId = log.actorId?.toString();
  return {
    id: log._id.toString(),
    actorId,
    actorName: actorMap.get(actorId)?.name ?? null,
    actorEmail: actorMap.get(actorId)?.email ?? null,
    actorRole: log.actorRole,
    action: log.action,
    targetAdminId: log.targetAdminId?.toString() ?? null,
    targetUserId: log.targetUserId?.toString() ?? null,
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

  const actorIds = [...new Set(logs.map((l) => l.actorId?.toString()).filter(Boolean))];
  const actors = await Admin.find({ _id: { $in: actorIds } }).select('name email');
  const actorMap = new Map(actors.map((a) => [a._id.toString(), a]));

  return logs.map((log) => toPublicLog(log, actorMap));
}
