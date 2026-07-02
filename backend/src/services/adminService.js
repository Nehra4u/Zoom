import bcrypt from 'bcrypt';
import { Admin } from '../models/Admin.js';
import { AdminRefreshToken } from '../models/AdminRefreshToken.js';
import { writeAuditLog } from './auditService.js';

function toPublicAdmin(admin) {
  return {
    id: admin._id.toString(),
    name: admin.name,
    email: admin.email,
    role: admin.role,
    status: admin.status,
    createdBy: admin.createdBy?.toString() ?? null,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
    lastLoginAt: admin.lastLoginAt,
    zoomHostUserId: admin.zoomHostUserId ?? null,
  };
}

export async function listAdmins(filters = {}) {
  const query = { status: { $ne: 'deleted' } };
  if (filters.status) query.status = filters.status;
  if (filters.role) query.role = filters.role;

  const admins = await Admin.find(query).sort({ createdAt: -1 });
  return admins.map(toPublicAdmin);
}

export async function getAdminById(id) {
  const admin = await Admin.findOne({ _id: id, status: { $ne: 'deleted' } });
  if (!admin) return null;
  return toPublicAdmin(admin);
}

export async function createAdmin({ name, email, password, role = 'admin', createdBy }) {
  const existing = await Admin.findOne({ email: email.toLowerCase() });
  if (existing) {
    const err = new Error('Email already in use');
    err.status = 409;
    throw err;
  }

  if (role === 'super_admin' && createdBy.role !== 'super_admin') {
    const err = new Error('Only super admins can create super admin accounts');
    err.status = 403;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const admin = await Admin.create({
    name,
    email: email.toLowerCase(),
    passwordHash,
    role,
    createdBy: createdBy.sub,
  });

  await writeAuditLog({
    actor: createdBy,
    action: 'admin_created',
    targetAdminId: admin._id,
    meta: { role },
  });

  return toPublicAdmin(admin);
}

export async function updateAdmin(id, updates, actor) {
  const admin = await Admin.findOne({ _id: id, status: { $ne: 'deleted' } });
  if (!admin) {
    const err = new Error('Admin not found');
    err.status = 404;
    throw err;
  }

  if (updates.role === 'super_admin' && actor.role !== 'super_admin') {
    const err = new Error('Only super admins can assign super admin role');
    err.status = 403;
    throw err;
  }

  if (updates.email && updates.email.toLowerCase() !== admin.email) {
    const existing = await Admin.findOne({ email: updates.email.toLowerCase() });
    if (existing) {
      const err = new Error('Email already in use');
      err.status = 409;
      throw err;
    }
    admin.email = updates.email.toLowerCase();
  }

  if (updates.name) admin.name = updates.name;
  if (updates.role) admin.role = updates.role;
  if (updates.zoomHostUserId !== undefined) {
    admin.zoomHostUserId = updates.zoomHostUserId || null;
  }

  await admin.save();

  await writeAuditLog({
    actor,
    action: 'admin_updated',
    targetAdminId: admin._id,
    meta: updates,
  });

  return toPublicAdmin(admin);
}

async function countActiveSuperAdmins(excludeId = null) {
  const query = { role: 'super_admin', status: 'active' };
  if (excludeId) query._id = { $ne: excludeId };
  return Admin.countDocuments(query);
}

export async function deactivateAdmin(id, actor) {
  if (id === actor.sub) {
    const err = new Error('Cannot deactivate your own account');
    err.status = 400;
    throw err;
  }

  const admin = await Admin.findOne({ _id: id, status: { $ne: 'deleted' } });
  if (!admin) {
    const err = new Error('Admin not found');
    err.status = 404;
    throw err;
  }

  if (admin.role === 'super_admin') {
    const count = await countActiveSuperAdmins(admin._id);
    if (count === 0) {
      const err = new Error('Cannot deactivate the last active super admin');
      err.status = 400;
      throw err;
    }
  }

  admin.status = 'inactive';
  await admin.save();
  await AdminRefreshToken.updateMany({ adminId: admin._id, revokedAt: null }, { revokedAt: new Date() });

  await writeAuditLog({
    actor,
    action: 'admin_deactivated',
    targetAdminId: admin._id,
  });

  return toPublicAdmin(admin);
}

export async function activateAdmin(id, actor) {
  const admin = await Admin.findOne({ _id: id, status: { $ne: 'deleted' } });
  if (!admin) {
    const err = new Error('Admin not found');
    err.status = 404;
    throw err;
  }

  admin.status = 'active';
  await admin.save();

  await writeAuditLog({
    actor,
    action: 'admin_activated',
    targetAdminId: admin._id,
  });

  return toPublicAdmin(admin);
}

export async function deleteAdmin(id, actor) {
  if (id === actor.sub) {
    const err = new Error('Cannot delete your own account');
    err.status = 400;
    throw err;
  }

  const admin = await Admin.findOne({ _id: id, status: { $ne: 'deleted' } });
  if (!admin) {
    const err = new Error('Admin not found');
    err.status = 404;
    throw err;
  }

  if (admin.role === 'super_admin') {
    const count = await countActiveSuperAdmins(admin._id);
    if (count === 0) {
      const err = new Error('Cannot delete the last active super admin');
      err.status = 400;
      throw err;
    }
  }

  admin.status = 'deleted';
  admin.deletedAt = new Date();
  await admin.save();
  await AdminRefreshToken.updateMany({ adminId: admin._id, revokedAt: null }, { revokedAt: new Date() });

  await writeAuditLog({
    actor,
    action: 'admin_deleted',
    targetAdminId: admin._id,
  });

  return toPublicAdmin(admin);
}

export { toPublicAdmin };
