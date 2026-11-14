# R3 — Regression Results

## Pre-repair (baseline `9f4a48a`)

| Test | Result |
|---|---|
| `gallerySignedUrl.contract.spec.ts` → GalleryPostCard refresh/`@error` | **FAIL** |
| `awardingAndCrossSystem.contract.spec.ts` → WRP-002 | **FAIL** |
| Other tests in those files | Pass |

## Post-repair

### Unit / contract

| Suite | Result |
|---|---|
| `gallerySignedUrl.contract.spec.ts` | **Pass** (4) |
| `signedPhotoLifecycle.r3.spec.ts` | **Pass** (9) |
| `awardingAndCrossSystem.contract.spec.ts` (incl. WRP-002) | **Pass** |
| `tests/unit/qa2-reliability/*` (broader) | 103 pass / **1 known fail** (`processImage` empty-MIME GIF — not R3) |
| Gallery merge / unread / achievement visibility units | **Pass** |

### Typecheck / build

| Check | Result |
|---|---|
| `npm run typecheck` | **Pass** |
| `npm run build` | **Pass** |

### Real disposable backend `:56321` (`scripts/qa2b/repro-r3-signed-url.mjs`)

| Step | Kind | Result |
|---|---|---|
| Seed drink_log + photo | Real backend mutate (Agent 2 only) | Pass |
| Fresh signed URL `expires_in=60` HTTP 200 | Real short TTL | Pass |
| After 65s same URL HTTP 400 | **Real expiry** (not simulated) | Pass (recorded prior full wait) |
| Re-sign after expiry HTTP 200 | Real recovery | Pass (recorded prior full wait) |
| Missing UUID → `PHOTO_NOT_FOUND` | Permanent denial | Pass |
| Ship-only player → `GAME_MEMBERSHIP_REQUIRED` | Permission denial | Pass |
| Browser inject dead `img.src` → remount with new host | **Simulated** E2B-L03 class | Pass |
| Gallery full viewer opens with src | Browser | Pass |
| Organizer cruise id unchanged | Safety | Pass |

Evidence: `evidence/repro-r3-report.json`, `evidence/e2b-l03-recovery.png` (no signed URL material).

## Coverage matrix (required behaviors)

| Behavior | Covered by |
|---|---|
| Fresh valid URL renders | Browser gallery + unit start |
| Expired URL renew via authorized path | Real 60s expiry + re-sign on `:56321` |
| URL expiring while page open | Lifecycle proactive timer unit + viewer heuristic |
| Failed renewal then recovery | Transient-keep + online unit; browser `@error` |
| Network reconnect | `onOnline` unit |
| Gallery feed → full viewer → back | Browser viewer open + close |
| Wrapped photo display | Shared helper + WRP-002 contract (lifecycle identical to Gallery) |
| Multiple images expiring together | Coalesced sign map (unit) |
| Deleted / unavailable | Permanent failure unit + `PHOTO_NOT_FOUND` live |
| Permission-denied | Cross-game live denial |
| Unmount during refresh | Late-result ignored unit |
| Repeated navigation | Card remount via composable start/stop |
| Long inactive reopen | Visibility handler (unit); optional 1h soak still outstanding |

## Explicit non-claims

- Simulated `@error` injection **does not** prove a one-hour soak.
- Real expiry proof used the RPC **60s floor**, not a 3600s wall-clock soak.
- Wrapped browser Polaroid pass was via shared code path + contract; full Wrapped finale browser pass was not required for this repair once Gallery recovery and WRP contracts were green.
