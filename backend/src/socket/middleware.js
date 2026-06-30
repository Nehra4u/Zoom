import { verifyAdminAccessToken, verifyClientAccessToken } from '../services/tokenService.js';

export function authenticateAdminSocket(socket, next) {
  try {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }
    const payload = verifyAdminAccessToken(token);
    if (payload.type !== 'admin') {
      return next(new Error('Invalid token type'));
    }
    socket.data.admin = payload;
    next();
  } catch {
    next(new Error('Invalid or expired token'));
  }
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
