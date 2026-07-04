/**
 * Admin WebSocket lifecycle — session:started, reconnect refetch pattern
 * Usage: node scripts/e2e-admin-ws.js
 */
import 'dotenv/config';
import { io } from 'socket.io-client';
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';
import { ActiveMeeting } from '../src/models/ActiveMeeting.js';

const BASE = process.env.API_BASE ?? 'http://localhost:3001/api';
const WS_URL = process.env.WS_URL ?? 'http://localhost:3001';

async function req(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function mustOk(method, path, body, token) {
  const { ok, status, data } = await req(method, path, body, token);
  if (!ok) throw new Error(`${method} ${path} → ${status}: ${JSON.stringify(data)}`);
  return data;
}

function waitForEvent(socket, eventName, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout: ${eventName}`)), timeoutMs);
    socket.once(eventName, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connectAdmin(token) {
  return new Promise((resolve, reject) => {
    const socket = io(`${WS_URL}/admin`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    const timer = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Admin socket timeout'));
    }, 10_000);
    socket.on('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function run() {
  console.log('\n=== Admin WebSocket E2E ===\n');

  await connectDb();
  await ActiveMeeting.updateMany({ status: 'live' }, { status: 'ended', endedAt: new Date() });

  const login = await mustOk('POST', '/auth/admin/login', {
    email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@zoomcontrol.local',
    password: process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdmin123!',
  });
  const adminToken = login.accessToken;

  const socket = await connectAdmin(adminToken);
  console.log('✓ Admin socket connected');

  const startedPromise = waitForEvent(socket, 'session:started');
  const { meeting } = await mustOk('POST', '/session/start', null, adminToken);
  const started = await startedPromise;

  if (!started?.meeting?.meetingNumber) {
    throw new Error('session:started missing meeting payload');
  }
  if (started.meeting.meetingNumber !== meeting.meetingNumber) {
    throw new Error('session:started meetingNumber mismatch');
  }
  console.log('✓ session:started received with meeting', started.meeting.meetingNumber);

  const snapshot = await mustOk('GET', '/session/current', null, adminToken);
  if (!snapshot.meetingLive) throw new Error('Expected meetingLive=true');
  console.log('✓ GET /session/current reflects live meeting');

  const endedPromise = waitForEvent(socket, 'session:ended');
  await mustOk('POST', '/session/end', null, adminToken);
  await endedPromise;
  console.log('✓ session:ended received');

  socket.disconnect();
  await mongoose.disconnect();
  console.log('\n✅ Admin WebSocket E2E passed.\n');
}

run().catch(async (err) => {
  console.error('\n❌ Admin WebSocket E2E failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
