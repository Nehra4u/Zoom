# ZoomControl Android APK

Android client for ZoomControl — joins instant meetings via Zoom Meeting SDK when admin starts a session.

## Prerequisites

1. Android Studio Ladybug or newer
2. Zoom Meeting SDK for Android — download from [Zoom Marketplace](https://marketplace.zoom.us/docs/sdk/native-sdks/android) and place AAR in `app/libs/`
3. Backend running with `ZOOM_MOCK=true` or real Zoom credentials

## Configure

Edit `app/src/main/java/com/zoomcontrol/app/Config.kt`:

```kotlin
const val API_BASE = "http://10.0.2.2:3001/api"  // emulator → host machine
const val WS_BASE = "http://10.0.2.2:3001"
```

For a physical device, use your machine's LAN IP instead of `10.0.2.2`.

## Zoom SDK setup

1. Create a **Meeting SDK** app on Zoom Marketplace
2. Download the Android SDK package
3. Copy `mobilertc.aar` (or current SDK AAR) to `app/libs/`
4. Uncomment the Zoom SDK dependency block in `app/build.gradle.kts`
5. Set `ZOOM_SDK_KEY` in backend `.env` (same app credentials)

## Features

- Email/password login → client JWT
- Persistent WebSocket (`/client` namespace)
- `SESSION_STARTED` → fetch Zoom token → join meeting with `customerKey` = user id
- `FORCE_LEAVE` → leave meeting immediately
- `session:ended` → show meeting ended screen
- Foreground service keeps socket alive during calls

## Build

Open this folder in Android Studio and run **app**.

```bash
./gradlew assembleDebug
```

## Flow

```
Login → WebSocket connect → wait for SESSION_STARTED
  → POST /api/token/zoom → Meeting SDK join (customerKey = userId)
Admin Remove/Block → FORCE_LEAVE → leave meeting
Admin End Meeting → session:ended → UI idle
```
