import { Server } from 'socket.io';
import { User } from '../models/User.js';
import { DeviceSession } from '../models/DeviceSession.js';
import { setIo, getIo } from '../services/io.js';
import { sendStatusSync } from '../services/notificationService.js';
import { authenticateAdminSocket, authenticateClientSocket } from './middleware.js';

// "Online" here means a live, currently-connected /client websocket for that user —
// distinct from the user's account status ("Activated"), which is a separate concept.
export function getOnlineUserIds() {
  const io = getIo();
  const ids = new Set();
  if (!io) return ids;

  for (const socket of io.of('/client').sockets.values()) {
    if (socket.data?.userId) ids.add(String(socket.data.userId));
  }
  return ids;
}

export function setupSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.ADMIN_PORTAL_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  setIo(io);

  const adminNS = io.of('/admin');
  adminNS.use(authenticateAdminSocket);
  adminNS.on('connection', (socket) => {
    socket.join('admin:session');
    console.log('Admin socket connected:', socket.data.admin.email);
    socket.on('disconnect', () => {
      console.log('Admin socket disconnected:', socket.data.admin.email);
    });
  });

  const clientNS = io.of('/client');
  clientNS.use(authenticateClientSocket);
  clientNS.on('connection', async (socket) => {
    const userId = socket.data.userId;
    socket.join(`client:${userId}`);
    console.log('Client socket connected:', userId);

    const user = await User.findById(userId);
    if (user) {
      await sendStatusSync(socket, user);
    }

    socket.on('HEARTBEAT', async (data) => {
      const deviceId = data?.deviceId ?? null;

      if (deviceId) {
        await DeviceSession.updateOne(
          { userId, deviceId, loggedOut: false },
          { lastSeenAt: new Date() }
        ).catch(() => {});
      }

      socket.emit('HEARTBEAT_ACK', {
        type: 'HEARTBEAT_ACK',
        serverTime: new Date().toISOString(),
      });
    });

    socket.on('disconnect', () => {
      console.log('Client socket disconnected:', userId);
    });
  });

  return io;
}
