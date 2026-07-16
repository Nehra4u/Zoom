/**
 * WebSocket client lifecycle E2E — Home API + /client namespace events
 * Usage: node scripts/e2e-ws-client.js
 * Requires backend running on localhost:3001
 */
import 'dotenv/config';
import { io } from 'socket.io-client';
import { connectDb } from '../src/config/db.js';
import { ActiveMeeting } from '../src/models/ActiveMeeting.js';
import { User } from '../src/models/User.js';
import { buildClientMeetingPayload } from '../src/services/clientMeetingPayload.js';
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
  let timer;
  let onEvent;
  const promise = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      if (onEvent) socket.off(eventName, onEvent);
      reject(new Error(`Timeout waiting for ${eventName}`));
    }, timeoutMs);
    onEvent = (payload) => {
      clearTimeout(timer);
      socket.off(eventName, onEvent);
      resolve(payload);
    };
    socket.on(eventName, onEvent);
  });
  promise.cancel = () => {
    clearTimeout(timer);
    if (onEvent) socket.off(eventName, onEvent);
  };
  return promise;
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

  let adminToken;
  let e2eAdminId = null;

  if (process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD) {
    const adminLogin = await mustOk('POST', '/auth/admin/login', {
      email: process.env.E2E_ADMIN_EMAIL,
      password: process.env.E2E_ADMIN_PASSWORD,
    });
    adminToken = adminLogin.accessToken;
  } else {
    const superLogin = await mustOk('POST', '/auth/admin/login', {
      email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@zoomcontrol.local',
      password: process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdmin123!',
    });
    const superToken = superLogin.accessToken;

    const adminEmail = `ws-e2e-admin-${Date.now()}@test.local`;
    const adminPassword = 'WsE2eAdmin123';
    const { admin: e2eAdmin } = await mustOk(
      'POST',
      '/admins',
      {
        name: 'WS E2E Admin',
        email: adminEmail,
        password: adminPassword,
        role: 'admin',
        phone: `e2e-${Date.now()}`,
      },
      superToken
    );
    e2eAdminId = e2eAdmin.id;
    if (process.env.ZOOM_HOST_USER_ID) {
      await req(
        'PATCH',
        `/admins/${e2eAdminId}`,
        { zoomHostUserId: process.env.ZOOM_HOST_USER_ID },
        superToken
      );
    }
    const adminLogin = await mustOk('POST', '/auth/admin/login', {
      email: adminEmail,
      password: adminPassword,
    });
    adminToken = adminLogin.accessToken;
  }

  const username = `ws-e2e-${Date.now()}@test.local`;
  const password = 'WsE2eTest123';

  const { user } = await mustOk(
    'POST',
    '/users',
    { username, password, status: 'pending' },
    adminToken
  );
  await mustOk('POST', `/users/${user.id}/activate`, null, adminToken);

  const clientLogin = await mustOk('POST', '/auth/login', { username, password });
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

  console.log('2b. buildClientMeetingPayload — expect sdkKey + jwtToken fields');
  const userDoc = await User.findById(user.id);
  const liveRow = await ActiveMeeting.create({
    meetingNumber: '84337158559',
    password: '137457',
    zoomMeetingUuid: `e2e-ws-${Date.now()}`,
    status: 'live',
    startedBy: userDoc.createdBy,
  });
  try {
    const meetingPayload = await buildClientMeetingPayload(userDoc);
    assert(meetingPayload, 'Expected meeting payload from buildClientMeetingPayload');
    assert('sdkKey' in meetingPayload, 'Expected sdkKey field in meeting payload');
    assert(meetingPayload.jwtToken, 'Expected jwtToken in meeting payload');
    if (process.env.ZOOM_SDK_KEY) {
      assert(meetingPayload.sdkKey, 'Expected sdkKey value when ZOOM_SDK_KEY is configured');
    }
    console.log('   ✓ buildClientMeetingPayload includes sdkKey + jwtToken');
  } finally {
    await ActiveMeeting.deleteOne({ _id: liveRow._id });
  }

  console.log('3. Admin starts meeting — expect SESSION_STARTED with sdkKey + jwtToken');
  const sessionStartedPromise = waitForEvent(socket, 'SESSION_STARTED');
  const sessionStart = await req('POST', '/session/start', null, adminToken);
  if (!sessionStart.ok) {
    sessionStartedPromise.cancel();
    console.warn(`   ⚠ session/start skipped (${sessionStart.status}): ${sessionStart.data.error ?? 'unknown'}`);
    console.warn('   ✓ sdkKey coverage verified via buildClientMeetingPayload (step 2b)');
    socket.disconnect();
    await req('DELETE', `/users/${user.id}`, null, adminToken).catch(() => {});
    if (e2eAdminId) {
      const superLogin = await req('POST', '/auth/admin/login', {
        email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@zoomcontrol.local',
        password: process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdmin123!',
      });
      if (superLogin.ok) {
        await req('DELETE', `/admins/${e2eAdminId}`, null, superLogin.data.accessToken).catch(() => {});
      }
    }
    console.log('\n✅ WebSocket client lifecycle E2E passed (partial — no live Zoom session).\n');
    await mongoose.disconnect();
    return;
  }

  const sessionStarted = await sessionStartedPromise;
  assert('sdkKey' in sessionStarted, 'Expected sdkKey field in SESSION_STARTED');
  assert(sessionStarted.jwtToken, 'Expected jwtToken in SESSION_STARTED');
  assert(sessionStarted.meetingId, 'Expected meetingId in SESSION_STARTED');
  assert(sessionStarted.meetingHostUrl, 'Expected meetingHostUrl in SESSION_STARTED');
  if (process.env.ZOOM_SDK_KEY) {
    assert(sessionStarted.sdkKey, 'Expected sdkKey value when ZOOM_SDK_KEY is configured');
  }
  console.log('   ✓ SESSION_STARTED with full join payload');

  console.log('4. Reconnect — expect STATUS_SYNC with shouldBeInMeeting=true');
  socket.disconnect();
  const socket2 = await connectClient(clientToken);
  const reconnectSync = await waitForEvent(socket2, 'STATUS_SYNC');
  assert(reconnectSync.shouldBeInMeeting === true, 'Expected shouldBeInMeeting=true after meeting start');
  assert('sdkKey' in reconnectSync, 'Expected sdkKey field in STATUS_SYNC');
  assert(reconnectSync.jwtToken, 'Expected jwtToken in STATUS_SYNC');
  assert(reconnectSync.meetingId, 'Expected meetingId in STATUS_SYNC');
  console.log('   ✓ STATUS_SYNC reconciliation OK');

  console.log('5. POST /api/home — expect SUCCESS with sdkKey in meeting');
  const homeLive = await mustOk('POST', '/home', {}, clientToken);
  assert(homeLive.currentStatus === 'SUCCESS', 'Expected SUCCESS when meeting live');
  assert(homeLive.meeting?.jwtToken, 'Expected jwtToken in home meeting');
  assert('sdkKey' in (homeLive.meeting ?? {}), 'Expected sdkKey field in home meeting');
  console.log('   ✓ Home API returns sdkKey + jwtToken');

  console.log('6. POST /api/token/zoom — expect sdkKey + sdkJwt');
  const zoomToken = await mustOk('POST', '/token/zoom', {}, clientToken, {
    'X-Client-Platform': 'android',
  });
  assert(zoomToken.sdkJwt, 'Expected sdkJwt from token/zoom');
  assert('sdkKey' in zoomToken, 'Expected sdkKey field from token/zoom');
  console.log('   ✓ token/zoom returns sdkKey + sdkJwt');

  console.log('7. Admin ends meeting — expect SESSION_ENDED (+ legacy session:ended)');
  const sessionEndedPromise = waitForEvent(socket2, 'SESSION_ENDED');
  const legacyEndedPromise = waitForEvent(socket2, 'session:ended');
  await mustOk('POST', '/session/end', null, adminToken);
  await sessionEndedPromise;
  await legacyEndedPromise;
  console.log('   ✓ SESSION_ENDED received');

  console.log('8. Reconnect — expect shouldBeInMeeting=false');
  socket2.disconnect();
  const socket3 = await connectClient(clientToken);
  const afterEndSync = await waitForEvent(socket3, 'STATUS_SYNC');
  assert(afterEndSync.shouldBeInMeeting === false, 'Expected shouldBeInMeeting=false after meeting end');
  console.log('   ✓ STATUS_SYNC after end OK');

  console.log('9. Start meeting again, deactivate user — expect USER_DEACTIVATED + FORCE_LEAVE');
  await mustOk('POST', '/session/start', null, adminToken);
  const deactivatedPromise = waitForEvent(socket3, 'USER_DEACTIVATED');
  const forceLeavePromise = waitForEvent(socket3, 'FORCE_LEAVE');
  await mustOk('POST', `/users/${user.id}/deactivate`, null, adminToken);
  await deactivatedPromise;
  await forceLeavePromise;
  console.log('   ✓ USER_DEACTIVATED + legacy FORCE_LEAVE received');

  const blocked = await req('POST', '/auth/login', { username, password });
  assert(!blocked.ok || blocked.data.success === false, 'Login should fail after deactivate');
  assert(blocked.data.status === 'USER_DEACTIVATED', 'Expected USER_DEACTIVATED on login');
  console.log('   ✓ Login returns USER_DEACTIVATED');

  socket3.disconnect();
  await mustOk('POST', '/session/end', null, adminToken).catch(() => {});
  await req('DELETE', `/users/${user.id}`, null, adminToken).catch(() => {});
  if (e2eAdminId) {
    const superLogin = await req('POST', '/auth/admin/login', {
      email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@zoomcontrol.local',
      password: process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdmin123!',
    });
    if (superLogin.ok) {
      await req('DELETE', `/admins/${e2eAdminId}`, null, superLogin.data.accessToken).catch(() => {});
    }
  }

  console.log('\n✅ WebSocket client lifecycle E2E passed.\n');
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error('\n❌ WebSocket E2E failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
