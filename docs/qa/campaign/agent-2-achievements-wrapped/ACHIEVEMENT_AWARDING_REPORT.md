# ACHIEVEMENT_AWARDING_REPORT — QA-3B

## Isolation

No award writes against organizer `:54321` or Agent 1 disposable `:55321`.  
Awarding conclusions below are **production-source contracts** + independent fixtures, except where marked blocked.

## Engine contracts verified (source)

| Behavior | Location | Result |
|---|---|---|
| Award in same transaction as accept | `achievement_finalize_submit_result` → `achievement_evaluate_after_submit` | Present |
| Receipt field `new_achievement_ids` | finalize result merge | Present |
| Idempotent replay skips re-eval | `idempotent_replay` early return | Present |
| Void recompute / exclusive reassignment | `achievement_on_void_submission` | Present |
| Post-finale freeze | `achievement_finale_frozen` | Present |
| Empty collection universe does not auto-complete | `live_met_config` target&lt;1 → false; resolve `verification_pending` | Present |
| Dev load `test_only=true` | `load-working-achievements.mjs` | Present |
| Production load requires explicit confirm | `load-production-achievements.mjs` + `08300` | Present |

## Scenario matrix (execution status)

| Scenario | Status |
|---|---|
| Single qualifying / nonqualifying event | **Blocked** — needs disposable submit |
| Threshold −1 / = / +1 | **Blocked** |
| Duplicate events / idempotent replay | Contract OK; live **Blocked** |
| Multi-achievement one event | **Blocked** |
| Different players same achievement | **Blocked** |
| Collective gauntlet award-all-enrolled | **Blocked** |
| Incorrect-game eligibility | **Blocked** |
| Gallery award card + icon | Frontend compose exists; live **Blocked** |
| Secret mask before / reveal after | Read-model contract prior phases; live **Blocked** |
| Void → revoke → re-earn | Contract OK; live **Blocked** |
| Historical award + disabled def | **Blocked** |
| Achievements never grant competitive points | **Pass** (definition audit) |
| Silent award failure while submit succeeds | Finalize does not catch/swallow eval errors (would roll back submit if thrown) — adversarial **Blocked** |
| Mobile Order progressing gauntlet | **ACH-002** source fail; live mismatch **Blocked** |
| License to Chill unlock | **ACH-001** unreachable with current tags |

## Specialized awarding notes

- **Inclusive tiers:** Engine evaluates all defs; no mutual exclusion for Drink It! thresholds (design). Live multi-unlock needs disposable proof.
- **Ship It! First to Find:** Exclusive slot + earliest qualifying evidence path present in awards SQL.
- **Companion awards:** Alias materialization required; unresolved aliases skip load (not silent in-game unlock).

## Defects tied here

- ACH-001, ACH-002, ACH-003 (activation map).
