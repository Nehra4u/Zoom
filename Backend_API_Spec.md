# ZoomControl — Backend API Spec (APK client)

Scope: endpoints used by the Android app only. Admin portal APIs are unchanged, not covered here.

Auth: `Authorization: Bearer <accessToken>` on every endpoint except `login`.

---

## 1. POST /api/auth/login

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

**Response**
```json
{
  "success": true,
  "status": "SUCCESS",
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

Other `status` values: `PROFILE_REQUIRED`, `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `USER_INACTIVE`, `USER_DEACTIVATED`, `DEVICE_CONFLICT` (includes `activeDevice` object), `VALIDATION_ERROR`.

---

## 2. POST /api/auth/logout

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

## 3. POST /api/users/profile

**Request**
```json
{ "name": "Jane Doe", "phone": "9999999999" }
```

**Response**
```json
{
  "success": true,
  "status": "SUCCESS",
  "user": { "userId": "...", "name": "Jane Doe", "phone": "9999999999", "profileComplete": true, "active": true }
}
```

---

## 4. POST /api/home

Called once when the app opens.

**Response**
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
  }
}
```
`meeting: null` when no live meeting. `currentStatus` also covers `NO_MEETING_ASSIGNED`, `USER_INACTIVE`, `USER_DEACTIVATED`, `NOT_FOUND`.

---

## 5. POST /api/sync — replaces the WebSocket

Called every ~10s while the app is running. **No WebSocket connection is used** — this polling endpoint is the only real-time channel.

**Request**
```json
{
  "phone": "9999999999",
  "email": "user@example.com",
  "action": "SYNC",
  "meetingId": "87654321012"
}
```
`action`: `SYNC` (default, plain heartbeat) | `JOINED` | `LEFT` | `LOGOUT`. `meetingId` required only for `JOINED`/`LEFT`.

**Response — always the same shape**
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
  }
}
```

**All `currentStatus` values:**

| currentStatus | meeting | success |
|---|---|---|
| `SUCCESS` | full object | true |
| `NO_MEETING_ASSIGNED` | `null` | true |
| `USER_ACTIVATED` | full object if live, else `null` | true |
| `USER_DEACTIVATED` | `null` | true |
| `SESSION_ENDED` | `null` | true |
| `USER_INACTIVE` | `null` | false |
| `NOT_FOUND` | `null` | false |

---

## Implementation notes

- **Backend is stateless per poll** — always return current truth, don't try to remember what was last sent to a device. App detects transitions by diffing against its own last-known state.
- **`JOINED`/`LEFT` from the app are hints only** — Zoom webhooks remain the source of truth for `SessionState` (admin dashboard, audit log). Don't let client-reported join/leave override webhook-driven data.
- **`action: LOGOUT` does not revoke tokens** — app must still call `/api/auth/logout` separately for that.
- **Stale session cleanup:** if a user stays marked `inCall` with no `/api/sync` call for ~3-4 missed cycles (crashed app never sends `LEFT`), clean up their session server-side.
- **No `/client` WebSocket namespace is needed anymore.** `/admin` namespace (admin portal live dashboard) is unaffected and stays as-is.
