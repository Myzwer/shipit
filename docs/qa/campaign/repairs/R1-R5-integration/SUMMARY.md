# R1–R5 Integration & Regression Checkpoint

**Status:** Complete — R3 cherry-picked cleanly; R1–R5 coexist on one baseline  
**Branch:** `visual/drinkit-home-v1`  
**Pre-integration HEAD:** `bd7dff5` (R5 schedule init evidence)  
**R3 source:** Agent 2 worktree `repair/r3-signed-urls` @ `2a617bc` (untouched)  
**R3 import commit:** `bfba315` (cherry-pick of `2a617bc`)  
**Checkpoint:** local commit after this folder + harness fix (see `MERGE_DETAILS.md`)  
**Environment:** Agent 1 disposable `:55321` only. Organizer `:54321` and Agent 2 `:56321` not mutated. `QA_ALLOW_ORGANIZER_MUTATION` never set.

## Verdict

R3 (signed-URL renewal) imported into the main app with **no merge conflicts**. R1, R2, R4, and R5 remain intact. Typecheck and build pass. Unit/contract coverage for R1–R5 is green where expected. Real 60s signed-URL expiry + re-sign proved on `:55321` (not mock-only). Expected-red R6/R7/R8 defects are preserved.

## What was integrated

| Batch | Theme | On baseline? |
|---|---|---|
| R1 | Submission integrity / idempotency | Yes (`72b1b5f`) |
| R2 | Media abandon / empty-blob / interrupt | Yes (`9f4a48a`) |
| R3 | Gallery / Wrapped signed-URL recovery | **Yes — cherry-pick `bfba315`** |
| R4 | Admin/catalog pending lock & errors | Yes (`535686f`) |
| R5 | Production Admin bounty schedule init | Yes (`ad8c27a` + `bd7dff5`) |

## Quick results

| Check | Result |
|---|---|
| Cherry-pick conflicts | None |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |
| R3 unit + WRP-002 | Pass (24) |
| R3 real expiry `:55321` | Pass (60s → HTTP 400 → re-sign 200) |
| R1/R2 contracts | Pass (27) |
| QA-3A (R4+R5 units) | Pass (230) |
| R5 integration | Pass (4/4) |
| R1 integration (after clock restore) | Pass (3/3) |
| QA-2 reliability | 85 pass / **1 expected red** (REL-006 MIME / R8) |
| QA-3B | WRP-002 green; **4 expected red** (R6/R7) |
| Legacy unit (excl. qa2/3a/3b) | Green after `DailyClaimScroll` mock fix |

## Explicit non-starts

- R6 Wrapped ranking (`11100`) — not repaired  
- R7 achievement content — not repaired  
- R8 MIME / processImage GIF — not repaired  
- No push, deploy, or organizer mutation  
- No changes to Agent 2 branch/worktree  

## Docs in this folder

- `MERGE_DETAILS.md` — procedure, hashes, conflict analysis  
- `REGRESSION_RESULTS.md` — batch-by-batch evidence  
- `REMAINING_FAILURES.md` — expected reds + harness notes  
- `evidence/` — command logs and `:55321` R3 expiry JSON  
