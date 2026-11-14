# Functional QA Campaign — QA-0 foundation + QA-1 engine results

**Started:** 2026-11-13 (local) / QA-1 executed 2026-11-14 UTC  
**Role:** Discovery + safe harness (QA-0); game-engine verification without app repairs (QA-1).  
**Governing handoff:** `/Users/josh/Downloads/Documents/Cruise Challenge/Finals/MD/STAR_PRINCESS_DEV_QA_DIRECTOR_HANDOFF_2026-11-13.md`

| Document | Purpose |
|---|---|
| [BASELINE_REPORT.md](./BASELINE_REPORT.md) | Branch, dirty tree, build/typecheck, migrations, test inventory |
| [SAFETY_REPORT.md](./SAFETY_REPORT.md) | Wrapped fixture protection + disposable stack evidence |
| [FUNCTIONAL_INVENTORY.md](./FUNCTIONAL_INVENTORY.md) | Testable systems discovered from code + specs |
| [MASTER_TEST_REGISTRY.md](./MASTER_TEST_REGISTRY.md) | Human-readable coverage registry (QA-1 statuses) |
| [master-test-registry.json](./master-test-registry.json) | Machine-readable registry |
| [INITIAL_TEST_RESULTS.md](./INITIAL_TEST_RESULTS.md) | QA-0 commands run, passes/fails/blocked |
| [QA1_EXECUTION_SUMMARY.md](./QA1_EXECUTION_SUMMARY.md) | QA-1 counts, commands, migration 11100, classification |
| [QA1_LIFECYCLE_RESULTS.md](./QA1_LIFECYCLE_RESULTS.md) | Seven-day lifecycle simulation |
| [QA1_CLOCK_MATRIX.md](./QA1_CLOCK_MATRIX.md) | Ship-clock + rotation/grace matrix |
| [QA1_DRINKIT_RESULTS.md](./QA1_DRINKIT_RESULTS.md) | Cocktail / Ingredient / Bar / Daily / scoring |
| [QA1_SHIPIT_RESULTS.md](./QA1_SHIPIT_RESULTS.md) | Ship It! challenges + ranking |
| [QA1_RANKING_VOID_IDEMPOTENCY.md](./QA1_RANKING_VOID_IDEMPOTENCY.md) | Ranking / void / idempotency |
| [QA1_MOBILE_ORDER_ACTIVITY_DAY.md](./QA1_MOBILE_ORDER_ACTIVITY_DAY.md) | Mobile Order + 5 AM activity day |
| [QA1_DEFECTS.md](./QA1_DEFECTS.md) | Product defects + resolved harness issues |
| [AMBIGUITIES_AND_GAPS.md](./AMBIGUITIES_AND_GAPS.md) | Organizer decisions + config gaps |
| [NEXT_BATCH.md](./NEXT_BATCH.md) | Recommended next automated testing batch |
| `qa1-results/` | Raw Vitest / diag logs |
| `qa2a-browser-e2e/` | QA-2A Playwright E2E evidence |
| `qa2b-browser-stress/` | QA-2B browser stress evidence |
| `agent-2-reliability/` | QA-2 player reliability (Agent 2) |
| `agent-2-admin-catalog/` | QA-3A Admin/catalog (Agent 2) |
| `agent-2-achievements-wrapped/` | QA-3B Achievements/Wrapped (Agent 2) |
| `agent-2-backend-integration/` | QA-4A backend probes (Agent 2) |
| `consolidation/` | Master defect register, repair batches, known failures |

## Quick safety rule

| Action | Against organizer `:54321` Wrapped | Against disposable `:55321` | Against qa2 `:56321` |
|---|---|---|---|
| `npm run typecheck` / `build` / `test` (unit) | SAFE | SAFE | SAFE |
| `npm run qa:inspect` / `qa:list` | SAFE (read) | N/A | N/A |
| `npm run test:integration` / `test:clock` / e2e | **BLOCKED** by hardened guard | Allowed from disposable worktree | Prefer Agent 2 probes |
| `qa4a:probe:*` | **REFUSED** (hard `:56321` check) | **REFUSED** | Allowed (mutating) |
| `qa:activate` / `db:reset` / `demo:seed` | **FORBIDDEN** without explicit authority | OK on disposable only | Only on qa2 stack |

Disposable worktrees:

- Agent 1: `/Users/josh/Documents/Web Projects/Vue/Ship-It-disposable-mo` (`star-princess-disposable-mo`, `:55321`)
- Agent 2 archive: `/Users/josh/Documents/Web Projects/Vue/Ship-It-qa2-reliability` (`star-princess-qa2-backend`, `:56321`) — evidence archive; do not reset yet
