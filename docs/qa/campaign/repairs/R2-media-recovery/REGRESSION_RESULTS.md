# R2 — Regression Results

Environment: disposable Supabase `http://127.0.0.1:55321`, Vite app `http://127.0.0.1:5177` (already pointed at `:55321`), never `QA_ALLOW_ORGANIZER_MUTATION=1`. Organizer `:54321` and Agent 2 `:56321` untouched.

## Before → after (R2 diagnostics)

| Suite / assertion | Before | After |
|---|---|---|
| `submitGuards` scavenger abandon (REL-003) | Fail | **Pass** |
| `submitGuards` drink `resetAll` abandon (REL-004) | Fail | **Pass** |
| `stagePhoto.network` AbortSignal → upload (REL-005) | Fail | **Pass** |
| `PhotoCapture.restore` empty-blob retry (REL-007) | Fail | **Pass** |
| PhotoCapture remove abandon (control) | Pass | Pass |
| REL-001/002 in-flight guards (R1) | Pass | Pass |

Focused command:

```bash
npx vitest run \
  tests/unit/qa2-reliability/submitGuards.contract.spec.ts \
  tests/unit/qa2-reliability/stagePhoto.network.spec.ts \
  tests/unit/qa2-reliability/PhotoCapture.restore.spec.ts \
  tests/unit/qa2-reliability/submissionIntegrity.r1.spec.ts
```

Result: **4 files / 27 tests passed**.

## Real Storage / database

| Proof | Result | Notes |
|---|---|---|
| `scripts/qa2b/repro-r2-media-abandon.mjs` | **Pass** | Stage → Exit Discard → `photos.status=abandoned`, Storage object gone |
| Evidence | `evidence/abandon-storage-proof.log` | Cruise `a1f2a541-…` (development-only disposable) |

Note: QA-2A `E2E-ME-009` counts *all* photo rows and would still “grow” after abandon (row retained as `abandoned`). Status + Storage object checks are the correct oracle; harness count metric is misleading.

## R1 submission integrity

| Check | Result |
|---|---|
| `submissionIntegrity.r1.spec.ts` | Pass |
| `submitGuards` REL-001/002 | Pass |
| `resetAll` preserves in-flight key (source still has `preserveInFlight`) | Pass (code + unit) |

## Broader QA-2 reliability unit

`npx vitest run tests/unit/qa2-reliability/` → expected reds remain:

| File | Defect | Status |
|---|---|---|
| `processImage.qa2.spec.ts` empty MIME GIF | REL-006 | Expected red (R8) |
| `gallerySignedUrl.contract.spec.ts` | REL-008 | Expected red (R3) |

All other QA-2 reliability files in that run passed (including repaired R2 contracts).

## Typecheck / build

| Command | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run build` | Pass |

## Not claimed from Chromium alone

- Physical iPhone HEIC capture
- Physical pinch-zoom framing
- >1h Gallery signed URL soak (R3)
- Full QA-2A media suite / QA-2B stress re-run (challenge exhaustion risk; focused Storage proof used instead)
