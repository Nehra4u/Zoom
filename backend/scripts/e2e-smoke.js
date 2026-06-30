/**
 * Smoke test for critical platform flows (run against local backend).
 * Usage: node scripts/e2e-smoke.js
 */
import 'dotenv/config';

const BASE = process.env.API_BASE ?? 'http://localhost:3001/api';

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
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data.error ?? res.statusText}`);
  return data;
}

async function run() {
  console.log('1. Health check…');
  const health = await req('GET', '/health');
  console.log('   OK', health.reconciliation?.lastRunStatus ?? '');

  console.log('2. Super admin login…');
  const login = await req('POST', '/auth/admin/login', {
    email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@zoomcontrol.local',
    password: process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdmin123!',
  });
  const adminToken = login.accessToken;
  console.log('   OK');

  console.log('3. Create APK user…');
  const email = `smoke-${Date.now()}@test.local`;
  const created = await req(
    'POST',
    '/users',
    { name: 'Smoke User', email, password: 'SmokeTest1', status: 'active', zoomDisplayName: 'Smoke' },
    adminToken
  );
  const userId = created.user.id;
  console.log('   OK', userId);

  console.log('4. Client login + zoom token…');
  const clientLogin = await req('POST', '/auth/login', { email, password: 'SmokeTest1' });
  const token = await req('POST', '/token/zoom', null, clientLogin.accessToken);
  console.log('   OK', token.sdkJwt?.slice(0, 20) + '…');

  console.log('5. Deactivate user (force-leave)…');
  await req('POST', `/users/${userId}/deactivate`, null, adminToken);
  console.log('   OK');

  console.log('6. Client login blocked…');
  try {
    await req('POST', '/auth/login', { email, password: 'SmokeTest1' });
    throw new Error('Expected login to fail');
  } catch (e) {
    if (!String(e.message).includes('401')) throw e;
    console.log('   OK (401 as expected)');
  }

  console.log('7. Audit logs…');
  const audit = await req('GET', '/audit-logs', null, adminToken);
  console.log('   OK', audit.logs.length, 'entries');

  console.log('\nAll smoke tests passed.');
}

run().catch((err) => {
  console.error('\nSmoke test failed:', err.message);
  process.exit(1);
});
