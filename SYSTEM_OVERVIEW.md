# ZoomControl — System Overview & Workflow

## Architecture

```
┌─────────────────┐       REST + WebSocket      ┌──────────────────────┐
│  Admin Portal   │ ◄──────────────────────────► │   Backend (Node.js)  │
│ localhost:5173  │                              │   localhost:3001     │
└─────────────────┘                              └──────────┬───────────┘
                                                            │
┌─────────────────┐       REST + WebSocket                  │
│  Android APK    │ ◄───────────────────────────────────────┘
│  (Zoom SDK)     │                                         │
└─────────────────┘                              ┌──────────┴───────────┐
                                                 │   MongoDB Atlas      │
                                                 │  + Zoom API          │
                                                 └──────────────────────┘
```

---

## The Two Types of Users

### 1. Super Admin
- Created by the seed script (`npm run seed`)
- Has all permissions: manages other admins, manages APK users, sees all audit logs
- Default login: `superadmin@zoomcontrol.local` / `SuperAdmin123!`
- Can create / deactivate / delete regular admins

### 2. Admin
- Created by super admin through the portal
- Can manage APK users (create, activate, deactivate)
- Can start / end Zoom meetings
- Can see the live dashboard, recordings, audit logs (own actions only)

### 3. APK User (Client)
- Created by an admin through the portal
- Logs in via the **Android app only** (not the portal)
- Joins Zoom meetings via the Zoom Meeting SDK

---

## Full Workflow Step by Step

### Step 1 — Admin logs into the Portal

```
Admin → POST /api/auth/admin/login  { email, password }
      ← accessToken (JWT, 1hr) + refreshToken (7 days)
```

The portal stores the JWT and sends it as `Authorization: Bearer <token>` on every request.

---

### Step 2 — Admin creates an APK user

```
Admin (portal) → POST /api/users
                 { name, email, phone, password, zoomDisplayName }
              ← user created with status: "pending"
```

The user is now in MongoDB but **cannot log in yet** — they remain `pending` until activated.

---

### Step 3 — Admin activates the user

```
Admin (portal) → POST /api/users/:id/activate
              ← user status → "active"
```

At this moment two things happen automatically:
- A Zoom SDK JWT is generated for the user
- A `REJOIN_ALLOWED` WebSocket event is pushed to the Android app (if already connected)

---

### Step 4 — Admin starts a Zoom meeting

```
Admin (portal) → POST /api/session/start
              ← meeting created via Zoom API
                 (meetingNumber, password, uuid stored in MongoDB)
```

All **active** users immediately receive a `SESSION_STARTED` WebSocket event with the meeting number and password.

---

### Step 5 — APK User logs in (Android app)

```
APK → POST /api/auth/login
      { email, password, device: { deviceId, deviceModel, manufacturer, androidVersion, appVersion } }
   ← { status, accessToken, refreshToken, sessionId, user }
```

Possible response statuses:

| Status | Meaning |
|--------|---------|
| `SUCCESS` | Login ok → go to Home screen |
| `PROFILE_REQUIRED` | First login → show Profile screen |
| `DEVICE_CONFLICT` | Already logged in on another device |
| `INVALID_CREDENTIALS` | Wrong email or password |
| `USER_INACTIVE` | Account not yet activated |
| `USER_DEACTIVATED` | Account deactivated by admin |

---

### Step 6 — APK User completes profile (if PROFILE_REQUIRED)

```
APK → POST /api/users/profile  (Bearer token)
      { name, phone }
   ← { status: "SUCCESS", profileComplete: true }
```

After this, app navigates to Home screen.

---

### Step 7 — APK calls /api/home

```
APK → POST /api/home  (Bearer token)
      { deviceId, sessionId }
   ← {
       status: "SUCCESS",
       user: { name, phone, active },
       meeting: { meetingId, meetingLink, meetingPassword, sdkKey, title },
       websocket: { url: "wss://...", heartbeatIntervalSeconds: 10 }
     }
```

Possible home statuses:

| Status | App behaviour |
|--------|--------------|
| `SUCCESS` | Show home screen, open WebSocket |
| `NO_MEETING_ASSIGNED` | Show home screen empty state |
| `USER_DEACTIVATED` | Show account error screen |
| `LOGGED_OUT` | Clear local data, navigate to Login |
| `DEVICE_CONFLICT` | Show device conflict error screen |

---

### Step 8 — APK opens WebSocket connection

```
APK connects to:  ws://localhost:3001/client
                  (accessToken in socket.handshake.auth.token)

Every 10 seconds:
APK → { type: "HEARTBEAT", userId, deviceId, sentAt }
    ← { type: "HEARTBEAT_ACK", serverTime }
```

Backend tracks `lastSeenAt` in `DeviceSession` on every heartbeat.

---

### Step 9 — APK gets Zoom SDK token and joins meeting

```
APK → POST /api/token/zoom  (Bearer token)
   ← { sdkJwt, meetingNumber, password }
```

