# R2 — Remaining Risks

## Documented limitations (not regressions)

1. **Storage SDK upload abort**  
   `@supabase/storage-js@2.109.0` does not forward `signal` from upload `FileOptions` into `fetch`. We pass `signal` for the contract + race abort before confirm. A PUT may still complete in the background; abandon removes the object. Do not claim “network aborted” until the SDK wires signal through upload.

2. **Mid-upload discard without parent `photoId`**  
   Parents abandon using `staged.photoId`. If the guest exits during `pending_upload` before `@staged` fires, PhotoCapture’s internal pending is abandoned only if Remove/`clearLocal` runs. Exit while uploading on the capture step unmounts PhotoCapture without `clearLocal` (by design for Review remount). Residual risk: rare orphan `pending_upload` until cleanup runner. Mitigated when staged already emitted (normal Exit after ready).

3. **E2E-ME-009 row-count oracle**  
   Abandon keeps the ledger row (`status=abandoned`). Suites that only compare `photos` counts will false-fail. Prefer status + Storage object checks (as in `repro-r2-media-abandon.mjs`).

## Deferred to other batches

| Item | Owner |
|---|---|
| REL-008 Gallery/Wrapped signed URL refresh | R3 |
| REL-006 empty MIME + GIF accept | R8 / REP-MIME-001 |
| Physical HEIC / pinch device acceptance | Manual device checklist |

## Operational

- No mutations to `:54321` or `:56321`.
- Disposable `:55321` used for Storage proof only.
- Cleanup runner remains the backstop for any residual pending uploads.
