# ZoomControl

Controlled video conferencing admin platform built on Zoom Meeting SDK.

## Projects

| Directory | Description |
|-----------|-------------|
| [`admin/`](admin/) | React admin portal (Vite + shadcn/ui) |
| [`backend/`](backend/) | Node.js API + WebSocket + Zoom integration |
| [`android/`](android/) | Android APK client (Meeting SDK) |

## Quick start (local)

### 1. Backend

```bash
cd backend
cp .env.example .env
# Fill in .env with MongoDB URI and Zoom credentials
npm install
npm run seed
npm run dev          # http://localhost:3001
```

### 2. Admin portal

```bash
cd admin
npm install
npm run dev          # http://localhost:5173
```

### Default login

- **Super admin:** `superadmin@zoomcontrol.local` / `SuperAdmin123!`

## Zoom setup

See [`backend/docs/ZOOM_SETUP.md`](backend/docs/ZOOM_SETUP.md) for full steps.

1. Create **Server-to-Server OAuth** app + **Meeting SDK** app at [marketplace.zoom.us](https://marketplace.zoom.us)
2. Set credentials in `backend/.env` (see `.env.example`)
3. Register webhook: `https://your-domain.com/api/webhooks/zoom`
4. Set `ZOOM_MOCK=false`

## Architecture

```
Admin Portal (React)  ──REST/WS──►  Backend (Express + socket.io)  ◄──  Zoom Webhooks
                                           │
    Android APK  ──REST/WS─────────────────┘
```

## Tests

```bash
cd backend
npm run zoom:check   # Zoom credentials + webhook URL helper
npm run test:smoke   # Quick API smoke test
npm run test:e2e     # Full lifecycle flows
npm run test:mongo   # MongoDB connection check
```
