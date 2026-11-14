# R3 — Root Cause

## Defect class

**REP-SIGNED-001** — Gallery / Wrapped photographs use Storage signed URLs (~3600s) minted once, then never renewed. When the URL expires (or fails to load), the UI has no recovery path.

## Evidence chain

| ID | Surface | Observation |
|---|---|---|
| REL-008 | Gallery | Static inspection + unit contract: no timer / no `@error` reload |
| E2E-030 | Gallery (QA-2A) | Confirmed by inspection; short-session load OK |
| E2B-L03 | Gallery stress | Simulated dead `img.src` → error fires; `hasOnErrorAttr=false`; no recovery |
| WRP-002 | Wrapped Polaroid | Same one-shot `fetchGalleryPhotoSignedUrl` path |

## Technical cause

1. `fetchGalleryPhotoSignedUrl` correctly authorizes via `create_*_photo_signed_url` then mints a Storage signed URL.
2. `GalleryPostCard.loadThumb()` / `WrappedPhotoCard.loadPhoto()` called that helper **once** on mount (and on `photo_id` change for Wrapped).
3. Neither card attached `@error` handlers on `<img>` / `FramedPhoto`.
4. No scheduling existed to renew before `expires_in`.
5. `PhotoViewer` displayed the parent-provided URL only.
6. `FramedPhoto` did not forward native image errors to parents.

## Why guests feel it

Ship Wi-Fi + backgrounded tabs + finale Wrapped browsing routinely exceed one hour. Photographs that were valid at open become broken `<img>` placeholders with no automatic path back to a working authorized URL (short of remount / navigation that recreated the component and happened to re-sign).

## Non-causes (out of scope / verified separately)

- Storage RLS / private bucket policy — signing RPC already gates membership + bound accepted gallery photos.
- Migration `11100` Wrapped ranking — R6 only.
- Photo staging / abandon (R2) and submit idempotency (R1) — disjoint.
