# R2 — Production Changes

## Files modified

| File | Change |
|---|---|
| `src/lib/media/stagePhoto.ts` | Pass `signal` to `storage.upload`; abort race before confirm; refuse empty blob (`LOCAL_BYTES_MISSING`) |
| `src/components/shared/PhotoCapture.vue` | Per-upload `AbortController`; cancel on clear/abandon; block retry without real bytes; surface reselect copy |
| `src/features/shipit/ScavengerSubmitView.vue` | `abandonDraftPhoto()` on Start Over + Exit discard unmount; skips in-flight / unknown-locked / succeeded |
| `src/stores/drinkLogWizard.ts` | `resetAll` calls `abandonPhotoUpload` when not preserving in-flight submit / unknown lock |
| `src/features/drinkit/DailyClaimView.vue` | RISK-B: abandon draft on Exit + unmount when safe (keeps pending LS / in-flight / unknown lock) |

## Diagnostic / proof scripts (non-product)

| File | Purpose |
|---|---|
| `scripts/qa2b/repro-r2-media-abandon.mjs` | Real Storage discard → `status=abandoned` + object removed (`:55321`) |
| `scripts/qa2b/repro-r2-empty-blob-abort.mjs` | Convenience runner for AbortSignal + empty-blob unit contracts |

## Intentionally untouched

- Migrations / photo RPCs
- Gallery / Wrapped signed URL viewers (R3)
- `processImage` MIME empty-GIF path (REL-006)
- Visual layouts (no UI redesign)
- Organizer `:54321`, Agent 2 `:56321`
- R1 coalesce / durable idempotency keys

## Behavior notes

- Abandon is best-effort + idempotent; bound photos refuse without blocking the guest.
- Failed abandon does not brick submit — guest can reselect / retry.
- Concurrent submit: abandon skipped while `submitting` / `preserveInFlight` / unknown-pending lock / pending LS owns `photo_id`.
- `storage-js` 2.109 upload may not cancel the HTTP body; confirm is never called after abort; abandon cleans the object.
