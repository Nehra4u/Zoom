import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { RevokedToken } from '../models/RevokedToken.js';
import { User } from '../models/User.js';
import { getMeetingCredentials } from './zoomApi.js';
import { writeAuditLog } from './auditService.js';

const SDK_TTL_SEC = 20 * 60;

export function generateZoomSdkJwt(meetingNumber, role = 0) {
  const sdkKey = process.env.ZOOM_SDK_KEY;
  const sdkSecret = process.env.ZOOM_SDK_SECRET;

  if (!sdkKey || !sdkSecret) {
    if (process.env.ZOOM_MOCK === 'true' || process.env.NODE_ENV === 'development') {
      const jti = crypto.randomUUID();
      return {
        token: `mock-sdk-jwt.${jti}`,
        jti,
        expiresAt: new Date(Date.now() + SDK_TTL_SEC * 1000),
      };
    }
    const err = new Error('Zoom SDK credentials are not configured');
    err.status = 503;
    throw err;
  }

  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + SDK_TTL_SEC;
  const jti = crypto.randomUUID();

  const payload = {
    appKey: sdkKey,
    sdkKey,
    mn: meetingNumber,
    role,
    iat,
    exp,
    tokenExp: exp,
    jti,
  };

  const token = jwt.sign(payload, sdkSecret);
  return { token, jti, expiresAt: new Date(exp * 1000) };
}

export async function revokeUserSdkToken(userId, jti, expiresAt) {
  if (!jti) return;
  await RevokedToken.updateOne(
    { jti },
    { jti, userId, expiresAt: expiresAt ?? new Date(Date.now() + SDK_TTL_SEC * 1000) },
    { upsert: true }
  );
}

export async function isSdkJtiRevoked(jti) {
  if (!jti) return false;
  const found = await RevokedToken.findOne({ jti });
  return Boolean(found);
}

export async function issueZoomCredentialsForUser(user, actor = null) {
  if (user.status !== 'active') {
    const err = new Error('User account is not active');
    err.status = 403;
    throw err;
  }

  const useMock =
    process.env.ZOOM_MOCK === 'true' ||
    process.env.NODE_ENV === 'development' ||
    !process.env.ZOOM_SDK_KEY;

  let meetingNumber = '';
  let password = '';

  const userId = user._id ?? user.id;
  const doc = await User.findById(userId);

  if (!useMock) {
    const { getLiveMeetingForAdmin } = await import('./meetingService.js');
    const liveMeeting = await getLiveMeetingForAdmin(doc?.createdBy?.toString());
    if (!liveMeeting) {
      const err = new Error('No live meeting — wait for admin to start a session');
      err.status = 503;
      throw err;
    }
    meetingNumber = liveMeeting.meetingNumber;
    password = liveMeeting.password ?? '';
  }

  if (doc?.lastSdkJti) {
    await revokeUserSdkToken(userId, doc.lastSdkJti, doc.lastSdkJtiExpiresAt);
  }

  const { token: sdkJwt, jti, expiresAt } = generateZoomSdkJwt(meetingNumber || '0000000000');
  await User.findByIdAndUpdate(userId, {
    lastSdkJti: jti,
    lastSdkJtiExpiresAt: expiresAt,
  });

  if (actor) {
    await writeAuditLog({
      actor,
      action: 'token_issued',
      targetUserId: userId,
      meta: { jti },
    });
  }

  return {
    sdkJwt,
    meetingNumber: meetingNumber || '0000000000',
    password: password || '',
    jti,
  };
}

export async function revokeOutstandingUserToken(user, actor = null) {
  const userId = user._id ?? user.id;
  const doc = await User.findById(userId);
  if (!doc?.lastSdkJti) return;

  await revokeUserSdkToken(userId, doc.lastSdkJti, doc.lastSdkJtiExpiresAt);

  if (actor) {
    await writeAuditLog({
      actor,
      action: 'token_revoked',
      targetUserId: userId,
      meta: { jti: doc.lastSdkJti },
    });
  }
}
