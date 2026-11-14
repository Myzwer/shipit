# Functional QA Campaign — Assignment 1 foundation

**Started:** 2026-11-13 (local) / verified 2026-11-14 UTC  
**Role:** Discovery + safe harness only. Not a repair phase.  
**Governing handoff:** `/Users/josh/Downloads/Documents/Cruise Challenge/Finals/MD/STAR_PRINCESS_DEV_QA_DIRECTOR_HANDOFF_2026-11-13.md`

| Document | Purpose |
|---|---|
| [BASELINE_REPORT.md](./BASELINE_REPORT.md) | Branch, dirty tree, build/typecheck, migrations, test inventory |
| [SAFETY_REPORT.md](./SAFETY_REPORT.md) | Wrapped fixture protection + disposable stack evidence |
| [FUNCTIONAL_INVENTORY.md](./FUNCTIONAL_INVENTORY.md) | Testable systems discovered from code + specs |
| [MASTER_TEST_REGISTRY.md](./MASTER_TEST_REGISTRY.md) | Human-readable coverage registry |
| [master-test-registry.json](./master-test-registry.json) | Machine-readable registry |
| [INITIAL_TEST_RESULTS.md](./INITIAL_TEST_RESULTS.md) | Commands run, passes/fails/blocked |
| [AMBIGUITIES_AND_GAPS.md](./AMBIGUITIES_AND_GAPS.md) | Organizer decisions + config gaps |
| [NEXT_BATCH.md](./NEXT_BATCH.md) | Recommended next automated testing batch |

## Quick safety rule

| Action | Against organizer `:54321` Wrapped | Against disposable `:55321` |
|---|---|---|
| `npm run typecheck` / `build` / `test` (unit) | SAFE | SAFE |
| `npm run qa:inspect` / `qa:list` | SAFE (read) | N/A (harness hardcodes organizer container) |
| `npm run test:integration` / `test:clock` / e2e | **BLOCKED** by hardened guard (final lifecycle + primary port) | Allowed from disposable worktree |
| `qa:activate` / `db:reset` / `demo:seed` | **FORBIDDEN** without explicit authority | OK on disposable only |

Disposable worktree: `/Users/josh/Documents/Web Projects/Vue/Ship-It-disposable-mo`  
(`project_id = star-princess-disposable-mo`, API `55321`, DB `55322`)
