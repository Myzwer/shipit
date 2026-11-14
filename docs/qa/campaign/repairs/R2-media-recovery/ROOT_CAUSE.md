# R2 — Root Cause

## Lifecycle inventory

Photo selection → `processImageFile` → framing editor → `stageProcessedPhoto` (`begin_photo_upload` → Storage `upload` → `confirm_photo_upload`) → submit RPC binds `photo_id` → Gallery.

Temporary media is tracked as `pending_upload` / `staged` rows in `photos` plus objects in `game-photos`.

## REL-003 / E2E-031 / RISK-B — discard orphans staged media

**Symptom:** Start Over, Exit+Discard (Ship It), Daily Exit, and similar paths cleared Vue state / pending submit LS but never called `abandonPhotoUpload`.

**Cause:** Only `PhotoCapture.clearLocal` / Remove abandoned remote slots. Parent wizards held the staged `photoId` after PhotoCapture unmounted (Review step) and discarded without that path.

**Why it mattered:** Orphaned `staged` / `pending_upload` rows and Storage objects until the cleanup runner TTL. Guests could hit quota confusion; retries looked like “ghost” photos.

## REL-004 — `resetAll` orphans staged drink photos

**Symptom:** Drink log Exit / Start Over → `resetAll()` nulls `stagedPhoto` with no abandon.

**Cause:** Same parent-vs-PhotoCapture gap. R1 correctly preserved in-flight idempotency in `resetAll` but intentionally deferred media abandon to R2.

## REL-005 — cancel does not abort Storage PUT

**Symptom:** `stageProcessedPhoto({ signal })` checked abort before begin/upload, but `storage.upload(...)` omitted `signal`. Leaving the page mid-upload left the PUT running; UI could race with confirm.

**Cause:** Incomplete abort wiring. Installed `@supabase/storage-js@2.109.0` `uploadOrUpdate` also does **not** forward `FileOptions.signal` into `fetch` (signal is typed for download/list parameters, not upload options). Passing `signal` is still the correct contract; a `Promise.race` with an abort listener stops confirm/bind when the PUT ignores abort.

**Limitation (documented, not papered over):** Network bytes may finish after abort. Safe recovery: throw `ABORTED`, never confirm, and abandon the reservation so the object is removed.

## REL-007 — remount Retry uploads empty Blob

**Symptom:** `applyRestore` sets `blob: new Blob()` with `byteSize: staged?.byteSize ?? 1`. Restore without `staged` → `ready_local`; Retry → `stageProcessedPhoto` with `blob.size === 0`.

**Cause:** Preview URL survives remount; local File bytes do not. Placeholder blob had no “local bytes missing” guard before upload.

## Shared pattern

Not four unrelated bugs — one media lifecycle ownership hole:

1. Parents own discard/reset but did not own abandon.
2. Upload cancel was advisory, not wired through Storage.
3. Restore invented bytes instead of refusing re-upload.

## What we did not change

- No migrations / RPCs (abandon already idempotent; bound refuse already correct).
- No Gallery signed-URL refresh (REL-008 / R3).
- No MIME empty-GIF validation (REL-006 / R8).
- No R1 idempotency / in-flight coalesce behavior.
