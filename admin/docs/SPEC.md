# ZoomControl Platform — Project Specification

**Version:** 1.2  
**Status:** Draft  
**Last Updated:** June 2026  
**Audience:** Engineering, Product, QA

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [System Architecture](#2-system-architecture)
3. [Tech Stack](#3-tech-stack)
4. [MongoDB Data Models](#4-mongodb-data-models)
5. [Backend — Node.js / Express](#5-backend--nodejs--express)
6. [Zoom Webhooks — Deep Dive](#6-zoom-webhooks--deep-dive)
7. [Zoom Meeting SDK (Android APK)](#7-zoom-meeting-sdk-android-apk)
8. [Real-Time Layer — WebSocket](#8-real-time-layer--websocket)
9. [Admin Portal — React](#9-admin-portal--react)
10. [Critical Flows](#10-critical-flows)
11. [Security Model](#11-security-model)
12. [API Reference](#12-api-reference)
13. [Environment Variables](#13-environment-variables)
14. [Known Risks & Mitigations](#14-known-risks--mitigations)
15. [Build & Execution Order](#15-build--execution-order)

---

## 1. Project Overview

### What We Are Building

A controlled video conferencing platform built on top of the **Zoom Meeting SDK**. One licensed Zoom account hosts a persistent private meeting. Custom Android APK clients join that meeting. Portal **admins** control who can be in the meeting, monitor participant status in real time, and can force-drop or re-admit users instantly. A **super admin** manages the portal itself — creating, updating, deactivating, and deleting admin accounts.

### Key Capabilities

| Capability | Description |
|---|---|
| Super Admin Management | Super admin creates, updates, deactivates, and deletes portal admin accounts |
| User Management | Admin adds, removes, activates, deactivates client (APK) accounts |
| Gated Meeting Join | APK clients receive a short-lived JWT from our backend before every join attempt — no token, no entry |
| Force Drop | Deactivating a user instantly removes them from the live call |
| Re-admission | Reactivating a user sends them a rejoin signal and a fresh token |
| Live Presence | Admin sees who is in the call and who is not, in real time |
| Mute Monitoring | Admin sees each participant's mute/unmute state |
| Recordings | Admin views and plays back cloud recordings stored by Zoom |

### Scope Boundaries

- **In scope:** Android APK clients only (no web or iOS SDK client)
- **In scope:** Single licensed Zoom host account, single private meeting
- **In scope:** Two portal roles — **super admin** (manages admins) and **admin** (manages APK clients and sessions)
- **In scope:** Admin joining meetings via browser or embedded Web SDK (host account)
- **Out of scope:** Super admin managing APK client accounts directly (delegated to admins)
- **Out of scope:** Multi-meeting management
- **Out of scope:** Chat or file-sharing features

---

## 2. System Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                    ADMIN PORTAL (React + Vite)                   │
│                                                                  │
│  ┌─────────────┐ ┌──────────────┐ ┌─────────────┐ ┌───────────┐ │
│  │ Admin Mgmt  │ │ User Mgmt    │ │ Live Session│ │ Recordings│ │
│  │ (super      │ │ (APK clients)│ │ Presence +  │ │ (Zoom)    │ │
│  │  admin only)│ │              │ │ Mute Status │ │           │ │
│  └──────┬──────┘ └──────┬───────┘ └──────┬──────┘ └─────┬─────┘ │
└─────────┼───────────────┼────────────────┼────────────────┼───────┘
          │ REST API      │ WebSocket      │ REST API       │ REST
          │               │                │                │
┌──────────▼───────────────▼───────────────────────▼───────────────┐
│                    BACKEND (Node.js + Express)                     │
│                                                                    │
│  ┌───────────┐  ┌──────────────┐  ┌────────────┐  ┌──────────┐  │
│  │ Auth &    │  │ WebSocket    │  │ Zoom API   │  │ Webhook  │  │
│  │ JWT       │  │ Broker       │  │ Client     │  │ Handler  │  │
│  │ Issuance  │  │ (socket.io)  │  │            │  │          │  │
│  └─────┬─────┘  └──────┬───────┘  └────┬───────┘  └────┬─────┘  │
│        │               │               │                │        │
│  ┌─────▼───────────────▼───────────────▼────────────────▼─────┐  │
│  │                  MongoDB (Mongoose)                          │  │
│  │  Admins | Users | Sessions | AuditLog | RecordingsMeta      │  │
│  └─────────────────────────────────────────────────────────────┘  │
└──────┬──────────────────────────────────────────────────┬────────┘
       │ Zoom REST API (OAuth)                            │ Incoming Webhooks
       │                                                  │ (HMAC-verified)
┌──────▼──────────────────────────────────────────────────▼────────┐
│                       ZOOM PLATFORM                               │
│   Meeting Host | Participant Events | Cloud Recordings            │
└───────────────────────────────────────────────────────────────────┘
       ▲
       │ Zoom Meeting SDK (Android)
       │ WS connection to our backend (separate channel)
┌──────┴────────────────────────────────────────────────────────────┐
│                  ANDROID APK CLIENTS                               │
│  - Request JWT from our backend before every join                  │
│  - Maintain WebSocket to our backend alongside SDK session         │
│  - Receive FORCE_LEAVE / REJOIN_ALLOWED events from backend        │
└───────────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

```
APK wants to join meeting
  → APK calls POST /api/token/zoom (with app auth header)
  → Backend checks: user.status === 'active'?
      → YES: Generate Zoom SDK JWT → return to APK
      → NO:  Return 403
  → APK uses JWT to call ZoomSDK.joinSession()
  → Zoom fires meeting.participant_joined webhook to our backend
  → Backend updates MongoDB session state
  → Backend emits participant:joined event over WebSocket to admin portal
```

---

## 3. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Admin Frontend | React 18 + Vite | socket.io-client for WS |
| Backend | Node.js 20 + Express 5 | REST + WebSocket server |
| WebSocket | socket.io 4.x | Rooms, reconnection, namespaces |
| Database | MongoDB + Mongoose | Primary data store — all state lives here |
| Android APK | Kotlin + Zoom Meeting SDK for Android | Custom UI over SDK |
| Zoom Integration | Zoom REST API v2 + Meeting SDK | OAuth 2.0 Server-to-Server |
| Auth | JWT (jsonwebtoken) | Short-lived access + refresh tokens |
| Hosting | Any (AWS / GCP / Azure) | Needs public HTTPS URL for webhooks |

### Why MongoDB

MongoDB suits this project well because:
- User documents vary (some have metadata, some don't) — flexible schema handles this cleanly
- Session state is document-shaped (a user's call presence, mute state, join time — all in one document)
- Audit logs are append-only, schema-free records — a natural MongoDB fit
- No complex relational joins needed — all queries are by userId or sessionId

---

## 4. MongoDB Data Models

### 4.1 Admin Collection

Portal users who log into the admin frontend. Separate from APK client users.

```javascript
// Collection: admins
{
  _id: ObjectId,
  name: String,                        // Display name
  email: String,                       // Unique — login identifier
  passwordHash: String,                // bcrypt
  role: {
    type: String,
    enum: ['admin', 'super_admin'],
    default: 'admin'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'deleted'],
    default: 'active'
  },
  createdBy: ObjectId,                 // Super admin who created this admin (ref: admins); null for seed super admin
  createdAt: Date,
  updatedAt: Date,
  lastLoginAt: Date,
  deletedAt: Date                      // Soft delete — null if not deleted
}

// Indexes
{ email: 1 }                           // unique
{ role: 1 }
{ status: 1 }
{ createdBy: 1 }
```

> **Role hierarchy:**
> - **`super_admin`** — Full portal access. Can create, update, deactivate, and delete admin accounts. Cannot be deleted or demoted by regular admins. At least one active super admin must always exist.
> - **`admin`** — Manages APK client users, live sessions, and recordings. Cannot access admin-management routes.

> **Bootstrap:** The first super admin is seeded directly in MongoDB (or via a one-time setup script). All subsequent admins are created by a super admin through the portal.

### 4.2 User Collection (APK Clients)

```javascript
// Collection: users
{
  _id: ObjectId,
  name: String,                        // Display name
  email: String,                       // Unique
  phone: String,                       // Optional
  passwordHash: String,                // bcrypt
  status: {
    type: String,
    enum: ['pending', 'active', 'inactive', 'deleted'],
    default: 'pending'
  },
  zoomDisplayName: String,             // Name shown in Zoom session
  createdBy: ObjectId,                 // Admin who created this user (ref: admins)
  createdAt: Date,
  updatedAt: Date,
  lastActiveAt: Date,                  // Last confirmed in-call timestamp
  deletedAt: Date                      // Soft delete — null if not deleted
}

// Indexes
{ email: 1 }                           // unique
{ status: 1 }                          // frequent filter
{ createdBy: 1 }
```

### 4.3 Session State Collection

Tracks the live state of all participants in the current meeting. This is the source of truth for the admin dashboard's "who is in the call" view.

```javascript
// Collection: sessionStates
{
  _id: ObjectId,
  userId: ObjectId,                    // ref: users
  zoomParticipantId: String,           // Zoom's internal participant ID (from webhook payload)
  zoomDisplayName: String,
  inCall: Boolean,                     // true = currently in meeting
  isMuted: Boolean,
  joinedAt: Date,
  leftAt: Date,                        // null if still in call
  meetingId: String,                   // Zoom meeting number
  updatedAt: Date
}

// Indexes
{ userId: 1 }
{ inCall: 1 }                          // Query all who are currently in call
{ zoomParticipantId: 1 }               // Used for webhook event lookup
```

> **Design note:** `sessionStates` is the single source of truth for live participant state. Webhook handlers write directly to this collection. A few seconds of propagation delay to the admin dashboard is acceptable for this use case.

### 4.4 Audit Log Collection

```javascript
// Collection: auditLogs
{
  _id: ObjectId,
  actorId: ObjectId,                   // Who performed the action (admin or super_admin _id from admins collection)
  actorRole: String,                   // 'admin' | 'super_admin' — denormalized for audit readability
  action: {
    type: String,
    enum: [
      'admin_created', 'admin_updated', 'admin_deactivated', 'admin_activated', 'admin_deleted',
      'user_created', 'user_activated', 'user_deactivated',
      'user_deleted', 'user_force_dropped', 'token_issued',
      'token_revoked', 'recording_accessed'
    ]
  },
  targetAdminId: ObjectId,             // Admin the action was performed on (for admin_* actions)
  targetUserId: ObjectId,              // APK client the action was performed on (for user_* actions)
  meta: Object,                        // Arbitrary extra context (IP, reason, etc.)
  createdAt: Date
}

// Indexes
{ actorId: 1, createdAt: -1 }
{ targetAdminId: 1, createdAt: -1 }
{ targetUserId: 1, createdAt: -1 }
{ action: 1 }
```

### 4.5 Recording Metadata Collection

We do not store Zoom recording files. We store metadata fetched from Zoom's API after each recording is completed.

```javascript
// Collection: recordings
{
  _id: ObjectId,
  zoomMeetingId: String,
  zoomRecordingId: String,             // Unique Zoom recording UUID
  topic: String,
  startTime: Date,
  endTime: Date,
  duration: Number,                    // In seconds
  fileType: String,                    // MP4, M4A, etc.
  fileSize: Number,                    // Bytes
  playUrlFetchedAt: Date,              // When we last fetched the play URL
  // We do NOT store the actual playUrl — it is time-limited.
  // Fetch fresh from Zoom API on each admin access.
  createdAt: Date
}

// Indexes
{ zoomMeetingId: 1, startTime: -1 }
{ zoomRecordingId: 1 }                 // unique
```

### 4.6 Token Revocation Collection

Tracks revoked Zoom SDK JWTs so deactivated users cannot rejoin using a token they already hold.

```javascript
// Collection: revokedTokens
{
  _id: ObjectId,
  jti: String,                         // JWT ID claim — what we revoke
  userId: ObjectId,
  revokedAt: Date,
  expiresAt: Date                      // TTL index — auto-deletes after token would have expired
}

// Indexes
{ jti: 1 }                             // unique — checked on every token request
{ expiresAt: 1 }                       // TTL index: expireAfterSeconds: 0
```

> **How it works:** When a user is deactivated, their outstanding SDK JWT's `jti` is written here. The token endpoint checks this collection before issuing any new SDK JWT. MongoDB's TTL index automatically removes entries once the token would have expired anyway, keeping the collection small.

---

## 5. Backend — Node.js / Express

### 5.1 Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── db.js                  # Mongoose connection
│   │   └── zoom.js                # Zoom API credentials & OAuth
│   ├── models/
│   │   ├── Admin.js
│   │   ├── User.js
│   │   ├── SessionState.js
│   │   ├── AuditLog.js
│   │   ├── Recording.js
│   │   └── RevokedToken.js
│   ├── routes/
│   │   ├── auth.js                # Login, refresh (admins + APK users)
│   │   ├── admins.js              # Super admin: admin CRUD
│   │   ├── users.js               # Admin: APK client CRUD
│   │   ├── token.js               # Zoom SDK JWT generation
│   │   ├── session.js             # Live session state (read-only REST)
│   │   └── recordings.js          # Fetch recording list + fresh play URLs
│   ├── webhooks/
│   │   └── zoom.js                # All Zoom webhook event handlers
│   ├── services/
│   │   ├── zoomApi.js             # Wrapper around Zoom REST API calls
│   │   ├── sessionService.js      # Session state read/write (MongoDB only)
│   │   ├── tokenService.js        # JWT sign/verify/revoke
│   │   └── notificationService.js # WebSocket event broadcast helpers
│   ├── middleware/
│   │   ├── authenticate.js        # Verify our app JWT (admin or client)
│   │   ├── adminOnly.js           # Requires role admin or super_admin
│   │   ├── superAdminOnly.js      # Requires role super_admin
│   │   └── verifyZoomWebhook.js   # HMAC-SHA256 verification
│   ├── socket/
│   │   └── index.js               # socket.io setup, room management, event handlers
│   └── app.js                     # Express + socket.io bootstrap
├── .env
└── package.json
```

### 5.2 Core Middleware: Zoom Webhook Verification

All incoming Zoom webhooks must be verified before processing. Zoom signs every request using HMAC-SHA256 with your Webhook Secret Token. **Never skip this step.**

```javascript
// middleware/verifyZoomWebhook.js
const crypto = require('crypto');

module.exports = function verifyZoomWebhook(req, res, next) {
  const timestamp = req.headers['x-zm-request-timestamp'];
  const signature = req.headers['x-zm-signature'];

  if (!timestamp || !signature) {
    return res.status(401).json({ error: 'Missing Zoom signature headers' });
  }

  // Reject requests older than 5 minutes (replay attack prevention)
  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
    return res.status(401).json({ error: 'Webhook timestamp too old' });
  }

  // Build the message Zoom signed
  const rawBody = req.rawBody; // Must capture raw body before JSON parsing
  const message = `v0:${timestamp}:${rawBody}`;

  const expectedSignature = 'v0=' + crypto
    .createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
    .update(message)
    .digest('hex');

  if (expectedSignature !== signature) {
    return res.status(401).json({ error: 'Invalid Zoom webhook signature' });
  }

  next();
};
```

> **Critical:** Express must capture the raw body before `express.json()` parses it, otherwise the HMAC will not match. Use `express.raw({ type: 'application/json' })` on the webhook route and parse manually, or use a `verify` callback on `express.json()`.

---

## 6. Zoom Webhooks — Deep Dive

### What Are Zoom Webhooks?

Zoom webhooks are HTTP POST requests that Zoom sends **to your server** whenever something happens inside a Zoom meeting. Your server does not poll Zoom — Zoom pushes events to you the moment they occur.

Think of it as Zoom calling your backend and saying: *"Hey, a participant just joined your meeting — here's who they are and what time it happened."*

### How to Configure Them

1. Go to [marketplace.zoom.us](https://marketplace.zoom.us)
2. Create or open your **Server-to-Server OAuth** app (or SDK app)
3. Under **Feature → Event Subscriptions**, click **Add Event Subscription**
4. Set the **Event notification endpoint URL** to your backend webhook endpoint:
   ```
   https://your-domain.com/api/webhooks/zoom
   ```
5. Click **Add Events** and subscribe to the events listed below
6. Copy the **Secret Token** — this is used for HMAC verification

### The Webhook Endpoint URL Must Be

- Publicly accessible over HTTPS (not localhost)
- Respond with HTTP 200 within **3 seconds** — if you need to do slow work, acknowledge first then process async
- Respond to a **CRC validation challenge** from Zoom (first-time verification — see below)

### CRC Challenge — First-Time Validation

When you first register your webhook URL, Zoom sends a challenge request to verify ownership:

```json
{
  "event": "endpoint.url_validation",
  "payload": {
    "plainToken": "abc123xyz"
  }
}
```

Your server must respond within 3 seconds with the HMAC-SHA256 hash of the plain token:

```javascript
// webhooks/zoom.js — handle CRC challenge
if (body.event === 'endpoint.url_validation') {
  const hashForValidation = crypto
    .createHmac('sha256', process.env.ZOOM_WEBHOOK_SECRET_TOKEN)
    .update(body.payload.plainToken)
    .digest('hex');

  return res.json({
    plainToken: body.payload.plainToken,
    encryptedToken: hashForValidation
  });
}
```

### Webhook Events We Subscribe To

These are the specific Zoom webhook events this project uses:

---

#### `meeting.participant_joined`

Fired when any participant joins the meeting.

**Payload structure:**
```json
{
  "event": "meeting.participant_joined",
  "event_ts": 1718000000000,
  "payload": {
    "account_id": "ABC123",
    "object": {
      "id": "98765432100",
      "uuid": "meeting-uuid",
      "host_id": "host-zoom-id",
      "participant": {
        "user_id": "participant-zoom-id",
        "user_name": "John Doe",
        "id": "participant-zoom-id",
        "join_time": "2026-06-01T10:00:00Z"
      }
    }
  }
}
```

**What our backend does:**
1. Match `participant.customer_key` to our MongoDB user (see APK section on `customerKey`)
2. Upsert `SessionState`: set `inCall: true`, `joinedAt`, `zoomParticipantId`
3. Emit `participant:joined` event over WebSocket to the admin portal room

---

#### `meeting.participant_left`

Fired when a participant leaves or is removed from the meeting.

**Payload structure:**
```json
{
  "event": "meeting.participant_left",
  "event_ts": 1718000000000,
  "payload": {
    "object": {
      "participant": {
        "user_id": "participant-zoom-id",
        "user_name": "John Doe",
        "leave_time": "2026-06-01T10:45:00Z",
        "leave_reason": "left the meeting"
      }
    }
  }
}
```

**What our backend does:**
1. Look up `SessionState` by `zoomParticipantId`
2. Update: `inCall: false`, `leftAt: now`
3. Emit `participant:left` event over WebSocket to admin

---

#### `meeting.participant_audio_muted`

Fired when a participant mutes themselves (or is muted by the host).

**Payload structure:**
```json
{
  "event": "meeting.participant_audio_muted",
  "payload": {
    "object": {
      "participant": {
        "user_id": "participant-zoom-id",
        "user_name": "John Doe"
      }
    }
  }
}
```

**What our backend does:**
1. Look up `SessionState` by `zoomParticipantId`
2. Update: `isMuted: true`
3. Emit `participant:muted` over WebSocket to admin

---

#### `meeting.participant_audio_unmuted`

Same structure as muted. Sets `isMuted: false`.

---

#### `recording.completed`

Fired when Zoom finishes processing a cloud recording after a meeting ends. This is the trigger for us to fetch and store recording metadata.

**Payload structure:**
```json
{
  "event": "recording.completed",
  "payload": {
    "object": {
      "id": "98765432100",
      "uuid": "meeting-uuid",
      "host_id": "host-zoom-id",
      "topic": "Private Meeting",
      "start_time": "2026-06-01T10:00:00Z",
      "duration": 45,
      "recording_files": [
        {
          "id": "file-uuid",
          "meeting_id": "meeting-uuid",
          "recording_start": "2026-06-01T10:00:00Z",
          "recording_end": "2026-06-01T10:45:00Z",
          "file_type": "MP4",
          "file_size": 524288000,
          "play_url": "https://zoom.us/rec/play/...",
          "download_url": "https://zoom.us/rec/download/...",
          "status": "completed"
        }
      ]
    }
  }
}
```

**What our backend does:**
1. Persist recording metadata to MongoDB `recordings` collection (not the URL — that is fetched fresh on demand)
2. Emit `recording:available` over WebSocket to admin portal

> **Important:** Zoom's `play_url` and `download_url` in this webhook payload are time-limited and should NOT be stored. When the admin wants to play a recording, the backend calls `GET /v2/meetings/{meetingId}/recordings` fresh from Zoom's API to get a valid URL at that moment.

---

#### `meeting.ended`

Fired when the meeting ends.

**What our backend does:**
1. Update all `SessionState` documents for this meeting: `inCall: false`
2. Emit `session:ended` over WebSocket to admin and all connected APK clients

---

### Webhook Delivery Guarantees

- Zoom delivers webhooks **at-least-once** — the same event may arrive more than once
- Events may arrive **out of order** (e.g., `participant_left` before `participant_joined` in rare edge cases)
- Your handlers must be **idempotent** — use Zoom's `event_ts` (timestamp) and participant IDs to deduplicate

```javascript
// Idempotent update pattern using event_ts
await SessionState.findOneAndUpdate(
  {
    zoomParticipantId: participant.user_id,
    updatedAt: { $lt: new Date(event_ts) }  // Only update if this event is newer
  },
  { inCall: true, joinedAt: new Date(participant.join_time), updatedAt: new Date(event_ts) },
  { upsert: true }
);
```

---

## 7. Zoom Meeting SDK (Android APK)

### What Is the Meeting SDK?

The Zoom Meeting SDK is a **third-party SDK** provided by Zoom. It is not a native Zoom library we write — it is a prebuilt library from Zoom that we embed into our APK. We configure it with credentials and it handles the actual video/audio session lifecycle.

Our APK is a **custom UI shell** around the SDK. We do not control the video transport, codec, or media negotiation — Zoom does. We control:
- When to call `joinSession()` and `leaveSession()`
- What credentials (JWT) we pass to the SDK
- How we respond to events the SDK fires

### SDK Integration Points

```kotlin
// 1. Initialize once on app start
ZoomSDK.getInstance().initialize(context, ZoomSDKInitParams().apply {
  appKey = ""       // Leave blank — JWT auth used instead
  appSecret = ""    // Leave blank
  domain = "zoom.us"
})

// 2. Join a session (called after receiving JWT from our backend)
val params = JoinMeetingParams().apply {
  meetingNo = meetingNumber        // From our backend response
  userName = userDisplayName       // Our user's display name
  password = meetingPassword       // From our backend response
  customerKey = userId             // Our internal userId — embedded here for webhook matching
}
ZoomSDK.getInstance().meetingService.joinMeetingWithParams(context, params, JoinMeetingOptions())

// 3. Leave a session (called on FORCE_LEAVE WebSocket event)
ZoomSDK.getInstance().meetingService.leaveCurrentMeeting(false)
// false = leave (not end for all); only the host can end the meeting
```

### The `customerKey` Field — How We Match Participants

Zoom's Meeting SDK allows passing a `customerKey` (up to 35 characters) when joining. This value appears in webhook payloads as `participant.customer_key`. We use this to embed our internal MongoDB `userId` so we can match Zoom webhook events back to our users without relying on display name matching (which is unreliable).

```json
// Webhook payload with customerKey
"participant": {
  "user_id": "zoom-participant-id",
  "user_name": "John Doe",
  "customer_key": "64a1b2c3d4e5f6a7b8c9d0e1"  // ← our MongoDB userId
}
```

### APK WebSocket Connection

The APK maintains **two connections** simultaneously during an active call:
1. **Zoom Meeting SDK session** — handles audio/video (managed by Zoom's library)
2. **Our backend WebSocket** — receives control events (FORCE_LEAVE, REJOIN_ALLOWED)

```kotlin
// APK: Connect to our backend WebSocket on app start
val socket = IO.socket("https://our-backend.com", opts)
socket.connect()

socket.on("FORCE_LEAVE") { args ->
  val reason = (args[0] as JSONObject).getString("reason")
  // Leave the Zoom session immediately
  ZoomSDK.getInstance().meetingService.leaveCurrentMeeting(false)
  // Show user a message explaining why
  showDeactivatedDialog(reason)
}

socket.on("REJOIN_ALLOWED") { args ->
  val token = (args[0] as JSONObject).getString("meetingToken")
  val meetingNumber = (args[0] as JSONObject).getString("meetingNumber")
  // Re-join the Zoom session with the fresh token
  joinZoomMeeting(token, meetingNumber)
}

socket.on("STATUS_SYNC") { args ->
  // Fired on every WebSocket reconnect
  val isActive = (args[0] as JSONObject).getBoolean("isActive")
  val isInMeeting = (args[0] as JSONObject).getBoolean("shouldBeInMeeting")
  if (!isActive) {
    ZoomSDK.getInstance().meetingService.leaveCurrentMeeting(false)
  }
}
```

### Foreground Service Requirement

Android will kill WebSocket connections when the app is backgrounded. During an active Zoom call, the APK must run a **foreground service** to keep both the SDK session and our WebSocket connection alive.

```kotlin
class MeetingForegroundService : Service() {
  override fun onCreate() {
    super.onCreate()
    startForeground(NOTIF_ID, buildNotification("In meeting..."))
    // WebSocket reconnection logic lives here
  }
}
```

---

## 8. Real-Time Layer — WebSocket

### Library: socket.io

We use socket.io on both the backend and clients (React admin + Android APK).

socket.io gives us:
- **Rooms** — separate namespaces for admin and APK clients
- **Automatic reconnection** — clients reconnect if network drops
- **Acknowledgements** — we can confirm a force-leave was received

### Rooms Architecture

```
socket.io server
├── Namespace: /admin
│   └── Room: admin:session          ← Admin portal subscribes here
│       Events emitted:
│       - participant:joined
│       - participant:left
│       - participant:muted
│       - participant:unmuted
│       - session:ended
│       - recording:available
│
└── Namespace: /client
    └── Room: client:{userId}         ← Each APK client in their own room
        Events emitted:
        - FORCE_LEAVE
        - REJOIN_ALLOWED
        - STATUS_SYNC
```

### Backend WebSocket Setup

```javascript
// socket/index.js
const { Server } = require('socket.io');

module.exports = function setupSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: process.env.ADMIN_PORTAL_URL }
  });

  // Admin namespace — authenticate as admin
  const adminNS = io.of('/admin');
  adminNS.use(authenticateAdminSocket);  // Verify admin JWT (role: admin or super_admin)
  adminNS.on('connection', (socket) => {
    socket.join('admin:session');
    console.log('Admin connected:', socket.id);
  });

  // Client namespace — authenticate as user
  const clientNS = io.of('/client');
  clientNS.use(authenticateClientSocket);  // Verify user JWT
  clientNS.on('connection', (socket) => {
    const userId = socket.data.userId;
    socket.join(`client:${userId}`);

    // Send current status on connect/reconnect
    sendStatusSync(socket, userId);

    socket.on('disconnect', () => {
      console.log('Client disconnected:', userId);
    });
  });

  return io;
};
```

### Emitting Events (from Webhook Handlers)

```javascript
// services/notificationService.js

// Called from zoom webhook handler after participant_joined
function notifyParticipantJoined(io, participant) {
  io.of('/admin').to('admin:session').emit('participant:joined', {
    userId: participant.customerId,      // Our internal userId (from customerKey)
    zoomParticipantId: participant.userId,
    displayName: participant.userName,
    joinedAt: new Date().toISOString()
  });
}

// Called when admin deactivates a user
function forceLeaveUser(io, userId) {
  io.of('/client').to(`client:${userId}`).emit('FORCE_LEAVE', {
    reason: 'account_deactivated',
    message: 'Your account has been deactivated. You have been removed from the call.'
  });
}

// Called when admin reactivates a user
async function notifyRejoinAllowed(io, userId, zoomCredentials) {
  const { sdkJwt, meetingNumber, password } = zoomCredentials;
  io.of('/client').to(`client:${userId}`).emit('REJOIN_ALLOWED', {
    meetingToken: sdkJwt,
    meetingNumber,
    password
  });
}
```

---

## 9. Admin Portal — React

### Role-Based Access

| Feature | Super Admin | Admin |
|---|---|---|
| Login | ✅ | ✅ |
| Live dashboard (presence, mute) | ✅ | ✅ |
| APK client user management | ✅ | ✅ |
| Recordings | ✅ | ✅ |
| Admin account management (CRUD) | ✅ | ❌ |
| Audit log (all actions) | ✅ | Own actions only |

The portal reads `role` from the JWT payload after login and conditionally renders navigation and routes. Super-admin-only routes return **403** from the backend if accessed by a regular admin — the UI must not rely on hiding links alone.

### Pages / Views

| Route | Access | Description |
|---|---|---|
| `/login` | Public | Admin or super admin login |
| `/dashboard` | Admin, Super Admin | Live session view (participant presence, mute status) |
| `/users` | Admin, Super Admin | APK client user management (CRUD) |
| `/users/new` | Admin, Super Admin | Add new APK client user |
| `/users/:id` | Admin, Super Admin | Client user detail + history |
| `/recordings` | Admin, Super Admin | Recording list + playback |
| `/admins` | Super Admin only | List all portal admins |
| `/admins/new` | Super Admin only | Create new admin account |
| `/admins/:id` | Super Admin only | Admin detail, edit, deactivate, delete |

### Super Admin — Admin Management Flow

```
Super admin loads /admins
  → GET /api/admins (super admin JWT required)
  → Renders admin list with status badges

Super admin clicks "Create Admin"
  → POST /api/admins { name, email, password, role: 'admin' }
  → Backend: hash password, insert admins document, write AuditLog (admin_created)
  → Redirect to /admins/:id

Super admin deactivates an admin
  → POST /api/admins/:id/deactivate
  → Backend: set status = 'inactive', invalidate refresh tokens, write AuditLog
  → Deactivated admin cannot log in; existing JWTs expire naturally

Super admin deletes an admin
  → DELETE /api/admins/:id (soft delete)
  → Backend: guard — cannot delete self, cannot delete last super_admin
  → Write AuditLog (admin_deleted)
```

### Live Dashboard Data Flow

```
Admin portal loads /dashboard
  → Connects to socket.io /admin namespace
  → Subscribes to admin:session room
  → Calls GET /api/session/current (initial state snapshot from MongoDB)
  → Renders participant list

WebSocket event arrives: participant:joined
  → React state update → participant appears in list

WebSocket event arrives: participant:muted
  → React state update → mute icon appears next to participant

Admin clicks "Deactivate" on user card
  → POST /api/users/:id/deactivate
  → Backend: marks user inactive in MongoDB
  → Backend: emits FORCE_LEAVE to APK client via WebSocket
  → Backend: logs to auditLog
  → Admin dashboard reflects status change
```

### State Management

Use **React Query** for server state (admin list, user list, recordings) and a **Zustand store** or simple `useState` for WebSocket-fed live session state. Store `role` from the login response in auth context to drive route guards and conditional nav.

---

## 10. Critical Flows

### Flow 1: User Join (Happy Path)

```
1. APK starts → connects WebSocket to our backend (/client namespace)
2. User taps "Join Meeting"
3. APK calls: POST /api/token/zoom
   Headers: Authorization: Bearer <user-app-jwt>
4. Backend:
   a. Verify user JWT
   b. Check user.status === 'active' → 403 if not
   c. Check `revokedTokens` collection in MongoDB → 403 if found
   d. Generate Zoom SDK JWT (signed with ZOOM_SDK_KEY + ZOOM_SDK_SECRET)
   e. Return: { sdkJwt, meetingNumber, password }
5. APK calls ZoomSDK.joinSession() with credentials
6. Zoom fires: meeting.participant_joined webhook
7. Backend webhook handler:
   a. Verify HMAC signature
   b. Extract customerKey → our userId
   c. Upsert SessionState: inCall: true
   d. Emit participant:joined to admin WebSocket room
8. Admin portal renders user as "In Call"
```

### Flow 2: Force Drop (Deactivation)

```
1. Admin clicks "Deactivate" on user
2. POST /api/users/:id/deactivate
3. Backend:
   a. Update User.status = 'inactive' in MongoDB
   b. Write SDK JWT `jti` to `revokedTokens` collection in MongoDB
   c. Write AuditLog entry
   d. Emit FORCE_LEAVE to socket room: client:{userId}
4. APK receives FORCE_LEAVE event
5. APK calls ZoomSDK.leaveCurrentMeeting(false)
6. Zoom fires: meeting.participant_left webhook
7. Backend webhook handler:
   a. Update SessionState: inCall: false
   b. Emit participant:left to admin portal
8. Admin dashboard shows user as offline
9. APK shows "Your account has been deactivated" message
```

### Flow 3: Reactivation + Rejoin

```
1. Admin clicks "Activate" on inactive user
2. POST /api/users/:id/activate
3. Backend:
   a. Update User.status = 'active'
   b. Generate fresh Zoom SDK JWT
   c. Write AuditLog entry
   d. Emit REJOIN_ALLOWED with fresh JWT to socket room: client:{userId}
4. APK receives REJOIN_ALLOWED
5. APK calls ZoomSDK.joinSession() with new credentials
6. Zoom fires meeting.participant_joined → admin dashboard updates
```

### Flow 4: APK Offline During Deactivation

```
1. Admin deactivates user (APK is offline / no WS connection)
2. Backend marks user.status = 'inactive' in MongoDB
3. APK comes back online → WS reconnects
4. Backend receives 'connect' event from client socket
5. Backend calls sendStatusSync(socket, userId):
   a. Reads user.status from MongoDB
   b. Emits STATUS_SYNC: { isActive: false }
6. APK receives STATUS_SYNC
7. APK sees isActive: false → calls leaveCurrentMeeting()
```

### Flow 5: Super Admin Creates Admin

```
1. Super admin navigates to /admins/new
2. Fills form: name, email, password, role (defaults to 'admin')
3. POST /api/admins
4. Backend:
   a. Verify JWT role === 'super_admin'
   b. Validate email uniqueness in admins collection
   c. Hash password, insert Admin document with createdBy = super admin _id
   d. Write AuditLog: admin_created
5. New admin receives credentials (out-of-band — email not in scope for v1)
6. New admin logs in at /login → receives JWT with role: 'admin'
7. New admin can manage APK clients but cannot access /admins routes
```

### Flow 6: Super Admin Deactivates Admin

```
1. Super admin clicks "Deactivate" on /admins/:id
2. POST /api/admins/:id/deactivate
3. Backend:
   a. Guard: cannot deactivate self
   b. Guard: cannot deactivate last active super_admin
   c. Set Admin.status = 'inactive'
   d. Revoke all refresh tokens for that admin
   e. Write AuditLog: admin_deactivated
4. Deactivated admin's next API call or login attempt returns 403
5. If deactivated admin had an open portal session, JWT expires within 1 hour
```

---

## 11. Security Model

### Portal Role Hierarchy

```
super_admin
  └── Can manage admins (create, update, deactivate, delete)
  └── Can do everything an admin can do

admin
  └── Can manage APK client users, sessions, recordings
  └── Cannot manage other admins
```

### Token Architecture

| Token | TTL | Purpose |
|---|---|---|
| User App JWT (access) | 15 minutes | Authenticate API calls from APK to backend |
| User App JWT (refresh) | 7 days | Get new access tokens |
| Zoom SDK JWT | 20 minutes | Authorize the APK to join the Zoom meeting |
| Admin JWT (access) | 1 hour | Admin portal authentication — payload includes `role: 'admin' \| 'super_admin'` |
| Admin JWT (refresh) | 7 days | Refresh admin portal access token |

### Zoom SDK JWT Generation

```javascript
// services/tokenService.js
const jwt = require('jsonwebtoken');

function generateZoomSDKJwt(meetingNumber, role = 0) {
  const payload = {
    sdkKey: process.env.ZOOM_SDK_KEY,
    mn: meetingNumber,
    role: role,           // 0 = attendee, 1 = host
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (20 * 60),   // 20 minute expiry
    tokenExp: Math.floor(Date.now() / 1000) + (20 * 60),
    jti: crypto.randomUUID()  // Store this for revocation
  };

  return {
    token: jwt.sign(payload, process.env.ZOOM_SDK_SECRET),
    jti: payload.jti
  };
}
```

### Security Rules

- SDK credentials (`ZOOM_SDK_KEY`, `ZOOM_SDK_SECRET`) are **never embedded in the APK** — they live on the backend only
- All webhook endpoints verify Zoom's HMAC-SHA256 signature before processing
- Admin portal routes require a valid admin JWT with `role` of `admin` or `super_admin`
- Super-admin-only routes (`/api/admins/*`) require `role === 'super_admin'` — enforced in middleware, not just the UI
- A super admin **cannot delete or deactivate themselves**
- The system **must always retain at least one active super_admin** — enforced at the service layer before delete/deactivate
- Only a super admin can create another super admin (`role: 'super_admin'` on POST /api/admins)
- User app JWTs are short-lived; refresh tokens are stored hashed in MongoDB (separate stores for admins vs APK clients)
- Deactivated APK users have their SDK JWT `jti` written to the `revokedTokens` collection in MongoDB — the token endpoint checks this before every issuance. The WebSocket force-leave handles the immediate drop from the call.
- Deactivated portal admins have refresh tokens revoked immediately; access tokens expire within 1 hour

---

## 12. API Reference

### Auth

| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/admin/login` | Admin or super admin login → returns access + refresh JWT (includes `role`) |
| POST | `/api/auth/admin/refresh` | Exchange admin refresh token for new access token |
| POST | `/api/auth/admin/logout` | Revoke admin refresh token |
| POST | `/api/auth/login` | APK client login → returns access + refresh JWT |
| POST | `/api/auth/refresh` | Exchange APK client refresh token for new access token |
| POST | `/api/auth/logout` | Revoke APK client refresh token |

### Admin Management (Super Admin only)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admins` | List all portal admins (filterable by status, role) |
| POST | `/api/admins` | Create new admin or super admin account |
| GET | `/api/admins/:id` | Get admin detail |
| PATCH | `/api/admins/:id` | Update admin fields (name, email, role) |
| POST | `/api/admins/:id/activate` | Reactivate a deactivated admin |
| POST | `/api/admins/:id/deactivate` | Deactivate admin — revokes refresh tokens |
| DELETE | `/api/admins/:id` | Soft delete admin (guards: not self, not last super_admin) |

### User Management (Admin + Super Admin)

| Method | Path | Description |
|---|---|---|
| GET | `/api/users` | List all users (filterable by status) |
| POST | `/api/users` | Create new user |
| GET | `/api/users/:id` | Get user detail |
| PATCH | `/api/users/:id` | Update user fields |
| POST | `/api/users/:id/activate` | Activate user → triggers REJOIN_ALLOWED |
| POST | `/api/users/:id/deactivate` | Deactivate user → triggers FORCE_LEAVE |
| DELETE | `/api/users/:id` | Soft delete user |

### Token (APK clients)

| Method | Path | Description |
|---|---|---|
| POST | `/api/token/zoom` | Request Zoom SDK JWT (checks user.status first) |

### Session (Admin + Super Admin — read only)

| Method | Path | Description |
|---|---|---|
| GET | `/api/session/current` | Get snapshot of all participants currently in call |

### Recordings (Admin + Super Admin)

| Method | Path | Description |
|---|---|---|
| GET | `/api/recordings` | List recordings from MongoDB (metadata only) |
| GET | `/api/recordings/:id/play-url` | Fetch fresh play URL from Zoom API for this recording |

### Webhooks

| Method | Path | Description |
|---|---|---|
| POST | `/api/webhooks/zoom` | Zoom webhook receiver (HMAC-verified, not authenticated via our JWT) |

---

## 13. Environment Variables

```bash
# App
NODE_ENV=production
PORT=3001
ADMIN_PORTAL_URL=https://admin.your-domain.com

# MongoDB
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/zoomcontrol

# JWT (our app tokens)
JWT_ACCESS_SECRET=<random 64 char string>
JWT_REFRESH_SECRET=<random 64 char string>

# Bootstrap (one-time — used by seed script only, not runtime)
SUPER_ADMIN_EMAIL=admin@your-domain.com
SUPER_ADMIN_PASSWORD=<strong password — change after first login>

# Zoom — Server-to-Server OAuth App
ZOOM_ACCOUNT_ID=<from Zoom marketplace app>
ZOOM_CLIENT_ID=<from Zoom marketplace app>
ZOOM_CLIENT_SECRET=<from Zoom marketplace app>

# Zoom — Meeting SDK App (separate app in marketplace)
ZOOM_SDK_KEY=<from SDK app credentials>
ZOOM_SDK_SECRET=<from SDK app credentials>

# Zoom — Webhook
ZOOM_WEBHOOK_SECRET_TOKEN=<from Feature > Event Subscriptions in your Zoom app>

# Meeting
ZOOM_MEETING_NUMBER=<your private meeting number>
ZOOM_MEETING_PASSWORD=<your private meeting password>
```

> **Note:** You need **two separate apps** on the Zoom marketplace:
> 1. **Server-to-Server OAuth App** — for calling Zoom REST API (fetching recordings, participant lists, etc.)
> 2. **Meeting SDK App** — for generating JWTs that the Android APK uses to join via the Meeting SDK

---

## 14. Known Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| APK offline when deactivated | User stays in call longer than expected | STATUS_SYNC on every WS reconnect — user is dropped when they come back online |
| Zoom webhook delivery failure | Admin dashboard stale | Webhook handlers are idempotent; add periodic reconciliation job that calls Zoom's `/meetings/{id}/participants` API every 60 seconds and diffs against MongoDB |
| Zoom SDK JWT extracted from memory | Deactivated user rejoins with captured token | Short TTL (20 min) + MongoDB `revokedTokens` TTL collection checked at every token request |
| Zoom webhook out-of-order delivery | Incorrect session state | Use `event_ts` field on updates: only apply if event is newer than last update |
| Single meeting — meeting ends unexpectedly | All users dropped, admin loses session | Admin restarts their Zoom session; APK receives `session:ended` event and shows a "Meeting ended" screen with a retry option |
| Android kills WebSocket in background | Force-leave not received | Foreground service keeps connection alive during active calls |
| Super admin deletes last super_admin | Platform locked with no admin manager | Service-layer guard: reject delete/deactivate if it would leave zero active super_admins |
| Admin account compromised | Unauthorized portal access | Super admin deactivates account immediately; refresh tokens revoked; short JWT TTL limits window |

---

## 15. Build & Execution Order

Build in this exact sequence to avoid circular dependencies between components:

**Phase 1 — Foundation**
1. Set up MongoDB cluster (Atlas or self-hosted), create collections and indexes
2. Seed the first super admin account (one-time script or manual insert into `admins` collection)
3. Create both Zoom apps on marketplace.zoom.us — note all credentials
4. Register webhook URL (use ngrok for local dev)

**Phase 2 — Backend Core**
5. Express server scaffold + MongoDB connection
6. Auth system — separate admin vs APK client JWT issuance, refresh, middleware
7. Admin CRUD routes (`/api/admins/*`) with `superAdminOnly` middleware
8. APK client user CRUD routes
9. Zoom webhook receiver — CRC challenge handler + HMAC verification + event parsing

**Phase 3 — Real-Time Layer**
10. socket.io setup — namespaces, rooms, auth middleware
11. Hook webhook event handlers to emit socket.io events
12. Force-leave and rejoin flow end-to-end

**Phase 4 — APK**
13. Android project — embed Zoom Meeting SDK
14. Foreground service for persistent WebSocket connection
15. Token request flow (POST /api/token/zoom before every join)
16. Handle FORCE_LEAVE and REJOIN_ALLOWED events

**Phase 5 — Admin Portal**
17. React app scaffold + socket.io-client
18. Login + JWT storage (read `role` from token for route guards)
19. APK client user management UI
20. Live dashboard — connect to `/admin` namespace, render participant list + mute status
21. Recordings page
22. Super admin: admin management UI (`/admins`, `/admins/new`, `/admins/:id`)

**Phase 6 — Hardening**
23. Reconciliation cron job (diff Zoom participant list vs MongoDB every 60s)
24. Audit log UI in admin portal (super admin sees all; admin sees own actions)
25. Token revocation flow (MongoDB TTL collection)
26. Load test WebSocket broadcast with expected number of concurrent APK clients
27. End-to-end test: create user → join → deactivate → confirm drop → reactivate → confirm rejoin
28. End-to-end test: super admin creates admin → admin logs in → super admin deactivates admin → login blocked

---

*End of Specification*
