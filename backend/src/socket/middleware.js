import { verifyAdminAccessToken, verifyClientAccessToken } from '../services/tokenService.js';
import { assertAdminSessionActive } from '../services/authService.js';
import { assertAdminLicenseActive } from '../services/adminLicenseService.js';

export function authenticateAdminSocket(socket, next) {
  (async () => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }
      const payload = verifyAdminAccessToken(token);
      if (payload.type !== 'admin') {
        return next(new Error('Invalid token type'));
      }
      await assertAdminLicenseActive(payload.sub);
      await assertAdminSessionActive(payload.sub, payload.sid);
      socket.data.admin = payload;
      next();
    } catch (err) {
      if (err.code === 'SESSION_SUPERSEDED' || err.code === 'SUBSCRIPTION_EXPIRED') {
        return next(new Error(err.message));
      }
      next(new Error('Invalid or expired token'));
    }
  })();
}

export function authenticateClientSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    const payload = verifyClientAccessToken(token);
    if (payload.type !== 'client') {
      return next(new Error('Invalid token type'));
    }
    socket.data.userId = payload.sub;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
}
