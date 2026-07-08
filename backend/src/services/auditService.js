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

export async function writeAutomaticAuditLog({ action, meta = {} }) {
  const { Admin } = await import('../models/Admin.js');
  const systemAdmin = await Admin.findOne({ role: 'super_admin', status: 'active' }).sort({ createdAt: 1 });
  if (!systemAdmin) {
    console.warn('[audit] Skipping automatic audit log — no active super admin:', action);
    return;
  }

  await AuditLog.create({
    actorId: systemAdmin._id,
    actorRole: 'super_admin',
    action,
    meta: { ...meta, automatic: true },
  });
}
