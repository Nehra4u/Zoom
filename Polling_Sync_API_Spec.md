# Polling Sync API Spec — replaces the WebSocket channel

Called by the app every ~10s (see suggestion on variable interval at the end). Replaces `HEARTBEAT`, `STATUS_SYNC`, `SESSION_STARTED`, `USER_ACTIVATED`, `USER_DEACTIVATED`, and `SESSION_ENDED` from the old WebSocket spec with a single request/response pair.

## Endpoint

```
POST /api/sync
```
Requires `Authorization: Bearer <accessToken>`.

## Request

Same identifying fields as `/api/home`, plus an optional `action` for the app to report a state change on the same beat.

```json
{
  "phone": "9999999999",
  "email": "user@example.com",
  "action": "SYNC",
  "meetingId": "87654321012"
}
```

| Field | Required | Notes |
|---|---|---|
| `phone`, `email` | yes | identify the user, same as `/home` |
| `action` | no (default `SYNC`) | one of `SYNC`, `JOINED`, `LEFT`, `LOGOUT` — see below |
| `meetingId` | only for `JOINED` / `LEFT` | which meeting the app is reporting against |

### `action` values

- **`SYNC`** — plain heartbeat / "what's my current state." Send this on every regular 10s tick.
- **`JOINED`** — app successfully joined the Zoom SDK session. Treated as a hint for faster local UI feedback — Zoom's webhook remains the source of truth for the admin dashboard and audit log.
- **`LEFT`** — app left/was removed from the call. Same hint-only caveat as `JOINED`.
- **`LOGOUT`** — app is stopping polling (user logging out). Does **not** revoke tokens — the app should still call `POST /api/auth/logout` separately for actual token revocation. This just tells the backend to stop expecting further polls from this device.

## Response

Same shape every time, regardless of `action` — always reflects current truth.

```json
{
  "success": true,
  "currentStatus": "SUCCESS",
  "user": {
    "uId": "665f1c2a9b1e4a0012ab34cd",
    "name": "Jane Doe",
    "phone": "9999999999",
    "uStatus": "active"
  },
  "meeting": {
    "meetingId": "87654321012",
    "meetingPassword": "aB12cd",
    "meetingHostUrl": "https://zoom.us/j/87654321012",
    "jwtToken": "eyJhbGciOi..."
  }
}
```

## `currentStatus` values (covers everything the socket used to push)

| currentStatus | meeting | Meaning — equivalent old socket event |
|---|---|---|
| `SUCCESS` | full object | meeting is live and assigned to this user — equivalent to `SESSION_STARTED` / staying joined |
| `NO_MEETING_ASSIGNED` | `null` | valid, active user, nothing live right now |
| `USER_ACTIVATED` | full object if live, else `null` | account was just activated — equivalent to `USER_ACTIVATED` |
| `USER_DEACTIVATED` | `null` | account deactivated — equivalent to `USER_DEACTIVATED` / old `FORCE_LEAVE` |
| `SESSION_ENDED` | `null` | the meeting this user was in just ended — equivalent to `SESSION_ENDED` |
| `USER_INACTIVE` | `null` | account not yet activated |
| `NOT_FOUND` | `null` | no user matches phone + email |

**Important — this is stateless on the backend.** The server does not remember what it told a device last time; it always returns current truth. The app is responsible for detecting *transitions* (e.g. "last poll said `NO_MEETING_ASSIGNED`, this poll says `SUCCESS`, so a meeting must have just started — go join it") by comparing against its own last-known state. This keeps the backend simple and avoids having to track per-device delivery state.

**App-side handling, per poll:**
- `SUCCESS` / `USER_ACTIVATED` and app is **not** in a call → join using the meeting fields (always fresh — don't reuse a cached `jwtToken`).
- `SUCCESS` and app **is already** in a call with the same `meetingId` → do nothing.
- `USER_DEACTIVATED` / `SESSION_ENDED` and app **is** in a call → leave immediately.
- `NOT_FOUND` / auth failure → clear local session, navigate to Login.

---

## Suggestions (not yet implemented, for discussion)

- **Keep this endpoint separate from `/api/home`.** Same request shape, different path — `/home` is a one-time full hydrate, this is a lightweight recurring beat. Keeps `/home` free to grow richer later without slowing every device's poll.
- **Variable poll interval.** 10s flat is fine when idle, but once `currentStatus` is `SUCCESS` (in a call), admin actions like "remove participant" now take up to a full poll cycle to reach the device instead of being instant like the old socket push. Consider polling every 5s while in a call and backing off to 15-20s when idle.
- **Missed-poll timeout for stale "in call" state.** A crashed app will never send `action: LEFT`. Treat a user still marked `inCall` server-side with no poll received for ~3-4 missed cycles as dropped, and clean up their session state — same idea as the old heartbeat timeout, just with a longer grace window since polling is less frequent.
- **Client-side jitter.** If many devices poll on the exact same 10s tick, add a small random offset (±1-2s) client-side to avoid bursty DB load.
- **Don't let `action: JOINED`/`LEFT` override Zoom webhook state.** Use them only to make the app's own UI feel responsive; the webhook-driven `SessionState` stays authoritative for anything shown on the admin dashboard or audit log.
