/**
 * Production SDK key audit — verifies /api/home and /api/token/zoom return sdkKey + JWT.
 *
 * Usage:
 *   PROD_API_BASE=https://zoomcontrol.onrender.com/api \
 *   E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... \
 *   node scripts/prod-sdkkey-audit.js
 *
 * Optional: set APK_USERNAME + APK_PASSWORD to test an existing APK user instead of creating one.
 */
import 'dotenv/config';

const BASE = (process.env.PROD_API_BASE ?? 'https://zoomcontrol.onrender.com/api').replace(/\/$/, '');

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

function log(step, ok, detail) {
  const mark = ok ? '✓' : '✗';
  console.log(`${mark} ${step}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log(`\n=== Production SDK Key Audit ===`);
  console.log(`API: ${BASE}\n`);

  const health = await req('GET', '/health');
  log('GET /api/health', health.ok, health.data.service ?? String(health.status));

  const loginFieldProbe = await req('POST', '/auth/login', { username: 'x', password: 'y' });
  const usesUsername = loginFieldProbe.data.message !== 'Email and password are required.';
  const usesEmail = !usesUsername;
  log(
    'Login field detection',
    true,
    usesUsername ? 'expects `username` (new backend)' : 'expects `email` (legacy backend)'
  );

  let clientToken = null;
  let cleanup = null;

  if (process.env.APK_USERNAME && process.env.APK_PASSWORD) {
    const loginBody = usesUsername
      ? { username: process.env.APK_USERNAME, password: process.env.APK_PASSWORD, device: { deviceId: 'audit-device-1' } }
      : { email: process.env.APK_USERNAME, password: process.env.APK_PASSWORD, device: { deviceId: 'audit-device-1' } };
    const login = await req('POST', '/auth/login', loginBody);
    log('APK user login', login.data.accessToken != null, login.data.status ?? login.data.error ?? String(login.status));
    clientToken = login.data.accessToken ?? null;
  } else if (
    (process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD) ||
    (process.env.SUPER_ADMIN_EMAIL && process.env.SUPER_ADMIN_PASSWORD)
  ) {
    let adminToken = null;

    if (process.env.E2E_ADMIN_EMAIL && process.env.E2E_ADMIN_PASSWORD) {
      const adminLogin = await req('POST', '/auth/admin/login', {
        email: process.env.E2E_ADMIN_EMAIL,
        password: process.env.E2E_ADMIN_PASSWORD,
      });
      adminToken = adminLogin.data.accessToken ?? null;
      log('Admin login', adminToken != null, adminLogin.data.error ?? String(adminLogin.status));
    } else {
      const superLogin = await req('POST', '/auth/admin/login', {
        email: process.env.SUPER_ADMIN_EMAIL,
        password: process.env.SUPER_ADMIN_PASSWORD,
      });
      log('Super admin login', superLogin.data.accessToken != null, superLogin.data.error ?? String(superLogin.status));
      if (!superLogin.data.accessToken) {
        console.log('\nSet APK_USERNAME + APK_PASSWORD or valid admin credentials to complete audit.\n');
        process.exit(1);
      }

      const superToken = superLogin.data.accessToken;
      const adminEmail = `sdk-audit-admin-${Date.now()}@test.local`;
      const adminPassword = 'SdkAuditAdmin123!';
      const { data: created } = await req(
        'POST',
        '/admins',
        { name: 'SDK Audit Admin', email: adminEmail, password: adminPassword, role: 'admin', phone: `audit-${Date.now()}` },
        superToken
      );
      log('Create temp admin', created.admin?.id != null, created.message ?? created.error ?? '');
      if (!created.admin?.id) process.exit(1);

      const adminLogin = await req('POST', '/auth/admin/login', { email: adminEmail, password: adminPassword });
      adminToken = adminLogin.data.accessToken ?? null;
      log('Temp admin login', adminToken != null, adminLogin.data.error ?? String(adminLogin.status));
    }

    if (!adminToken) {
      console.log('\nSet APK_USERNAME + APK_PASSWORD or valid E2E_ADMIN_* credentials to complete audit.\n');
      process.exit(1);
    }
    const username = `sdk-audit-${Date.now()}@test.local`;
    const password = 'SdkAudit123!';
    const createBody = usesEmail
      ? { name: 'SDK Audit User', email: username, password, status: 'pending' }
      : { username, password, status: 'pending' };
    const create = await req('POST', '/users', createBody, adminToken);
    log('Create temp APK user', create.data.user?.id != null, create.data.message ?? create.data.error ?? '');
    if (!create.data.user?.id) process.exit(1);

    const userId = create.data.user.id;
    cleanup = async () => req('DELETE', `/users/${userId}`, null, adminToken);

    await req('POST', `/users/${userId}/activate`, null, adminToken);
    const loginBody = usesUsername
      ? { username, password, device: { deviceId: 'audit-device-1' } }
      : { email: username, password, device: { deviceId: 'audit-device-1' } };
    const clientLogin = await req('POST', '/auth/login', loginBody);
    log('Temp APK user login', clientLogin.data.accessToken != null, clientLogin.data.status ?? clientLogin.data.error ?? '');
    clientToken = clientLogin.data.accessToken ?? null;
  } else {
    console.log('No APK_USERNAME or E2E_ADMIN_* credentials — skipping authenticated endpoints.');
    console.log('Set env vars and re-run to verify sdkKey in /api/home and /api/token/zoom.\n');
    process.exit(0);
  }

  if (!clientToken) process.exit(1);

  const home = await req('POST', '/home', { deviceId: 'audit-device-1' }, clientToken);
  const homeStatus = home.data.currentStatus ?? home.data.status;
  log('POST /api/home', home.ok, `status=${homeStatus}`);

  if (home.data.meeting) {
    const hasSdkKeyField = 'sdkKey' in home.data.meeting;
    const hasJwt = Boolean(home.data.meeting.jwtToken);
    log('  meeting.sdkKey field present', hasSdkKeyField, `value=${home.data.meeting.sdkKey ?? 'null'}`);
    log('  meeting.jwtToken present', hasJwt, hasJwt ? 'yes' : 'missing');
  } else {
    log('  meeting object', true, 'null (no live meeting — sdkKey only appears when meeting is live)');
  }

  const ws = home.data.websocket;
  if (ws) {
    const interval = ws.hbInterval ?? ws.heartbeatIntervalSeconds;
    log('  websocket config', true, `url=${ws.url}, interval=${interval}`);
  }

  const zoom = await req('POST', '/token/zoom', {}, clientToken, { 'X-Client-Platform': 'android' });
  if (zoom.status === 404 || zoom.status === 503) {
    log('POST /api/token/zoom', true, `${zoom.status} — ${zoom.data.error ?? 'no live meeting'} (expected when no session)`);
  } else if (zoom.ok) {
    log('POST /api/token/zoom', true, `sdkKey=${zoom.data.sdkKey ?? 'null'}, sdkJwt=${zoom.data.sdkJwt ? 'present' : 'missing'}`);
  } else {
    log('POST /api/token/zoom', false, `${zoom.status} — ${zoom.data.error ?? JSON.stringify(zoom.data)}`);
  }

  if (cleanup) await cleanup().catch(() => {});

  console.log('\nAudit complete.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
