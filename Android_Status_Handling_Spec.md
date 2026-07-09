# Android App — Status Handling Spec (polling-based)

How the app should maintain state and react to `POST /api/sync` (and `/api/home` on first load), so status never drifts out of sync with the backend.

---

## 1. Local state model — single source of truth

Keep exactly one local state object, updated **only** from server responses (never inferred from UI actions alone):

```
AppState {
  currentStatus: string        // last value received from /home or /sync
  inCallSdk: boolean           // what the Zoom SDK itself reports right now
  uStatus: string              // pending | active | inactive | deleted
  lastSyncAt: timestamp
}
```

`inCallSdk` and `currentStatus` are **two independent sources of truth that must be reconciled on every poll** — that reconciliation is what keeps status correct:
- `currentStatus` (from backend) = what the app **should** be doing.
- `inCallSdk` (from the Zoom SDK's own callbacks) = what the app **is actually** doing right now.

**No meeting credentials are persisted.** `meetingId`, `meetingPassword`, `meetingHostUrl`, and `jwtToken` from an `/api/home` or `/api/sync` response are used immediately, in memory, to call the SDK's join method for that one call — never written to SharedPreferences/DataStore, never held onto past that call. Every join always uses whatever came back on the current cycle.

Only `AppState` above (no meeting fields in it) gets persisted, so a process restart resumes correctly instead of assuming a fresh "logged out" state — on restart, the app still has to poll once to find out if a meeting is currently active, since it deliberately isn't caching that.

---

## 2. Polling loop

- Call `/api/sync` on a timer. Suggested interval: **5s while `currentStatus == SUCCESS`** (in a call — admin actions like force-remove need to land quickly), **15-20s otherwise** (idle/no meeting).
- Add **±1-2s random jitter** to the interval so many devices don't hit the backend on the exact same tick.
- Use a lifecycle-aware loop (foreground service or a coroutine tied to the app's active lifecycle) rather than `WorkManager` for the in-call interval — `WorkManager`'s minimum periodic interval (15 min) is far too coarse for 5-10s polling; it's fine for something like a low-frequency background sanity check, but not this.
- **A single failed poll is not a status change.** Network hiccups happen. Keep the last known `AppState` as-is, retry with backoff, and only act once you get an actual response. Don't leave a call just because one `/api/sync` call timed out — the Zoom SDK connection is independent of this control channel.
- On `401 Unauthorized`: [open question — see bottom].

---

## 3. Reconciliation table — run this logic on every successful poll

| Server `currentStatus` | `inCallSdk` | Action |
|---|---|---|
| `SUCCESS` / `USER_ACTIVATED` (meeting present) | `false` | Join now using this response's `meetingId`/`meetingPassword`/`meetingHostUrl`/`jwtToken` — used once, immediately, not stored. |
| `SUCCESS` / `USER_ACTIVATED` | `true`, and response's `meetingId` matches the SDK's own current meeting (query the SDK directly, e.g. its `getMeetingInfo()`/current-meeting-number call — don't compare against anything app-stored) | No-op. Already correct. |
| `SUCCESS` / `USER_ACTIVATED` | `true`, and response's `meetingId` does **not** match what the SDK reports it's currently in | Leave the current SDK session first, then join the new one from this response. |
| `NO_MEETING_ASSIGNED` / `SESSION_ENDED` | `true` | Leave the call immediately. |
| `NO_MEETING_ASSIGNED` / `SESSION_ENDED` | `false` | No-op. |
| `USER_DEACTIVATED` | `true` | Leave immediately, show account-deactivated screen, stop the fast (5s) poll rate — fall back to a slow idle poll waiting for reactivation. |
| `USER_DEACTIVATED` | `false` | Show account-deactivated screen, slow poll rate. |
| `USER_INACTIVE` | n/a | Show pending-activation screen, slow poll rate. |
| `NOT_FOUND` / `success: false` | n/a | Treat as an invalid session: clear all local tokens/state, stop polling, navigate to Login. |

---

## 4. When the app sends `action` back

- **`JOINED`** — send on the very next `/api/sync` call after the Zoom SDK's own "join succeeded" callback fires. Don't send it optimistically before the SDK confirms.
- **`LEFT`** — send on the next `/api/sync` call after the SDK's "left/disconnected" callback fires, **regardless of why** it left (user action, force-removed, error) — always report it so the backend's hint-state doesn't go stale.
- **`LOGOUT`** — send once, then stop polling entirely. Order matters:
  1. Stop the polling loop first (avoid a race where a poll fires after logout starts).
  2. Call `/api/auth/logout` (real token revocation).
  3. Send `/api/sync` with `action: LOGOUT` only if step 2 succeeded — otherwise skip it, since without a valid token the call will just 401 anyway.
  4. Clear all local state/tokens, navigate to Login.

---

## 5. Why `inCallSdk` must come from the SDK, not from your own flags

Don't set `inCallSdk = true` the moment you *call* the SDK's join method — set it only inside the SDK's actual success callback, and set it back to `false` only inside its actual leave/disconnect/error callback. If you drive this flag from your own app logic instead of the SDK's real callbacks, the reconciliation table above will reconcile against a lie, and that's exactly the kind of drift that causes "app thinks it's in a call but isn't" bugs.

---

## Open questions

- **Token refresh on `401`.** The backend still has `/api/auth/refresh` in code, even though it was dropped from the Android API doc earlier in this project. Confirm: on a `401` from `/api/sync`, should the app call `/api/auth/refresh` and retry, or just force a full re-login? This materially changes how much error-handling code is needed around the polling loop.
- **Background execution while app is fully backgrounded/killed.** Android restricts background network activity aggressively (Doze, App Standby, manufacturer battery optimizations). If a user is expected to stay "in a call" with the app backgrounded, you likely need a foreground service (with a persistent notification) to keep the 5s poll reliable — confirm this UX tradeoff (a persistent notification while in a call) is acceptable for this product.
