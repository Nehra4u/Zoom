import bcrypt from 'bcrypt';
import { User } from '../models/User.js';
import { UserRefreshToken } from '../models/UserRefreshToken.js';
import { DeviceSession, generateSessionId } from '../models/DeviceSession.js';
import { RevokedToken } from '../models/RevokedToken.js';
import {
  hashToken,
  signClientAccessToken,
  signClientRefreshToken,
  decodeTokenUnsafe,
} from './tokenService.js';

function toPublicClient(user) {
  return {
    userId: user._id.toString(),
    username: user.username,
    name: user.name,
    email: user.email ?? null,
    phone: user.phone ?? null,
    active: user.status === 'active',
    status: user.status,
    zoomDisplayName: user.zoomDisplayName,
  };
}

const MAX_FAILED = 5;
const LOCKOUT_MINUTES = 5;

export async function loginClient(loginId, password, device = {}) {
  const { deviceId, deviceModel, manufacturer, androidVersion, appVersion } = device;

  const normalizedLoginId = String(loginId ?? '').toLowerCase().trim();
  let user = await User.findOne({ username: normalizedLoginId, status: { $ne: 'deleted' } });
  if (!user) {
    user = await User.findOne({ email: normalizedLoginId, status: { $ne: 'deleted' } });
  }

  if (!user) {
    return { success: false, status: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' };
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const mins = Math.ceil((user.lockedUntil - Date.now()) / 60000);
    return {
      success: false,
      status: 'ACCOUNT_LOCKED',
      message: `Account locked due to too many failed attempts. Try again in ${mins} minute(s).`,
    };
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED) {
      user.lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000);
    }
    await user.save();
    return { success: false, status: 'INVALID_CREDENTIALS', message: 'Invalid username or password.' };
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await user.save();
  }

  if (user.status === 'pending') {
    return { success: false, status: 'USER_INACTIVE', message: 'Your account is inactive. Please contact support.' };
  }

  if (user.status === 'inactive') {
    return { success: false, status: 'USER_DEACTIVATED', message: 'Your account has been deactivated. Please contact support.' };
  }

  if (deviceId) {
    const activeSession = await DeviceSession.findOne({
      userId: user._id,
      active: true,
      loggedOut: false,
    });

    if (activeSession && activeSession.deviceId !== deviceId) {
      return {
        success: false,
        status: 'DEVICE_CONFLICT',
        message: 'This account is already active on another device.',
        activeDevice: {
          deviceModel: activeSession.deviceModel ?? null,
          manufacturer: activeSession.manufacturer ?? null,
          lastSeenAt: activeSession.lastSeenAt?.toISOString() ?? null,
        },
      };
    }
  }

  const accessToken = signClientAccessToken(user);
  const refresh = signClientRefreshToken(user._id);
  await UserRefreshToken.create({
    userId: user._id,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
  });

  const sessionId = generateSessionId();
  if (deviceId) {
    await DeviceSession.findOneAndUpdate(
      { userId: user._id, deviceId },
      {
        sessionId,
        deviceModel: deviceModel ?? null,
        manufacturer: manufacturer ?? null,
        androidVersion: androidVersion ?? null,
        appVersion: appVersion ?? null,
        active: true,
        loggedOut: false,
        lastSeenAt: new Date(),
      },
      { upsert: true, new: true }
    );
  }

  const session = { sessionId, userId: user._id.toString(), deviceId: deviceId ?? null };

  const response = {
    success: true,
    status: 'SUCCESS',
    message: 'Login successful.',
    session,
    user: toPublicClient(user),
    accessToken,
    refreshToken: refresh.token,
    sdkKey: process.env.ZOOM_SDK_KEY ?? null,
  };

  return response;
}

export async function refreshClientToken(refreshToken) {
  const tokenHash = hashToken(refreshToken);
  const stored = await UserRefreshToken.findOne({ tokenHash, revokedAt: null });
  if (!stored || stored.expiresAt < new Date()) {
    const err = new Error('Invalid refresh token');
    err.status = 401;
    throw err;
  }

  const user = await User.findById(stored.userId);
  if (!user || user.status === 'deleted') {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }

  if (user.status === 'pending') {
    const err = new Error('Account inactive');
    err.status = 403;
    err.code = 'USER_INACTIVE';
    throw err;
  }

  if (user.status === 'inactive') {
    const err = new Error('Account deactivated');
    err.status = 403;
    err.code = 'USER_DEACTIVATED';
    throw err;
  }

  stored.revokedAt = new Date();
  await stored.save();

  const accessToken = signClientAccessToken(user);
  const newRefresh = signClientRefreshToken(user._id);
  await UserRefreshToken.create({
    userId: user._id,
    tokenHash: newRefresh.tokenHash,
    expiresAt: newRefresh.expiresAt,
  });

  return {
    accessToken,
    refreshToken: newRefresh.token,
    user: toPublicClient(user),
  };
}

export async function logoutClient(refreshToken, { userId, sessionId, deviceId, accessToken } = {}) {
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await UserRefreshToken.updateOne({ tokenHash, revokedAt: null }, { revokedAt: new Date() });
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

  if (deviceId && userId) {
    await DeviceSession.updateOne(
      { userId, deviceId, loggedOut: false },
      { active: false, loggedOut: true }
    );
  } else if (sessionId) {
    await DeviceSession.updateOne(
      { sessionId, loggedOut: false },
      { active: false, loggedOut: true }
    );
  }
}

export { toPublicClient };
