/**
 * Full E2E tests — Spec Phase 6 flows 27 & 28
 * Usage: node scripts/e2e-full.js
 */
import 'dotenv/config';

const BASE = process.env.API_BASE ?? 'http://localhost:3001/api';
const WEBHOOK_DEV = `${BASE.replace('/api', '')}/api/webhooks/dev/simulate`;

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
  if (!ok) throw new Error(`${method} ${path} → ${status}: ${data.error ?? 'failed'}`);
  return data;
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
  if (blocked.ok) throw new Error('Client login should fail when inactive');
  console.log('  ✓ Client login blocked');

  console.log('  Reactivate user…');
  await mustOk('POST', `/users/${user.id}/activate`, null, adminToken);

  const clientLogin = await mustOk('POST', '/auth/login', { email, password });
  console.log('  ✓ Client login restored');

  const zoomToken = await mustOk('POST', '/token/zoom', null, clientLogin.accessToken);
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

  console.log('  Super admin deactivates admin…');
  await mustOk('POST', `/admins/${admin.id}/deactivate`, null, superToken);

  const blocked = await req('POST', '/auth/admin/login', { email, password });
  if (blocked.ok) throw new Error('Deactivated admin login should fail');
  console.log('  ✓ Deactivated admin login blocked');

  await mustOk('DELETE', `/admins/${admin.id}`, null, superToken);
  console.log('  Flow 28 PASSED');
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
  if (!loginOk.ok) throw new Error('User should still be able to login after remove');
  console.log('  ✓ User can still login after remove');

  await mustOk('POST', '/session/end', null, adminToken);
  await mustOk('DELETE', `/users/${user.id}`, null, adminToken);
  console.log('  Flow 29 PASSED');
}

async function run() {
  console.log('ZoomControl E2E Full Test Suite');
  await flow27UserLifecycle();
  await flow28AdminLifecycle();
  await flow29MeetingLifecycle();
  console.log('\n✅ All E2E flows passed.\n');
}

run().catch((err) => {
  console.error('\n❌ E2E failed:', err.message);
  process.exit(1);
});
