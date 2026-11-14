# R2 — Media Upload & Recovery

**Status:** Repaired and verified on disposable `:55321`  
**Batch:** REP-MEDIA-001 (+ RISK-B)  
**Branch:** `visual/drinkit-home-v1`  
**Depends on:** R1 (`72b1b5f`) — submission integrity preserved

## Defects repaired

| ID | Severity | Outcome |
|---|---|---|
| REL-003 | P1 | Fixed — Scavenger Start Over / Exit discard calls `abandonPhotoUpload` |
| REL-004 | P2 | Fixed — Drink log `resetAll` abandons staged photo when safe |
| REL-005 | P1 | Fixed — `AbortSignal` passed to `storage.upload`; mid-flight cancel stops confirm |
| REL-007 | P1 | Fixed — restore/retry refuses empty Blob; requires reselect |
| E2E-031 | P1 | Fixed — real discard leaves `status=abandoned` + Storage object removed |
| RISK-B | P2 | Fixed — DailyClaim Exit / unmount abandons draft staged photo when safe |

## Shared root cause

Wizard-level discard/reset cleared local photo state without the PhotoCapture `clearLocal` abandon path. Upload cancel only checked `signal` before PUT (SDK ignored abort during upload). Remount restore invented an empty Blob that Retry could upload.

## Compatibility with R1

- `resetAll` still preserves in-flight idempotency keys (`preserveInFlight`).
- Photo abandon is skipped while submit is in flight or unknown-pending is locked.
- Successfully bound photos refuse abandon (`PHOTO_ALREADY_BOUND`).

## Out of scope (unchanged)

- REL-008 signed URL refresh → **R3**
- REL-006 empty MIME + GIF → **R8 / REP-MIME-001**
- Physical iPhone HEIC / pinch-zoom → device acceptance

## Proof highlights

- Unit: `submitGuards` abandon, `stagePhoto.network` AbortSignal, `PhotoCapture.restore` empty-blob — **all green**
- Real Storage: `scripts/qa2b/repro-r2-media-abandon.mjs` on `:55321` / Vite `:5177` — ledger abandoned + object removed
- Typecheck + production build — **pass**
- R1 unit regressions — **pass**
