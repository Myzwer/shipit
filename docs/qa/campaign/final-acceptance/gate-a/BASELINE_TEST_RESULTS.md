# Gate A — Baseline Test Results

**Checkpoint:** `3424095` `visual/drinkit-home-v1`  
**Application source modified:** No

## Inventory of R1–R8 (integrated)

| Batch | Theme | Tip evidence |
|---|---|---|
| R1 | Submission integrity (dup accepts, in-flight) | `repairs/R1-submission-integrity/` |
| R2 | Media abandon / empty-blob | `repairs/R2-media-recovery/` |
| R3 | Signed URL refresh | `repairs/R3-signed-urls/` |
| R4 | Admin pending / catalog lock | `repairs/R4-admin-catalog/` |
| R5 | Production schedule init | `repairs/R5-production-schedule/` |
| R6 | Wrapped ranks + MO venue | `repairs/R6-wrapped-ranking/` |
| R7 | Achievement release map 174 | `repairs/R7-achievements/` |
| R8 | MIME/GIF, crews confirm, clock latch ack, preview contract | `repairs/R8-final-functional/` @ `3424095` |

## Executed suites

| Suite | Discovered | Executed | Passed | Failed | Notes |
|---|---:|---:|---:|---:|---|
| `tests/unit` (full) | 756 | 756 | 756 | 0 | Includes qa2/qa3 contracts |
| Diagnostic slice qa2+qa3a+qa3b | 354 | 354 | 354 | 0 | Subset of unit; re-run for Gate A |
| R5 `bountySchedule.r5.init.test.ts` | 4 | 4 | 4 | 0 | Requires `:55321` env |
| Gate A voyage rehearsal | 95 checks | 95 | 61 raw / ~85 after triage | 14 raw → 1 product + harness | See voyage docs |
| Gate A supplemental | 16 | 16 | 12 | 0 (+1 blocked) | Claim/Wrapped/achievements corrections |
| Catalog rebind repro | 8 | 8 | 3 | 2 product | FINAL-A-CAT-001 |
| Typecheck | — | — | PASS | 0 | `vue-tsc -b` |
| Build | — | — | PASS | 0 | `vite build` |

## Expected vs unexpected failures

| Failure | Classification |
|---|---|
| Voyage `DI-INGREDIENT-DAY1..4` | **Harness** — status `active` with points/tier; asserted missing `ingredient_name`/`canonical_key` (actual: `ingredient_key`/`display_name`) |
| Voyage `WRP-AVAILABLE` | **Harness** — called `dev_get_my_wrapped_at` without `p_game`; supplemental PASS with correct arity |
| Voyage `ACH-BLOCKED-10` | **Harness** — used `release_enabled`; map uses `enabledInProductionRelease` |
| Voyage days 5–7 cocktail/ingredient unavailable after catalog B | **Product/ops** — FINAL-A-CAT-001 (confirmed by precise rebind repro) |
| Rebind Admin stage `VALIDATION_NOT_READY` | **Harness gap** — incomplete `p_validation` blob; not filed as product without IMP-driven stage |

## Legacy integration suite note

Mutating suites that call `assertDisposableDevEnvironment` require `npx supabase status` URL to match fixture URL. Main worktree status is organizer `:54321`, so those suites are **not** safely re-pointed from main without a status shim. Gate A used dedicated `:55321` harnesses (R5 pattern) instead of mutating organizer config.

## Evidence files (local, gitignored)

- `evidence/unit-results.json`
- `evidence/diagnostic-contracts.json`
- `evidence/r5-init-results.json`
- `evidence/typecheck.txt` / `build.txt`
