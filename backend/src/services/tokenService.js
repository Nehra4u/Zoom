import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const ACCESS_TTL = '1h';
const CLIENT_ACCESS_TTL = '15m';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function adminSecret() {
  const s = process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error('JWT_ACCESS_SECRET is not set');
  return s;
}

function clientSecret() {
  const s = process.env.JWT_CLIENT_SECRET || process.env.JWT_ACCESS_SECRET;
  if (!s) throw new Error('JWT_CLIENT_SECRET is not set');
  return s;
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signAdminAccessToken(admin, sessionId = crypto.randomBytes(16).toString('hex')) {
  const jti = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(
    {
      sub: admin._id.toString(),
      role: admin.role,
      type: 'admin',
      email: admin.email,
      jti,
      sid: sessionId,
    },
    adminSecret(),
    { expiresIn: ACCESS_TTL }
  );
  return { token, sessionId };
}

export function signAdminRefreshToken(adminId) {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  return { token, expiresAt, tokenHash: hashToken(token) };
}

export function verifyAdminAccessToken(token) {
  return jwt.verify(token, adminSecret());
}

export function signClientAccessToken(user) {
  const jti = crypto.randomBytes(16).toString('hex');
  return jwt.sign(
    {
      sub: user._id.toString(),
      type: 'client',
      username: user.username,
      jti,
    },
    clientSecret(),
    { expiresIn: CLIENT_ACCESS_TTL }
  );
}

export function signClientRefreshToken(userId) {
  const token = crypto.randomBytes(48).toString('hex');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  return { token, expiresAt, tokenHash: hashToken(token) };
}

export function verifyClientAccessToken(token) {
  return jwt.verify(token, clientSecret());
}

export function decodeTokenUnsafe(token) {
  return jwt.decode(token);
}
