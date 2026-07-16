# Android SDK integration reference

Copy `ZoomMeetingJoinHelper.kt` into your APK project (`com.zoomcontrol.app.zoom`).

## Required changes in the Android app

1. **Parse `sdkKey`** from `POST /api/home` → `meeting.sdkKey`
2. **Parse `sdkKey`** from WebSocket events: `STATUS_SYNC`, `SESSION_STARTED`, `USER_ACTIVATED`, `REJOIN_ALLOWED`
3. **Initialize Zoom SDK** with `appKey = sdkKey` (never set `sdkSecret` in the APK)
4. **Join meeting** with `jwtToken` / `sdkJwt` as signature
5. **Fallback:** `POST /api/token/zoom` with `X-Client-Platform: android` when JWT expires

## API responses that include sdkKey

| Source | Fields |
|--------|--------|
| `/api/home` | `meeting.sdkKey`, `meeting.jwtToken` |
| `/api/token/zoom` | `sdkKey`, `sdkJwt` |
| `STATUS_SYNC` | `sdkKey`, `jwtToken` |
| `SESSION_STARTED` | `sdkKey`, `jwtToken` |

`ZOOM_SDK_SECRET` is **never** returned by the backend.

## Full spec

See [Android_APK_API_Guide.md](../Android_APK_API_Guide.md).
