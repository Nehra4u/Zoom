import { verifyAdminAccessToken, verifyClientAccessToken } from '../services/tokenService.js';
import { RevokedToken } from '../models/RevokedToken.js';
import { assertSubscriptionActive } from '../services/settingsService.js';

async function isRevoked(jti) {
  if (!jti) return false;
  const found = await RevokedToken.exists({ jti });
  return Boolean(found);
}

export async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  try {
    const payload = verifyAdminAccessToken(header.slice(7));
    if (payload.type !== 'admin') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    if (await isRevoked(payload.jti)) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }
    try {
      await assertSubscriptionActive();
    } catch (err) {
      return res.status(err.status || 403).json({ error: err.message, code: err.code });
    }
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function adminOnly(req, res, next) {
  if (!req.admin || !['admin', 'super_admin'].includes(req.admin.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

export function superAdminOnly(req, res, next) {
  if (!req.admin || req.admin.role !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }
  next();
}

export async function authenticateClient(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  try {
    const payload = verifyClientAccessToken(header.slice(7));
    if (payload.type !== 'client') {
      return res.status(401).json({ error: 'Invalid token type' });
    }
    if (await isRevoked(payload.jti)) {
      return res.status(401).json({ error: 'Token has been revoked' });
    }
    req.client = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
