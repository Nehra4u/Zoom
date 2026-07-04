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
- `POST /api/home` — APK bootstrap: user + live meeting credentials + WebSocket config

### Socket.io namespaces

| Namespace | Auth | Room | Events |
|---|---|---|---|
| `/admin` | Admin JWT | `admin:session` | `session:started`, `participant:joined`, `participant:left`, `participant:muted`, `participant:unmuted`, `session:ended`, `recording:available` |
| `/client` | Client JWT | `client:{userId}` | `STATUS_SYNC`, `SESSION_STARTED`, `USER_ACTIVATED`, `USER_DEACTIVATED`, `SESSION_ENDED` (+ legacy `FORCE_LEAVE`, `REJOIN_ALLOWED`, `session:ended`) |

### `/api/home` response (APK bootstrap)

```json
{
  "success": true,
  "currentStatus": "SUCCESS | NO_MEETING_ASSIGNED | USER_INACTIVE | USER_DEACTIVATED",
  "user": { "uId", "name", "phone", "uStatus" },
  "meeting": { "meetingId", "meetingPassword", "meetingHostUrl", "jwtToken" },
  "websocket": { "url": "ws(s)://host/client", "hbInterval": 10 }
}
```

## Phase 4 — Zoom Integration

- `POST /api/webhooks/zoom` — HMAC-verified Zoom webhooks (raw body)
- `POST /api/webhooks/dev/simulate` — dev-only webhook simulator
- `POST /api/token/zoom` — APK client Zoom SDK JWT (client JWT required)
- `GET /api/recordings` — recording metadata list
- `POST /api/recordings/sync` — import cloud recordings from Zoom (last 30 days)
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
- WebSocket client lifecycle: `npm run test:ws-client`
