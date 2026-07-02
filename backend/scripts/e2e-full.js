/**
 * Full E2E tests — Spec Phase 6 flows 27 & 28
 * Usage: node scripts/e2e-full.js
 */
import 'dotenv/config';

const BASE = process.env.API_BASE ?? 'http://localhost:3001/api';
const WEBHOOK_DEV = `${BASE.replace('/api', '')}/api/webhooks/dev/simulate`;

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

async function mustOk(method, path, body, token, extraHeaders = {}, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const { ok, status, data } = await req(method, path, body, token, extraHeaders);
    if (ok) return data;
    if (status === 429 && attempt < retries - 1) {
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
      continue;
    }
    throw new Error(`${method} ${path} → ${status}: ${data.error ?? data.message ?? 'failed'}`);
  }
  throw new Error(`${method} ${path} failed after retries`);
}

async function superAdminToken() {
  const login = await mustOk('POST', '/auth/admin/login', {
    email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@zoomcontrol.local',
    password: process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdmin123!',
  });
  return login.accessToken;
}

async function flow27UserLifecycle() {
  console.log('\n=== Flow 27: User join → deactivate → reactivate ===');
  const adminToken = await superAdminToken();

  console.log('  Start meeting…');
  const { meeting } = await mustOk('POST', '/session/start', null, adminToken);
  const meetingId = meeting.meetingNumber;

  const email = `e2e-${Date.now()}@test.local`;
  const password = 'E2eTest123';

  console.log('  Create user (pending)…');
  const { user } = await mustOk(
    'POST',
    '/users',
    { name: 'E2E User', email, password, status: 'pending', zoomDisplayName: 'E2E' },
    adminToken
  );

  console.log('  Activate user…');
  await mustOk('POST', `/users/${user.id}/activate`, null, adminToken);

  console.log('  Simulate join (webhook)…');
  await fetch(WEBHOOK_DEV, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'meeting.participant_joined',
      event_ts: Date.now(),
      payload: {
        object: {
          id: meetingId,
          participant: {
            user_id: 'zp-e2e-1',
            user_name: 'E2E User',
            customer_key: user.id,
            join_time: new Date().toISOString(),
          },
        },
      },
    }),
  });

  let session = await mustOk('GET', '/session/current', null, adminToken);
  const inCall = session.participants.some((p) => p.userId === user.id);
  if (!inCall) {
    throw new Error(`Expected user ${user.id} in call`);
  }
  console.log('  ✓ User in call');

  console.log('  Deactivate (force-drop)…');
  await mustOk('POST', `/users/${user.id}/deactivate`, null, adminToken);

  session = await mustOk('GET', '/session/current', null, adminToken);
  if (session.participants.some((p) => p.userId === user.id)) {
    throw new Error('User should not be in call after deactivate');
  }
  console.log('  ✓ User dropped from session');

  const blocked = await req('POST', '/auth/login', { email, password });
  if (blocked.ok && blocked.data.success !== false) {
    throw new Error('Client login should fail when inactive');
  }
  console.log('  ✓ Client login blocked');

  console.log('  Reactivate user…');
  await mustOk('POST', `/users/${user.id}/activate`, null, adminToken);

  const clientLogin = await req('POST', '/auth/login', { email, password });
  if (!clientLogin.ok || clientLogin.data.success === false || !clientLogin.data.accessToken) {
    throw new Error('Client login should succeed after reactivate');
  }
  console.log('  ✓ Client login restored');

  const zoomToken = await mustOk('POST', '/token/zoom', null, clientLogin.data.accessToken, {
    'X-Client-Platform': 'android',
  });
  if (!zoomToken.sdkJwt) throw new Error('Expected SDK JWT after reactivate');
  console.log('  ✓ Fresh Zoom token issued');

  console.log('  Simulate rejoin…');
  await fetch(WEBHOOK_DEV, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'meeting.participant_joined',
      event_ts: Date.now(),
      payload: {
        object: {
          id: meetingId,
          participant: {
            user_id: 'zp-e2e-2',
            user_name: 'E2E User',
            customer_key: user.id,
            join_time: new Date().toISOString(),
          },
        },
      },
    }),
  });

  session = await mustOk('GET', '/session/current', null, adminToken);
  if (!session.participants.some((p) => p.userId === user.id)) {
    throw new Error('Expected user in call after rejoin');
  }
  console.log('  ✓ User back in call');

  await mustOk('DELETE', `/users/${user.id}`, null, adminToken);
  await mustOk('POST', '/session/end', null, adminToken);
  console.log('  Flow 27 PASSED');
}

