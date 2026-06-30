# ZoomControl Backend

Node.js + Express API for the ZoomControl platform.

## Setup

```bash
cp .env.example .env
npm install
npm run seed    # creates first super admin
npm run dev     # http://localhost:3001
```

## MongoDB

Local MongoDB on `mongodb://localhost:27017/zoomcontrol`, or use Docker:

```bash
docker compose up -d
```

## Default super admin (from .env)

- Email: `superadmin@zoomcontrol.local`
- Password: `SuperAdmin123!`

## Phase 1 endpoints

- `POST /api/auth/admin/login|refresh|logout`
- `GET/POST/PATCH/DELETE /api/admins/*` (super admin only)
- `GET /api/health`

## Phase 2 endpoints

- `GET/POST/PATCH/DELETE /api/users/*` (admin + super admin)
- `POST /api/users/:id/activate|deactivate` — emits WebSocket events to APK clients

## Phase 3 endpoints & WebSocket

- `GET /api/session/current` — live participant snapshot + active meeting
- `POST /api/session/start` — create instant Zoom meeting (admin)
- `POST /api/session/end` — end live meeting (admin)
- `POST /api/session/participants/:userId/remove` — kick from call without blocking account
- `POST /api/session/dev/simulate` — dev-only event simulator (join/leave/mute/unmute/ended)
- `POST /api/auth/login|refresh|logout` — APK client auth (for `/client` socket namespace)

### Socket.io namespaces

| Namespace | Auth | Room | Events |
|---|---|---|---|
| `/admin` | Admin JWT | `admin:session` | `participant:joined`, `participant:left`, `participant:muted`, `participant:unmuted`, `session:ended`, `recording:available` |
| `/client` | Client JWT | `client:{userId}` | `SESSION_STARTED`, `FORCE_LEAVE`, `REJOIN_ALLOWED`, `STATUS_SYNC`, `session:ended` |

## Phase 4 — Zoom Integration

- `POST /api/webhooks/zoom` — HMAC-verified Zoom webhooks (raw body)
- `POST /api/webhooks/dev/simulate` — dev-only webhook simulator
- `POST /api/token/zoom` — APK client Zoom SDK JWT (client JWT required)
- `GET /api/recordings` — recording metadata list
- `GET /api/recordings/:id/play-url` — fresh play URL from Zoom API

Set `ZOOM_MOCK=true` in `.env` to run without real Zoom credentials.

See [docs/ZOOM_SETUP.md](docs/ZOOM_SETUP.md) for Atlas, Zoom Marketplace apps, and webhook registration.

```bash
npm run test:mongo    # verify MongoDB connection
npm run zoom:check    # verify Zoom OAuth + print webhook URL
```

## Phase 6 — Hardening

- Reconciliation job every 60s (`RECONCILE_INTERVAL_MS`, disable with `RECONCILE_ENABLED=false`)
- `GET /api/audit-logs` — super admin sees all; admin sees own actions
- `POST /api/audit-logs/reconcile` — manual reconciliation (super admin)
- Token rotation: previous SDK `jti` revoked when issuing new token
- Smoke tests: `npm run test:smoke`
- Full E2E (spec flows 27 & 28): `npm run test:e2e`
- WebSocket load test: `CLIENTS=20 npm run test:ws-load`
