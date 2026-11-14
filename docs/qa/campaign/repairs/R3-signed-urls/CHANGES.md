# R3 — Production Changes

## Files modified

| File | Change |
|---|---|
| `src/lib/gallery/api.ts` | Add `requestGalleryPhotoSignedUrl` (ok / permanent / code / expiresIn); keep `fetchGalleryPhotoSignedUrl` wrapper; optional `expiresSeconds` for short-TTL tests |
| `src/lib/gallery/signedPhotoLifecycle.ts` | **New** — coalesced signing, controller with proactive refresh, img-error / online / visibility recovery, permanent-failure stop |
| `src/lib/gallery/useSignedPhotoUrl.ts` | **New** — Vue binding for Gallery / Wrapped cards |
| `src/components/shared/FramedPhoto.vue` | Emit native `error` from `<img>` |
| `src/features/gallery/GalleryPostCard.vue` | Use `useSignedPhotoUrl`; `@error="onPhotoError"` on framed + plain img |
| `src/features/wrapped/WrappedPhotoCard.vue` | Same shared lifecycle + `@error` |
| `src/features/gallery/PhotoViewer.vue` | `@error` renew + ~51m heuristic proactive refresh when `game`/`photoId` provided |
| `src/features/gallery/GalleryFeedView.vue` | Pass `game` + `photo-id` into viewer |
| `src/features/wrapped/WrappedView.vue` | Pass `game` + `photo-id` into viewer |

## Tests / probes

| File | Purpose |
|---|---|
| `tests/unit/qa2-reliability/signedPhotoLifecycle.r3.spec.ts` | **New** — coalesce/proactive/error/transient keep/permanent stop/online/unmount |
| `tests/unit/qa2-reliability/gallerySignedUrl.contract.spec.ts` | Accept default TTL expression; still requires refresh/`@error` |
| `tests/unit/qa3b-achievements-wrapped/awardingAndCrossSystem.contract.spec.ts` | WRP-002 accepts shared helper + `@error`/`onPhotoError` |
| `scripts/qa2b/repro-r3-signed-url.mjs` | **New** — `:56321` real 60s expiry + browser simulated `@error` recovery |

## Intentionally untouched

- Migrations / photo signing RPCs (authorization semantics preserved)
- R1 submission integrity
- R2 media abandon / staging
- R4 admin / catalog
- R5 schedule bootstrap
- R6 Wrapped ranking (`11100`)
- R7 achievement content
- Visual design / polaroid layout CSS (behavior only)
- Organizer `:54321`, Agent 1 `:55321`

## Behavior notes

- Default sign TTL remains **3600s**; RPC floor for short tests is **60s**.
- Proactive refresh uses `setTimeout` at `expiresAt - 90s` (min delay 5s) — not a tight interval.
- Concurrent controllers for the same `game:photoId:ttl` share one in-flight promise.
- Transient proactive failure **keeps** the existing URL and schedules bounded retry.
- Image `@error` clears the dead URL, shows loading/error, renews up to 3 attempts.
- Permanent codes (`PHOTO_NOT_FOUND`, `PHOTO_NOT_AVAILABLE`, membership, etc.) stop further automatic retries.
- Signed URLs are never written into QA evidence JSON.
