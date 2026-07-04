/**
 * WebSocket client lifecycle E2E — Home API + /client namespace events
 * Usage: node scripts/e2e-ws-client.js
 * Requires backend running on localhost:3001
 */
import 'dotenv/config';
import { io } from 'socket.io-client';
import { connectDb } from '../src/config/db.js';
import { ActiveMeeting } from '../src/models/ActiveMeeting.js';
import mongoose from 'mongoose';

const BASE = process.env.API_BASE ?? 'http://localhost:3001/api';
const WS_URL = process.env.WS_URL ?? 'http://localhost:3001';

async function req(method, path, body, token, extraHeaders = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

async function mustOk(method, path, body, token, extraHeaders = {}) {
  const { ok, status, data } = await req(method, path, body, token, extraHeaders);
  if (!ok) {
    throw new Error(`${method} ${path} → ${status}: ${data.error ?? data.message ?? JSON.stringify(data)}`);
  }
  return data;
}

function waitForEvent(socket, eventName, timeoutMs = 15_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${eventName}`)), timeoutMs);
    socket.once(eventName, (payload) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function connectClient(token) {
  return new Promise((resolve, reject) => {
    const socket = io(`${WS_URL}/client`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Client socket connection timeout'));
    }, 10_000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run() {
  console.log('\n=== WebSocket client lifecycle E2E ===\n');

  await connectDb();
  await ActiveMeeting.updateMany({ status: 'live' }, { status: 'ended', endedAt: new Date() });

  const adminLogin = await mustOk('POST', '/auth/admin/login', {
    email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@zoomcontrol.local',
    password: process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdmin123!',
  });
  const adminToken = adminLogin.accessToken;

  const email = `ws-e2e-${Date.now()}@test.local`;
  const password = 'WsE2eTest123';

  const { user } = await mustOk(
    'POST',
    '/users',
    { name: 'WS E2E User', email, password, status: 'pending', zoomDisplayName: 'WS E2E' },
    adminToken
  );
  await mustOk('POST', `/users/${user.id}/activate`, null, adminToken);

  const clientLogin = await mustOk('POST', '/auth/login', { email, password });
  const clientToken = clientLogin.accessToken;

  console.log('1. Connect socket — expect STATUS_SYNC (no meeting)');
  const socket = await connectClient(clientToken);
  const initialSync = await waitForEvent(socket, 'STATUS_SYNC');
  assert(initialSync.shouldBeInMeeting === false, 'Expected shouldBeInMeeting=false on initial connect');
  assert(initialSync.isActive === true, 'Expected isActive=true for active user');
  console.log('   ✓ STATUS_SYNC received');

  console.log('2. POST /api/home — expect NO_MEETING_ASSIGNED');
  const homeBefore = await mustOk('POST', '/home', {}, clientToken);
  assert(homeBefore.currentStatus === 'NO_MEETING_ASSIGNED', 'Expected NO_MEETING_ASSIGNED');
  assert(homeBefore.meeting === null, 'Expected meeting=null');
  assert(homeBefore.websocket?.hbInterval === 10, 'Expected hbInterval=10');
  console.log('   ✓ Home API bootstrap OK');

  console.log('3. Admin starts meeting — expect SESSION_STARTED with jwtToken');
  const sessionStartedPromise = waitForEvent(socket, 'SESSION_STARTED');
  await mustOk('POST', '/session/start', null, adminToken);
  const sessionStarted = await sessionStartedPromise;
  assert(sessionStarted.jwtToken, 'Expected jwtToken in SESSION_STARTED');
  assert(sessionStarted.meetingId, 'Expected meetingId in SESSION_STARTED');
  assert(sessionStarted.meetingHostUrl, 'Expected meetingHostUrl in SESSION_STARTED');
  console.log('   ✓ SESSION_STARTED with full join payload');

  console.log('4. Reconnect — expect STATUS_SYNC with shouldBeInMeeting=true');
  socket.disconnect();
  const socket2 = await connectClient(clientToken);
  const reconnectSync = await waitForEvent(socket2, 'STATUS_SYNC');
  assert(reconnectSync.shouldBeInMeeting === true, 'Expected shouldBeInMeeting=true after meeting start');
  assert(reconnectSync.jwtToken, 'Expected jwtToken in STATUS_SYNC');
  assert(reconnectSync.meetingId, 'Expected meetingId in STATUS_SYNC');
  console.log('   ✓ STATUS_SYNC reconciliation OK');

  console.log('5. Admin ends meeting — expect SESSION_ENDED (+ legacy session:ended)');
  const sessionEndedPromise = waitForEvent(socket2, 'SESSION_ENDED');
  const legacyEndedPromise = waitForEvent(socket2, 'session:ended');
  await mustOk('POST', '/session/end', null, adminToken);
  await sessionEndedPromise;
  await legacyEndedPromise;
  console.log('   ✓ SESSION_ENDED received');

  console.log('6. Reconnect — expect shouldBeInMeeting=false');
  socket2.disconnect();
  const socket3 = await connectClient(clientToken);
  const afterEndSync = await waitForEvent(socket3, 'STATUS_SYNC');
  assert(afterEndSync.shouldBeInMeeting === false, 'Expected shouldBeInMeeting=false after meeting end');
  console.log('   ✓ STATUS_SYNC after end OK');

  console.log('7. Start meeting again, deactivate user — expect USER_DEACTIVATED + FORCE_LEAVE');
  await mustOk('POST', '/session/start', null, adminToken);
  const deactivatedPromise = waitForEvent(socket3, 'USER_DEACTIVATED');
  const forceLeavePromise = waitForEvent(socket3, 'FORCE_LEAVE');
  await mustOk('POST', `/users/${user.id}/deactivate`, null, adminToken);
  await deactivatedPromise;
  await forceLeavePromise;
  console.log('   ✓ USER_DEACTIVATED + legacy FORCE_LEAVE received');

  const blocked = await req('POST', '/auth/login', { email, password });
  assert(!blocked.ok || blocked.data.success === false, 'Login should fail after deactivate');
  assert(blocked.data.status === 'USER_DEACTIVATED', 'Expected USER_DEACTIVATED on login');
  console.log('   ✓ Login returns USER_DEACTIVATED');

  socket3.disconnect();
  await mustOk('POST', '/session/end', null, adminToken).catch(() => {});
  await req('DELETE', `/users/${user.id}`, null, adminToken).catch(() => {});

  console.log('\n✅ WebSocket client lifecycle E2E passed.\n');
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\n❌ WebSocket E2E failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
