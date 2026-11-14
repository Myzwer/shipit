# NETWORK_RECOVERY — QA-2 Agent 2

**Isolation:** All network behavior tested with mocks / static contracts. No calls to `:54321` or `:55321` for mutating work. Browser DevTools throttling was **not** claimed as cruise Wi-Fi proof.

## Mechanisms present (good)

| Mechanism | Where | Notes |
|---|---|---|
| Begin idempotency UUID | `PhotoCapture` + `begin_photo_upload` | Minted per selection; `BEGIN_REQUEST_CONSUMED` surfaced |
| Pending slot before upload | `stageProcessedPhoto` `onPending` | Enables retry after lost response |
| Reconcile via `get_my_photo` | `reconcilePendingSlot` | Confirm-only if object already present |
| Upload network mapping | `StagePhotoError` `NETWORK` | Player-facing retry copy |
| Confirm honesty | Confirm `ok:false` throws | Does not fake staged success |
| Drink submit unknown | `submitDrink` | Network/timeout/empty code → `unknown`; pending in localStorage |
| Scavenger/Daily pending | `pendingScavengerSubmit` / daily equivalent | Survives reload; form lock + retry modal |
| Drink log BUSY guard | `drinkLogWizard.performSubmit` | Rejects re-entry while submitting |

## Failure matrix (executed)

| Condition | Behavior | Status |
|---|---|---|
| `navigator.onLine === false` before begin | Hard block `OFFLINE` | Pass (mock) — see risk: false offline |
| Upload `Failed to fetch` | `NETWORK`, local image + pending kept | Pass |
| Storage 409 / already exists | Continue to confirm | Pass |
| Confirm fails | Error + retry; not success | Pass |
| Abort before begin | `ABORTED` | Pass |
| Abort mid-upload via signal | Signal **not** passed to `upload()` | **FAIL REL-005** |
| Lost confirm, object present | Reconcile confirms | Pass |
| Drink RPC network throw | `unknown` outcome | Pass |
| Drink `ok:false` | `rejected`, not confirmed | Pass |
| Scavenger/Daily double-tap while in flight | No early `submitting` return | **FAIL REL-001 / REL-002** |
| Discard / start over staged photo | Clears local only; no `abandonPhotoUpload` | **FAIL REL-003 / REL-004 / REL-009** |

## Recovery UX assessment

**Upload interruption:** Retry path in `PhotoCapture` is real and preserves local processed image + pending reservation — strong for ship Wi-Fi *if* the user stays on the screen.

**Gaps for cruise guests:**

1. **Cannot cancel an in-flight Storage PUT** via the AbortSignal API the staging function already accepts (REL-005). Navigating away mid-upload can leave ambiguous state.
2. **Discard / Start Over / Exit** on Ship It clears UI state without abandoning the staged object → orphaned `game-photos` rows until cleanup runner (REL-003). Same pattern on drink log `resetAll` (REL-004).
3. **Double Submit** on Scavenger/Daily relies on button `:disabled` + server idempotency, not an in-function re-entry guard (unlike Drink log). Rapid double-tap after `await` yield can fire a second RPC (REL-001/002). Usually same idempotency key → replay, but UX and pending writes are racey.
4. **`navigator.onLine`** alone is a weak cruise signal (can be `true` while captive portal / packet loss). Suspected risk, not a confirmed functional bug.

## What was not safely simulated here

- Real high latency / low bandwidth against Storage
- Actual multi-tab concurrent uploads to a live bucket
- Session JWT expiry mid-upload against live Auth
- Physical airplane Wi-Fi / captive portal

See `UNTESTED.md`.
