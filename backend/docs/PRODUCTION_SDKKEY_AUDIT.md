# Production SDK Key Audit Results

**Date:** 2026-07-16  
**Production URL:** `https://zoomcontrol.onrender.com/api`

## Summary

| Check | Local backend | Production (Render) |
|-------|---------------|----------------------|
| `sdkKey` in `/api/home` (live meeting) | Yes | **No** — field missing |
| `jwtToken` in `/api/home` (live meeting) | Yes | Yes |
| `sdkKey` in `/api/token/zoom` | Yes (non-null) | **No** — returns `null` |
| `sdkJwt` in `/api/token/zoom` | Yes | Yes |
| Login field | `username` | `email` (legacy) |
| Home status field | `currentStatus` | `status` / `currentStatus` mixed |

**Root cause:** Production is running an older backend build that predates commit `6d91e12` ("expose Zoom sdkKey to clients"). Latest code is on `origin/main` but Render has not been redeployed with `ZOOM_SDK_KEY` configured.

## APIs that return SDK credentials (new backend)

| Endpoint / Event | Fields |
|------------------|--------|
| `POST /api/home` | `meeting.sdkKey`, `meeting.jwtToken` |
| `POST /api/token/zoom` | `sdkKey`, `sdkJwt`, `meetingNumber`, `password` |
| WebSocket `STATUS_SYNC` | `sdkKey`, `jwtToken`, meeting fields |
| WebSocket `SESSION_STARTED` | `sdkKey`, `jwtToken`, meeting fields |

**`ZOOM_SDK_SECRET` is never returned** — server env only.

## Production test evidence

With live meeting started (`87872263236`):

```json
// POST /api/home — production (Jul 2026)
{
  "meeting": {
    "meetingId": "...",
    "meetingPassword": "...",
    "meetingHostUrl": "...",
    "jwtToken": "eyJ..."
    // sdkKey: MISSING
  }
}

// POST /api/token/zoom — production
{
  "sdkJwt": "eyJ...",
  "sdkKey": null
}
```

Local backend with same user returns `sdkKey: "2h25pranQ1eWv8fQol4bAw"`.

## Re-run audit

```bash
cd backend
npm run audit:prod-sdkkey                                    # local
PROD_API_BASE=https://zoomcontrol.onrender.com/api npm run audit:prod-sdkkey  # production
```

See [docs/DEPLOY_RENDER.md](docs/DEPLOY_RENDER.md) for deployment steps.
