import bcrypt from 'bcrypt';
import { Admin } from '../models/Admin.js';
import { AdminRefreshToken } from '../models/AdminRefreshToken.js';
import { RevokedToken } from '../models/RevokedToken.js';
import {
  hashToken,
  signAdminAccessToken,
  signAdminRefreshToken,
  verifyAdminAccessToken,
  decodeTokenUnsafe,
} from '../services/tokenService.js';
import { toPublicAdmin } from '../services/adminService.js';
import { notifyAdminSessionRevoked } from './notificationService.js';
import { assertSubscriptionActive } from './settingsService.js';

const MAX_FAILED = 5;
const LOCKOUT_MINUTES = 5;

export async function loginAdmin(email, password) {
  await assertSubscriptionActive();

  const admin = await Admin.findOne({ email: email.toLowerCase(), status: { $ne: 'deleted' } });
  if (!admin || admin.status !== 'active') {
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  // Check lockout
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    const mins = Math.ceil((admin.lockedUntil - Date.now()) / 60000);
    const err = new Error(`Account locked due to too many failed attempts. Try again in ${mins} minute(s).`);
    err.status = 429;
    throw err;
  }

  const valid = await bcrypt.compare(password, admin.passwordHash);
  if (!valid) {
    admin.failedLoginAttempts = (admin.failedLoginAttempts || 0) + 1;
    if (admin.failedLoginAttempts >= MAX_FAILED) {
      admin.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    }
    await admin.save();
    const err = new Error('Invalid credentials');
    err.status = 401;
    throw err;
  }

  // Reset on success
  if (admin.failedLoginAttempts > 0 || admin.lockedUntil) {
    admin.failedLoginAttempts = 0;
    admin.lockedUntil = null;
  }

  admin.lastLoginAt = new Date();
  await admin.save();

  await AdminRefreshToken.updateMany(
    { adminId: admin._id, revokedAt: null },
    { revokedAt: new Date() }
  );

  const { token: accessToken, sessionId } = signAdminAccessToken(admin);
  notifyAdminSessionRevoked(admin._id.toString(), sessionId);

  const refresh = signAdminRefreshToken(admin._id);
  await AdminRefreshToken.create({
    adminId: admin._id,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
  });

  return {
    accessToken,
    refreshToken: refresh.token,
    admin: toPublicAdmin(admin),
    sessionId,
  };
}

export async function refreshAdminToken(refreshToken) {
  await assertSubscriptionActive();

  const tokenHash = hashToken(refreshToken);
  const stored = await AdminRefreshToken.findOne({ tokenHash, revokedAt: null });
  if (!stored || stored.expiresAt < new Date()) {
    const err = new Error('Invalid refresh token');
    err.status = 401;
    throw err;
  }

  const admin = await Admin.findById(stored.adminId);
  if (!admin || admin.status !== 'active') {
    const err = new Error('Account inactive');
    err.status = 403;
    throw err;
  }

  stored.revokedAt = new Date();
  await stored.save();

  const { token: accessToken } = signAdminAccessToken(admin);
  const refresh = signAdminRefreshToken(admin._id);
  await AdminRefreshToken.create({
    adminId: admin._id,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
  });

  return {
    accessToken,
    refreshToken: refresh.token,
    admin: toPublicAdmin(admin),
  };
}

export async function logoutAdmin(refreshToken, accessToken) {
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await AdminRefreshToken.updateOne({ tokenHash, revokedAt: null }, { revokedAt: new Date() });
  }

  if (accessToken) {
    const payload = decodeTokenUnsafe(accessToken);
    if (payload?.jti && payload?.sub && payload?.exp) {
      await RevokedToken.updateOne(
        { jti: payload.jti },
        { jti: payload.jti, userId: payload.sub, expiresAt: new Date(payload.exp * 1000) },
        { upsert: true }
      ).catch(() => {});
    }
  }
}

export async function getCurrentAdminProfile(adminId) {
  const admin = await Admin.findOne({ _id: adminId, status: { $ne: 'deleted' } });
  if (!admin) {
    const err = new Error('Admin not found');
    err.status = 404;
    throw err;
  }
  return toPublicAdmin(admin);
}

export async function updateCurrentAdminProfile(adminId, updates) {
  const admin = await Admin.findOne({ _id: adminId, status: { $ne: 'deleted' } });
  if (!admin) {
    const err = new Error('Admin not found');
    err.status = 404;
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

  if (updates.name !== undefined) admin.name = updates.name;
  await admin.save();

  return toPublicAdmin(admin);
}

export async function changeCurrentAdminPassword(adminId, currentPassword, newPassword) {
  const admin = await Admin.findOne({ _id: adminId, status: { $ne: 'deleted' } });
  if (!admin) {
    const err = new Error('Admin not found');
    err.status = 404;
    throw err;
  }

  const valid = await bcrypt.compare(currentPassword, admin.passwordHash);
  if (!valid) {
    const err = new Error('Current password is incorrect');
    err.status = 401;
    throw err;
  }

  admin.passwordHash = await bcrypt.hash(newPassword, 12);
  await admin.save();

  return { ok: true };
}

export { verifyAdminAccessToken };
