# Android App — REST API Integration Spec

For implementing Retrofit interfaces. Base URL: `<PUBLIC_API_URL>/api`.

**Auth model:** every endpoint except `login` requires
`Authorization: Bearer <accessToken>` (the client access token returned by `login`).
Missing/invalid/expired token → `401 { "error": "..." }` from middleware (not the endpoint's own JSON shape — see Notes).

**Error shape is inconsistent across endpoints** (see Notes at the end) — handle each endpoint's failure format separately, don't assume one common error model.

---

## 1. POST /auth/login

No auth header required.

**Request**
```json
{
  "email": "user@example.com",
  "password": "secret123",
  "device": {
    "deviceId": "a1b2c3d4",
    "deviceModel": "Pixel 8",
    "manufacturer": "Google",
    "androidVersion": "15",
    "appVersion": "1.0.0"
  }
}
```

**Response — success, profile already complete**
```json
{
  "success": true,
  "status": "SUCCESS",
  "message": "Login successful.",
  "session": { "sessionId": "...", "userId": "...", "deviceId": "a1b2c3d4" },
  "user": {
    "userId": "665f1c2a9b1e4a0012ab34cd",
    "name": "Jane Doe",
    "email": "user@example.com",
    "phone": "9999999999",
    "profileComplete": true,
    "active": true,
    "status": "active",
    "zoomDisplayName": "Jane Doe"
  },
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "eyJhbGciOi..."
}
```

**Response — first login, profile incomplete**
Same shape as above but `"status": "PROFILE_REQUIRED"` and `user.profileComplete: false` — navigate to Profile screen instead of Home.

**Other possible `status` values (all HTTP 200, check `success`/`status`, not HTTP code):**

| status | success | Meaning |
|---|---|---|
| `INVALID_CREDENTIALS` | false | wrong email/password |
| `ACCOUNT_LOCKED` | false | too many failed attempts; message includes retry minutes |
| `USER_INACTIVE` | false | account not yet activated |
| `USER_DEACTIVATED` | false | account deactivated by admin |
| `DEVICE_CONFLICT` | false | already logged in on another device; response includes `activeDevice: { deviceModel, manufacturer, lastSeenAt }` |
| `VALIDATION_ERROR` | false | HTTP 400 — missing email/password |

---

## 2. POST /auth/logout

Requires `Authorization: Bearer <accessToken>`.

**Request**
```json
{
  "refreshToken": "eyJhbGciOi...",
  "userId": "665f1c2a9b1e4a0012ab34cd",
  "sessionId": "...",
  "deviceId": "a1b2c3d4"
}
```

**Response**
```json
{ "success": true, "status": "SUCCESS", "message": "Logged out successfully." }
```

---

## 3. POST /users/profile

Requires `Authorization: Bearer <accessToken>`. Called when login returned `PROFILE_REQUIRED`.

**Request**
```json
{ "name": "Jane Doe", "phone": "9999999999" }
```

**Response — success**
```json
{
  "success": true,
  "status": "SUCCESS",
  "message": "Profile updated successfully.",
  "user": { "userId": "...", "name": "Jane Doe", "phone": "9999999999", "profileComplete": true, "active": true }
}
```

**Response — validation failure** (HTTP 400)
```json
{ "success": false, "status": "VALIDATION_ERROR", "message": "Phone number is required.", "errors": { "phone": "Phone number is required." } }
```

---

## 4. POST /home

Requires `Authorization: Bearer <accessToken>`.

> This endpoint's shape is being updated — implement against this target spec, not the older one. Full details/edge cases: `Home_API_Response_Spec.md`.

**Response — meeting active**
```json
{
  "success": true,
  "currentStatus": "SUCCESS",
  "user": { "uId": "665f1c2a9b1e4a0012ab34cd", "name": "Jane Doe", "phone": "9999999999", "uStatus": "active" },
  "meeting": {
    "meetingId": "87654321012",
    "meetingPassword": "aB12cd",
    "meetingHostUrl": "https://zoom.us/j/87654321012",
    "jwtToken": "eyJhbGciOi..."
  },
  "websocket": { "url": "wss://api.yourdomain.com/client", "hbInterval": 10 }
}
```

**Response — no active meeting:** same shape, `"currentStatus": "NO_MEETING_ASSIGNED"`, `"meeting": null`.

**Other `currentStatus` values:** `USER_INACTIVE`, `USER_DEACTIVATED`, `NOT_FOUND` — all return `"success": false, "user": null, "meeting": null, "websocket": null`.

---

## WebSocket (not Retrofit)

The app also needs a persistent Socket.IO connection to `/client` for real-time meeting control (start/end, activation/deactivation, reconnect sync). This isn't a REST call — use a Socket.IO Android client, not Retrofit. Full event list, payloads, and reconnect handling: see `WebSocket_Communication_Spec.md`.

---

## Notes for implementation

- **Error shape is not consistent.** `login`, `logout`, `profile`, `home` return `{ success: false, status, message }` with HTTP 200 for business-logic failures (check `success`/`status` in the body). Keep this in mind if any other client endpoint is added later that follows a different pattern (e.g. plain `{ error: "..." }` with a real 4xx/5xx).
- **Device conflict:** `login` and `/home`'s underlying logic both care about single-device enforcement via `deviceId`. Make sure the same `deviceId` is sent consistently across `login`, `logout`, and (per the WebSocket spec) `HEARTBEAT`.