async function flow28AdminLifecycle() {
  console.log('\n=== Flow 28: Super admin → create admin → deactivate ===');
  const superToken = await superAdminToken();

  const email = `admin-e2e-${Date.now()}@test.local`;
  const password = 'AdminE2e123';

  console.log('  Create admin…');
  const { admin } = await mustOk(
    'POST',
    '/admins',
    { name: 'E2E Admin', email, password, role: 'admin' },
    superToken
  );

  console.log('  Admin login…');
  const adminLogin = await mustOk('POST', '/auth/admin/login', { email, password });
  const adminToken = adminLogin.accessToken;
  console.log('  ✓ Admin logged in');

  const forbidden = await req('GET', '/admins', null, adminToken);
  if (forbidden.ok) throw new Error('Regular admin should not access /api/admins');
  console.log('  ✓ Admin blocked from /api/admins');

  const usersOk = await req('GET', '/users', null, adminToken);
  if (!usersOk.ok) throw new Error('Admin should access /api/users');
  console.log('  ✓ Admin can access /api/users');

  console.log('  Regular admin starts meeting…');
  const { meeting: adminMeeting } = await mustOk('POST', '/session/start', null, adminToken);
  console.log('  ✓ Regular admin started meeting:', adminMeeting.meetingNumber);

  const joinUrl = await mustOk('GET', '/session/join-url', null, adminToken);
  if (!joinUrl.meetingNumber) throw new Error('Expected join-url for admin meeting');
  console.log('  ✓ Admin join-url available');

  const joinToken = await mustOk('POST', '/session/join-token', null, adminToken);
  if (!joinToken.sdkJwt) throw new Error('Expected admin join token');
  if (!joinToken.displayName) throw new Error('Expected admin display name in join token');
  console.log('  ✓ Admin join token issued');

  await mustOk('POST', '/session/end', null, adminToken);
  console.log('  ✓ Regular admin ended meeting');

  console.log('  Super admin deactivates admin…');
  await mustOk('POST', `/admins/${admin.id}/deactivate`, null, superToken);

  const blocked = await req('POST', '/auth/admin/login', { email, password });
  if (blocked.ok) throw new Error('Deactivated admin login should fail');
  console.log('  ✓ Deactivated admin login blocked');

  await mustOk('DELETE', `/admins/${admin.id}`, null, superToken);
  console.log('  Flow 28 PASSED');
}

async function flow30UserScoping() {
  console.log('\n=== Flow 30: Per-admin user scoping ===');
  const superToken = await superAdminToken();

  const adminAEmail = `admin-a-${Date.now()}@test.local`;
  const adminBEmail = `admin-b-${Date.now()}@test.local`;
  const password = 'AdminE2e123';

  const { admin: adminA } = await mustOk(
    'POST',
    '/admins',
    { name: 'Admin A', email: adminAEmail, password, role: 'admin' },
    superToken
  );
  const { admin: adminB } = await mustOk(
    'POST',
    '/admins',
    { name: 'Admin B', email: adminBEmail, password, role: 'admin' },
    superToken
  );

  const adminAToken = (await mustOk('POST', '/auth/admin/login', { email: adminAEmail, password })).accessToken;
  const adminBToken = (await mustOk('POST', '/auth/admin/login', { email: adminBEmail, password })).accessToken;

  const userAEmail = `user-a-${Date.now()}@test.local`;
  const userBEmail = `user-b-${Date.now()}@test.local`;
  const userPassword = 'UserTest123';

  const { user: userA } = await mustOk(
    'POST',
    '/users',
    { name: 'User A', email: userAEmail, password: userPassword, status: 'active' },
    adminAToken
  );
  const { user: userB } = await mustOk(
    'POST',
    '/users',
    { name: 'User B', email: userBEmail, password: userPassword, status: 'active' },
    adminBToken
  );

  const adminAUsers = await mustOk('GET', '/users', null, adminAToken);
  if (!adminAUsers.users.some((u) => u.id === userA.id)) throw new Error('Admin A should see own user');
  if (adminAUsers.users.some((u) => u.id === userB.id)) throw new Error('Admin A should not see Admin B user');
  console.log('  ✓ User list scoped per admin');

  const crossAccess = await req('GET', `/users/${userB.id}`, null, adminAToken);
  if (crossAccess.ok) throw new Error('Admin A should not access Admin B user');
  console.log('  ✓ Cross-admin user access blocked');

  const { meeting: meetingA } = await mustOk('POST', '/session/start', null, adminAToken);
  await fetch(WEBHOOK_DEV, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'meeting.participant_joined',
      event_ts: Date.now(),
      payload: {
        object: {
          id: meetingA.meetingNumber,
          participant: {
            user_id: 'zp-scope-a',
            user_name: 'User A',
            customer_key: userA.id,
            join_time: new Date().toISOString(),
          },
        },
      },
    }),
  });

  let sessionA = await mustOk('GET', '/session/current', null, adminAToken);
  if (!sessionA.participants.some((p) => p.userId === userA.id)) {
    throw new Error('Admin A should see own participant');
  }
  if (sessionA.meeting?.meetingNumber !== meetingA.meetingNumber) {
    throw new Error('Admin A should see their own meeting');
  }
  console.log('  ✓ Session participants scoped per admin');

  await mustOk('POST', '/session/end', null, adminAToken);

  const { meeting: meetingB } = await mustOk('POST', '/session/start', null, adminBToken);
  await fetch(WEBHOOK_DEV, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'meeting.participant_joined',
      event_ts: Date.now(),
      payload: {
        object: {
          id: meetingB.meetingNumber,
          participant: {
            user_id: 'zp-scope-b',
            user_name: 'User B',
            customer_key: userB.id,
            join_time: new Date().toISOString(),
          },
        },
      },
    }),
  });

  const sessionB = await mustOk('GET', '/session/current', null, adminBToken);
  if (!sessionB.participants.some((p) => p.userId === userB.id)) {
    throw new Error('Admin B should see own participant');
  }
  if (sessionB.meeting?.meetingNumber !== meetingB.meetingNumber) {
    throw new Error('Admin B should see their own meeting');
  }

  sessionA = await mustOk('GET', '/session/current', null, adminAToken);
  if (sessionA.meetingLive) throw new Error('Admin A should have no live meeting after ending');

  await mustOk('POST', '/session/end', null, adminBToken);
  await mustOk('DELETE', `/users/${userA.id}`, null, adminAToken);
  await mustOk('DELETE', `/users/${userB.id}`, null, adminBToken);
  await mustOk('DELETE', `/admins/${adminA.id}`, null, superToken);
  await mustOk('DELETE', `/admins/${adminB.id}`, null, superToken);
  console.log('  Flow 30 PASSED');
}

