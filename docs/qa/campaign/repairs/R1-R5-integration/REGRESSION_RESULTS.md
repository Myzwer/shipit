# R1–R5 Integration — Regression Results

Environment: disposable Supabase `http://127.0.0.1:55321`. Never `QA_ALLOW_ORGANIZER_MUTATION=1`. Organizer `:54321` and Agent 2 `:56321` untouched.

## Baseline checks

| Check | Result | Evidence |
|---|---|---|
| `npm run typecheck` | **Pass** | `evidence/typecheck.txt` |
| `npm run build` | **Pass** | `evidence/build.txt` |
| Legacy guards (`devEnvironmentGuard`, `qaScenarioSafety`, `logWizardNavigation`) | **26/26 pass** | `evidence/legacy-guard-unit.txt` |
| Legacy unit excl. qa2/3a/3b | **394 pass**; 2 harness fails → fixed → **DailyClaimScroll 2/2** | `evidence/legacy-unit.txt`, `daily-claim-scroll-harness.txt` |

## R3 — Signed URLs (post cherry-pick)

| Suite | Result | Evidence |
|---|---|---|
| `gallerySignedUrl.contract.spec.ts` + `signedPhotoLifecycle.r3.spec.ts` + WRP-002 (`awardingAndCrossSystem`) | **24/24 pass** | `evidence/r3-unit.txt` |
| Real expiry on `:55321` (60s floor → HTTP 400 → re-sign 200) | **Pass** | `evidence/r3-real-expiry-55321.json`, `.log` |
| Missing photo → `PHOTO_NOT_FOUND` | **Pass** | same |
| Ship-only → `GAME_MEMBERSHIP_REQUIRED` | **Pass** | same |
| Bounded coalesce / transient / permanent / online / unmount | **Pass (unit)** | `signedPhotoLifecycle.r3.spec.ts` |

**Non-claim:** 60s RPC floor is **not** a one-hour soak. Simulated `@error` browser path was proved on Agent 2’s original `:56321` run; this integration re-proved **real** expiry on `:55321` without mutating `:56321`.

## R1 — Submission integrity

| Suite | Result | Evidence |
|---|---|---|
| Unit contracts (`submitGuards` REL-001/002 + `submissionIntegrity.r1`) | **Pass** (with R2 files: 27) | `evidence/r1-r2-unit.txt` |
| Integration `submissionIntegrity.r1.test.ts` | **3/3 pass** after restoring day1=`2026-11-14` | `evidence/r1-integration-restored.txt` |

Note: First joint run with R5 left cruise at day1=`2099-01-03` (Outside cruise window) → transient R1 red. Same pattern as R5’s own evidence restore. Clock restored on `:55321`; R1 re-green.

## R2 — Media recovery

| Suite | Result | Notes |
|---|---|---|
| `submitGuards` abandon / `stagePhoto.network` / `PhotoCapture.restore` | **Pass** | Included in `r1-r2-unit.txt` |
| Full `tests/unit/qa2-reliability` | **85 pass / 1 fail** | Fail = REL-006 empty-MIME GIF (**R8 expected red**) |
| REL-008 gallery contract | **Pass** (was red pre-R3) | R3 repaired |

## R4 — Admin / catalog

| Suite | Result | Evidence |
|---|---|---|
| Full `tests/unit/qa3a-admin-catalog` | **230/230 pass** | `evidence/r4-r5-qa3a-unit.txt` |

Covers catalog stage/preview/discard, preview-failure recovery, publish pending guard, admin status/error classification, clock confirmation catch, admin empty-games route.

## R5 — Production scheduling

| Suite | Result | Evidence |
|---|---|---|
| `bountySchedule.r5.init.test.ts` | **4/4 pass** | `evidence/r1-r5-integration.txt` (R5 portion) |
| `scheduleInit.contract.spec.ts` + related units | **22/22 pass** | `evidence/r5-related-unit.txt` |
| Admin RPC existence smoke | **Pass** | `evidence/r5-status-smoke.txt` |

Integration exercised on `:55321`:

- Exactly **72** cocktail / **39** ingredient / **7** bar / **7** daily
- Day 7 cocktail = 6; bar sequence Wake View → … → Promenade
- Replay / acknowledge / concurrent init safety
- Shortage atomic; non-admin denied; finalized rejected; paused allows init without resume
- Timed bounty RPC visibility via `dev_*_at` under development-only label
- `gameplay_started=false` (no unintended lifecycle start)

Full independent seven-day voyage rehearsal deferred (per assignment).

## Cross-batch coexistence

| Interaction | Observation |
|---|---|
| R5 clock seed vs R1 submits | Transient; restore day1 to wall-clock overlap |
| R3 signing vs R2 abandon | Disjoint surfaces; both green |
| R4 pending lock vs R5 Admin init | Both in qa3a; 230/230 |
| R3 vs R6 `11100` | R3 does not touch Wrapped ranking migration |

## Known-failure manifest

`docs/qa/campaign/consolidation/KNOWN_FAILURE_MANIFEST.md` updated: **REP-SIGNED-001 → Repaired (R3)**. R6/R7/R8 remain expected red.
