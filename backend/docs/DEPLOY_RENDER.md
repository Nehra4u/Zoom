# Deploy Backend to Render

The Android APK depends on `sdkKey` + `jwtToken` from `/api/home`, WebSocket events, and `/api/token/zoom`. Production must run the **latest** `backend/` code and have Zoom SDK env vars set.

## Prerequisites

| Variable | Required | Purpose |
|----------|----------|---------|
| `ZOOM_SDK_KEY` | **Yes** | Returned to APK as `meeting.sdkKey` / `sdkKey` |
| `ZOOM_SDK_SECRET` | **Yes** | Signs JWT server-side — **never** sent to APK |
| `PUBLIC_API_URL` | **Yes** | Must be `https://zoomcontrol.onrender.com` so `websocket.url` is correct |
| `MONGODB_URI` | Yes | Shared Atlas cluster |
| `JWT_CLIENT_SECRET` | Yes | APK access tokens |
| `JWT_ACCESS_SECRET` | Yes | Admin access tokens |
| `JWT_REFRESH_SECRET` | Yes | Refresh tokens |

If `ZOOM_SDK_KEY` is missing, APIs return `sdkKey: null` and the APK cannot initialize the Zoom SDK.

## Render service settings

1. **Root directory:** `backend`
2. **Build command:** `npm install`
3. **Start command:** `npm start`
4. **Branch:** `main` (auto-deploy on push)

## Deploy steps

```bash
# 1. Verify local sdkKey audit passes
cd backend
npm run audit:prod-sdkkey   # against localhost

# 2. Push latest main to GitHub (triggers Render auto-deploy)
git push origin main

# 3. In Render dashboard → Environment:
#    - Set ZOOM_SDK_KEY and ZOOM_SDK_SECRET (from Zoom Marketplace → Meeting SDK app)
#    - Set PUBLIC_API_URL=https://zoomcontrol.onrender.com
#    - Confirm MONGODB_URI and JWT secrets match local .env

# 4. Manual redeploy if needed: Render → Manual Deploy → Deploy latest commit

# 5. Verify production after deploy
PROD_API_BASE=https://zoomcontrol.onrender.com/api \
APK_USERNAME=<apk-user-email> \
APK_PASSWORD=<apk-password> \
npm run audit:prod-sdkkey
```

## Verify sdkKey on production

```bash
npm run audit:prod-sdkkey
```

Expected when meeting is live:
- `meeting.sdkKey` — non-null string
- `meeting.jwtToken` — present
- `/api/token/zoom` → `sdkKey` + `sdkJwt`

## Known production drift (Jul 2026)

Before redeploy, production may still expose:
- Login field: `email` (legacy) vs `username` (new code)
- Home field: `status` vs `currentStatus`
- `sdkKey: null` when `ZOOM_SDK_KEY` env var is unset

After deploy + env setup, production should match [Android_APK_API_Guide.md](../../Android_APK_API_Guide.md).

## Audit script

```bash
# Local
PROD_API_BASE=http://localhost:3001/api npm run audit:prod-sdkkey

# Production (existing APK user)
PROD_API_BASE=https://zoomcontrol.onrender.com/api \
APK_USERNAME=user@example.com APK_PASSWORD=secret npm run audit:prod-sdkkey
```

The script auto-creates a temp admin + APK user when `SUPER_ADMIN_*` credentials are in `.env`.