async function flow29MeetingLifecycle() {
  console.log('\n=== Flow 29: Start meeting → remove participant ===');
  const adminToken = await superAdminToken();

  const email = `meet-${Date.now()}@test.local`;
  const password = 'MeetTest123';

  const { user } = await mustOk(
    'POST',
    '/users',
    { name: 'Meet User', email, password, status: 'active', zoomDisplayName: 'Meet' },
    adminToken
  );

  const { meeting } = await mustOk('POST', '/session/start', null, adminToken);
  console.log('  ✓ Meeting started:', meeting.meetingNumber);

  await fetch(WEBHOOK_DEV, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'meeting.participant_joined',
      event_ts: Date.now(),
      payload: {
        object: {
          id: meeting.meetingNumber,
          participant: {
            user_id: 'zp-meet-1',
            user_name: 'Meet User',
            customer_key: user.id,
            join_time: new Date().toISOString(),
          },
        },
      },
    }),
  });

  let session = await mustOk('GET', '/session/current', null, adminToken);
  if (!session.participants.some((p) => p.userId === user.id)) {
    throw new Error('Expected user in call');
  }
  console.log('  ✓ User in call');

  await mustOk('POST', `/session/participants/${user.id}/remove`, null, adminToken);
  session = await mustOk('GET', '/session/current', null, adminToken);
  if (session.participants.some((p) => p.userId === user.id)) {
    throw new Error('User should be removed from call');
  }
  console.log('  ✓ User removed from call (account still active)');

  const loginOk = await req('POST', '/auth/login', { email, password });
  if (!loginOk.ok || loginOk.data.success === false || !loginOk.data.accessToken) {
    throw new Error('User should still be able to login after remove');
  }
  console.log('  ✓ User can still login after remove');

  await mustOk('POST', '/session/end', null, adminToken);
  await mustOk('DELETE', `/users/${user.id}`, null, adminToken);
  console.log('  Flow 29 PASSED');
}

async function ensureNoLiveMeeting(_token) {
  await req('POST', '/session/dev/end-all-live', null, _token);
}

async function run() {
  console.log('ZoomControl E2E Full Test Suite');
  const superToken = await superAdminToken();
  await ensureNoLiveMeeting(superToken);
  await flow27UserLifecycle();
  await flow28AdminLifecycle();
  await flow29MeetingLifecycle();
  await flow30UserScoping();
  console.log('\n✅ All E2E flows passed.\n');
}

run().catch((err) => {
  console.error('\n❌ E2E failed:', err.message);
  process.exit(1);
});
