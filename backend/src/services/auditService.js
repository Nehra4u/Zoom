import { AuditLog } from '../models/AuditLog.js';

export async function writeAuditLog({ actor, action, targetAdminId = null, targetUserId = null, meta = {} }) {
  await AuditLog.create({
    actorId: actor.sub ?? actor._id,
    actorRole: actor.role,
    action,
    targetAdminId,
    targetUserId,
    meta,
  });
}
