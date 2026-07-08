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

const MAX_FAILED = 5;
const LOCKOUT_MINUTES = 5;

export async function loginAdmin(email, password) {
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
  notifyAdminSessionRevoked(admin._id.toString());

  const accessToken = signAdminAccessToken(admin);
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

export async function refreshAdminToken(refreshToken) {
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

  const accessToken = signAdminAccessToken(admin);
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

export { verifyAdminAccessToken };