The APK uses `sdkJwt` to authenticate with the Zoom Meeting SDK and join the meeting programmatically. No Zoom UI is shown — the APK fully controls the call.

---

### Step 10 — Zoom sends webhook events to backend

When participants join/leave/mute in the Zoom meeting, Zoom calls:

```
Zoom → POST /api/webhooks/zoom  (HMAC-SHA256 verified)
       events: participant_joined, participant_left,
               participant_audio_muted, meeting_ended, recording_completed
```

Backend processes these and:
- Updates `SessionState` in MongoDB (who is in the call, muted/unmuted)
- Pushes real-time events to the Admin portal via WebSocket (`/admin` namespace)

---

### Step 11 — Admin sees live dashboard

The admin portal connects to `ws://localhost:3001/admin`. It receives real-time events:

| Event | Meaning |
|-------|---------|
| `participant:joined` | User joined the Zoom meeting |
| `participant:left` | User left the Zoom meeting |
| `participant:muted` | User muted |
| `participant:unmuted` | User unmuted |
| `session:ended` | Meeting ended |

---

### Step 12 — Admin deactivates a user (force-leave)

```
Admin (portal) → POST /api/users/:id/deactivate
```

Backend immediately:
1. Sets user `status → inactive` in MongoDB
2. Revokes their Zoom SDK JWT
3. Emits `FORCE_LEAVE` to the APK via WebSocket → APK leaves the Zoom call
4. Emits `USER_DEACTIVATED` to the APK → APK shows error screen
5. Calls Zoom API to remove the participant from the live call

---

## Complete System Flow (summary)

```
Super Admin
    │ creates Admin
    ▼
Admin Portal
    │ creates User ──────────────── status: pending
    │ activates User ─────────────── status: active
    │ starts Meeting ─────────────── Zoom API creates meeting
    ▼
Backend ──────────────────────────────────────────────────► Android APK
         SESSION_STARTED    (WebSocket)                       │ POST /api/auth/login
         REJOIN_ALLOWED     (WebSocket)                       │ POST /api/users/profile
         FORCE_LEAVE        (WebSocket)                       │ POST /api/home
         USER_DEACTIVATED   (WebSocket)                       │ WebSocket heartbeat
         MEETING_UPDATED    (WebSocket)                       │ POST /api/token/zoom
         FORCE_LOGOUT       (WebSocket)                       │ joins Zoom SDK
                                                              ▼
                                                         Zoom Meeting
                                                              │
                                                    Zoom Webhooks (HMAC verified)
                                                              │
                                                    Backend processes events
                                                              │
                                                    Admin Portal live dashboard
                                                    (participant list, mute status)
```

---

## Full API Reference

### Admin APIs (require admin JWT)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/admin/login` | Admin login |
| POST | `/api/auth/admin/refresh` | Refresh admin token |
| POST | `/api/auth/admin/logout` | Admin logout |
| GET | `/api/admins` | List all admins (super admin only) |
| POST | `/api/admins` | Create admin (super admin only) |
| PATCH | `/api/admins/:id` | Update admin |
| POST | `/api/admins/:id/deactivate` | Deactivate admin |
| GET | `/api/users` | List APK users |
| POST | `/api/users` | Create APK user |
| PATCH | `/api/users/:id` | Update APK user |
| POST | `/api/users/:id/activate` | Activate user |
| POST | `/api/users/:id/deactivate` | Deactivate user |
| DELETE | `/api/users/:id` | Delete user |
| GET | `/api/session/current` | Get live session state |
| POST | `/api/session/start` | Start a Zoom meeting |
| POST | `/api/session/end` | End the live meeting |
| POST | `/api/session/participants/:userId/remove` | Remove participant |
| GET | `/api/recordings` | List recordings |
| GET | `/api/audit-logs` | Audit log |

### APK / Client APIs (require client JWT)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | APK login (with device info) |
| POST | `/api/auth/refresh` | Refresh client token |
| POST | `/api/auth/logout` | APK logout |
| POST | `/api/users/profile` | Save name + phone |
| POST | `/api/home` | Get home data + meeting info |
| POST | `/api/token/zoom` | Get Zoom SDK JWT to join meeting |

### WebSocket

| Namespace | Used by | Auth |
|-----------|---------|------|
| `/admin` | Admin portal | Admin JWT |
| `/client` | Android APK | Client JWT |

---

## Security

| Concern | How it is handled |
|---------|------------------|
| Admin vs client separation | Separate JWT types (`type: admin` / `type: client`) |
| Zoom SDK key protection | JWT generated server-side only, never in APK |
| Webhook integrity | HMAC-SHA256 verified with `ZOOM_WEBHOOK_SECRET_TOKEN` |
| Device conflict | One active device per user enforced via `DeviceSession` model |
| Token revocation | Refresh tokens stored as hashed values, revoked on logout/deactivate |
| Short-lived SDK tokens | Zoom SDK JWT TTL is 20 minutes |
