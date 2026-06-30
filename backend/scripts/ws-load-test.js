/**
 * WebSocket load test — Spec Phase 6 item 26
 * Usage: CLIENTS=20 node scripts/ws-load-test.js
 */
import 'dotenv/config';
import { io } from 'socket.io-client';

const BASE = process.env.API_BASE ?? 'http://localhost:3001/api';
const WS_URL = process.env.WS_URL ?? 'http://localhost:3001';
const CLIENT_COUNT = parseInt(process.env.CLIENTS ?? '10', 10);

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
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${data.error}`);
  return data;
}

function connectClient(token, index) {
  return new Promise((resolve, reject) => {
    const start = Date.now();

    const socket = io(`${WS_URL}/client`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`Client ${index} connection timeout`));
    }, 10_000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      let forceLeaveReceived = false;
      let forceLeaveResolve = null;

      socket.on('FORCE_LEAVE', () => {
        forceLeaveReceived = true;
        forceLeaveResolve?.(true);
      });

      resolve({
        socket,
        index,
        connectMs: Date.now() - start,
        waitForForceLeave: () =>
          new Promise((res) => {
            if (forceLeaveReceived) {
              res(true);
              return;
            }
            forceLeaveResolve = res;
            setTimeout(() => {
              forceLeaveResolve = null;
              res(forceLeaveReceived);
            }, 5000);
          }),
        disconnect: () => socket.disconnect(),
      });
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Client ${index}: ${err.message}`));
    });
  });
}

function connectAdmin(token) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const socket = io(`${WS_URL}/admin`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('Admin connection timeout'));
    }, 10_000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve({ socket, connectMs: Date.now() - start, disconnect: () => socket.disconnect() });
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

async function run() {
  console.log(`WebSocket Load Test — ${CLIENT_COUNT} clients\n`);

  const login = await req('POST', '/auth/admin/login', {
    email: process.env.SUPER_ADMIN_EMAIL ?? 'superadmin@zoomcontrol.local',
    password: process.env.SUPER_ADMIN_PASSWORD ?? 'SuperAdmin123!',
  });
  const adminToken = login.accessToken;

  const users = [];
  for (let i = 0; i < CLIENT_COUNT; i++) {
    const email = `load-${Date.now()}-${i}@test.local`;
    const { user } = await req(
      'POST',
      '/users',
      {
        name: `Load User ${i}`,
        email,
        password: 'LoadTest123',
        status: 'active',
        zoomDisplayName: `Load${i}`,
      },
      adminToken
    );
    const clientLogin = await req('POST', '/auth/login', { email, password: 'LoadTest123' });
    users.push({ id: user.id, clientToken: clientLogin.accessToken, email });
  }
  console.log(`Created ${CLIENT_COUNT} active users`);

  const adminStart = Date.now();
  const adminConn = await connectAdmin(adminToken);
  console.log(`Admin connected in ${adminConn.connectMs}ms`);

  const connectStart = Date.now();
  const clients = await Promise.all(
    users.map((_, i) => connectClient(users[i].clientToken, i))
  );
  const connectTotalMs = Date.now() - connectStart;
  const avgConnectMs = clients.reduce((s, c) => s + c.connectMs, 0) / clients.length;
  console.log(`All ${CLIENT_COUNT} clients connected in ${connectTotalMs}ms (avg ${avgConnectMs.toFixed(0)}ms)`);

  const deactivateStart = Date.now();
  await Promise.all(
    users.map((u) => req('POST', `/users/${u.id}/deactivate`, null, adminToken))
  );
  console.log(`Deactivate API calls done in ${Date.now() - deactivateStart}ms`);

  const forceLeaveStart = Date.now();
  const results = await Promise.all(clients.map((c) => c.waitForForceLeave()));
  const received = results.filter(Boolean).length;
  const forceLeaveMs = Date.now() - forceLeaveStart;
  console.log(`FORCE_LEAVE received by ${received}/${CLIENT_COUNT} clients in ${forceLeaveMs}ms`);

  clients.forEach((c) => c.disconnect());
  adminConn.disconnect();

  for (const u of users) {
    await req('DELETE', `/users/${u.id}`, null, adminToken).catch(() => {});
  }

  console.log('\n--- Summary ---');
  console.log(`Clients:           ${CLIENT_COUNT}`);
  console.log(`Connect total:     ${connectTotalMs}ms`);
  console.log(`Connect avg:       ${avgConnectMs.toFixed(0)}ms`);
  console.log(`FORCE_LEAVE rate:  ${received}/${CLIENT_COUNT} (${((received / CLIENT_COUNT) * 100).toFixed(0)}%)`);
  console.log(`FORCE_LEAVE time:  ${forceLeaveMs}ms`);

  if (received < CLIENT_COUNT * 0.9) {
    console.error('\n❌ Less than 90% received FORCE_LEAVE');
    process.exit(1);
  }

  console.log('\n✅ Load test passed.\n');
}

run().catch((err) => {
  console.error('\n❌ Load test failed:', err.message);
  process.exit(1);
});
