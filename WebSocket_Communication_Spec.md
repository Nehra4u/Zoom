# WebSocket Communication Spec — `/client` namespace

Auth: `socket.handshake.auth.token` (client JWT).

---

## Backend → App

### `SESSION_STARTED`
- **Trigger:** a meeting starts for this user's account, OR the user is allowed to rejoin a meeting already in progress (rejoin no longer gets its own event — just send `SESSION_STARTED` again)
- **Scope:** this user only
- **App should:** use the fields below directly to join — same shape as the `meeting` object returned by `/api/home`
```json
{
  "meetingId": "87654321012",
  "meetingPassword": "aB12cd",
  "meetingHostUrl": "https://zoom.us/j/87654321012",
  "jwtToken": "eyJhbGciOi..."
}
```

### `USER_ACTIVATED`
- **Trigger:** admin activates the user's account
- **Scope:** this user only
- **App should:** treat like a fresh `SESSION_STARTED` — if a meeting is already live, join it immediately using these same fields
```json
{
  "meetingId": "87654321012",
  "meetingPassword": "aB12cd",
  "meetingHostUrl": "https://zoom.us/j/87654321012",
  "jwtToken": "eyJhbGciOi..."
}
```

### `USER_DEACTIVATED`
- **Trigger:** admin deactivates the user's account
- **Scope:** this user only
- **App should:** leave any active call, show account-deactivated state
```json
{}
```

### `SESSION_ENDED`
- **Trigger:** the live meeting ended
- **Scope:** this user only
- **App should:** leave the call if currently in it; return to home/empty state
- **No payload required.**

### `STATUS_SYNC`
- **Trigger:** every time the socket connects — first connect **and** every reconnect (network drop, app backgrounded, etc.)
- **Scope:** this user only
- **Why it matters:** `SESSION_STARTED` / `USER_ACTIVATED` / `USER_DEACTIVATED` / `SESSION_ENDED` are fire-and-forget — if the app's socket was disconnected at the moment one of them was sent, it's lost for good. `STATUS_SYNC` is the reconciliation point that catches anything missed while offline.
- **App should**, on every `STATUS_SYNC`:
  - `shouldBeInMeeting: true` and app is **not** in a call → join using the included meeting fields (always fresh — never reuse a cached `jwtToken`, it may have expired while offline).
  - `shouldBeInMeeting: true` and app is **already** in a call with the same `meetingId` → do nothing.
  - `shouldBeInMeeting: false` and app **is** in a call → leave immediately (this is what catches a deactivation or meeting-end that happened while disconnected).
```json
{
  "isActive": true,
  "shouldBeInMeeting": true,
  "meetingId": "87654321012",
  "meetingPassword": "aB12cd",
  "meetingHostUrl": "https://zoom.us/j/87654321012",
  "jwtToken": "eyJhbGciOi..."
}
```
Meeting fields are omitted (or `null`) when `shouldBeInMeeting` is `false`.

---

## App → Backend

### `HEARTBEAT`
- **Trigger:** sent by the app every ~10 seconds while connected
```json
{
  "timestamp": "2026-07-04T10:15:30.000Z",
  "uId": "665f1c2a9b1e4a0012ab34cd",
  "email": "user@example.com"
}
```

---

## Removed from the previous version

- **`REJOIN_ALLOWED`** — merged into `SESSION_STARTED` (send it again instead of a separate event).
- **`FORCE_LEAVE`** — not required.
- **`MEETING_UPDATED`** — not required.
- **`session:ended`** — renamed to `SESSION_ENDED` for naming consistency with the other events, and no longer needs a payload.
- **`HEARTBEAT_ACK`** — unchanged from the previous version, not covered above since no changes were requested to it.
- **`STATUS_SYNC`** — kept, but its payload is now extended (see above) to double as the reconnect/reconciliation mechanism.

## Open questions

- `HEARTBEAT` no longer includes `deviceId`. The current backend uses `deviceId` from this payload to update `DeviceSession.lastSeenAt` for single-device-login enforcement — confirm whether that check should now be done by `uId` instead, or whether `deviceId` still needs to be added back alongside `timestamp`/`uId`/`email`.
- If the app's own access token expires while the socket is disconnected, the reconnect handshake itself will be rejected before `STATUS_SYNC` can fire. The app needs to catch that connect-error and refresh its access token via REST before retrying the socket connection — otherwise reconnect silently never succeeds.
- Rapid reconnect flapping (e.g. spotty network) could fire `STATUS_SYNC` repeatedly in quick succession — app should debounce/guard so it doesn't attempt overlapping join calls.
