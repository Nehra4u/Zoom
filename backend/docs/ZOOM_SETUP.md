# Zoom + MongoDB Setup

## MongoDB Atlas

1. Atlas → **Network Access** → add your current IP (or `0.0.0.0/0` for dev).
2. Set `MONGODB_URI` in `.env` (include database name, e.g. `/zoomcontrol`).
3. Verify:

```bash
npm run test:mongo
npm run seed
```

## Zoom Marketplace apps

Create **two** apps at [marketplace.zoom.us](https://marketplace.zoom.us):

### 1. Server-to-Server OAuth

Scopes (minimum):

- `meeting:write:admin`, `meeting:read:admin`
- `user:read:admin`
- `recording:read:admin`

Add to `.env`:

```env
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_HOST_USER_ID=    # run npm run zoom:check to discover
ZOOM_WEBHOOK_SECRET_TOKEN=
ZOOM_MOCK=false
```

### 2. Meeting SDK

```env
ZOOM_SDK_KEY=
ZOOM_SDK_SECRET=
```

## Webhooks (local dev with ngrok)

```bash
ngrok http 3001
```

Set in `.env`:

```env
PUBLIC_API_URL=https://YOUR-SUBDOMAIN.ngrok-free.app
```

Register webhook URL (printed by `npm run zoom:check`):

`https://YOUR-SUBDOMAIN.ngrok-free.app/api/webhooks/zoom`

Subscribe to:

- `meeting.participant_joined`
- `meeting.participant_left`
- `meeting.participant_audio_muted`
- `meeting.participant_audio_unmuted`
- `meeting.ended`
- `recording.completed`

Validate URL in Zoom — backend responds to CRC challenge automatically.

## Zoom Workplace Business settings

At [zoom.us/profile/setting](https://zoom.us/profile/setting):

1. **Recording** → Cloud recording: ON
2. **Meeting** → Join before host: ON
3. **Meeting** → Waiting room: OFF (recommended)

## Verify

```bash
npm run zoom:check
npm run dev
```

Admin portal → **Live Dashboard** → **Start Meeting** creates an instant meeting with cloud recording enabled.
