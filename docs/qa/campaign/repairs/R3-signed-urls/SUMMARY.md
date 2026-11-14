# R3 — Signed URL Expiration & Media Display Recovery (REP-SIGNED-001)

**Status:** Repaired and verified on Agent 2 disposable `:56321`  
**Branch:** `repair/r3-signed-urls`  
**Baseline:** `9f4a48a` (post R1/R2)  
**Associated IDs:** REL-008, E2E-030, E2B-L03, WRP-002

## Verdict

Gallery feed thumbnails, the full-size viewer, and Wrapped Polaroids renew authorized signed URLs before expiry and recover from image load failures with a bounded retry budget. Permanent denials (missing / unauthorized / unavailable) stop retrying. Private image URLs are not logged into evidence.

## What was wrong

1. **REL-008 / E2E-030 / E2B-L03** — `GalleryPostCard` signed once on mount; no proactive refresh; no `@error` reload. Simulated dead `img.src` left a broken photograph.
2. **WRP-002** — `WrappedPhotoCard` shared the same one-shot lifecycle.
3. **PhotoViewer** — Received a static URL with no recovery path when left open past TTL.

## What changed (product)

- Shared signed-URL lifecycle (`signedPhotoLifecycle` + `useSignedPhotoUrl`) with:
  - coalesced concurrent sign requests
  - proactive refresh ~90s before expiry (timeout, not continuous / not every render)
  - `@error` → bounded renew
  - online / visibility recovery for transient failures
  - permanent-failure short-circuit
- `FramedPhoto` forwards `error` from the underlying `<img>`
- Gallery + Wrapped cards wire `@error="onPhotoError"`
- `PhotoViewer` renews on error / heuristic proactive refresh when `game` + `photoId` are provided
- Gallery API exposes `requestGalleryPhotoSignedUrl` (richer result) while preserving `fetchGalleryPhotoSignedUrl`

No migrations. Storage RPC authorization unchanged. Migration `11100` / ranking (R6) untouched.

## Verification snapshot

| Check | Result |
|---|---|
| Pre-fix `gallerySignedUrl.contract.spec.ts` | **Failed** (missing refresh/`@error`) |
| Pre-fix WRP-002 contract | **Failed** |
| Post-fix Gallery + WRP contracts + `signedPhotoLifecycle.r3.spec.ts` | **Pass** |
| Real short-TTL expiry on `:56321` (60s floor → HTTP 400 → re-sign 200) | **Pass** |
| Browser simulated `@error` recovery (E2B-L03 class) | **Pass** |
| Gallery full viewer open | **Pass** |
| Missing / cross-game denial | **Pass** (`PHOTO_NOT_FOUND`, `GAME_MEMBERSHIP_REQUIRED`) |
| Organizer cruise id unchanged | **Pass** |
| `typecheck` / `build` | **Pass** |
| Known unrelated: `processImage` empty-MIME GIF | Still expected-red (not R3) |

## Docs in this folder

- `ROOT_CAUSE.md`
- `CHANGES.md`
- `REGRESSION_RESULTS.md`
- `REMAINING_RISKS.md`
- `evidence/` — repro report + screenshots (no signed URL material)
