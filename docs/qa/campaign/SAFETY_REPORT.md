# Safety report — Wrapped fixture protection

## Verdict

**Organizer full-coverage Plan C Wrapped fixture is intact and must remain protected.**  
Mutating integration tests must **not** run from the main Ship It workdir against `:54321` while this fixture is live.

A **separate disposable stack** already exists and is the approved mutating target for this campaign.

## Evidence — organizer preserved

| Check | Result |
|---|---|
| Pre/post unit-test `qa:inspect` | `inferred_scenario: wrapped`, lifecycle `final`, cruise `48fa40c6-…` |
| Snapshot fingerprint on disk | `f9f07ab84d988614` (matches activation report) |
| Safety copy | `wrapped-scenario-c` fingerprint `a2e53d5b198488c7` present |
| App env | `.env` / `.env.local` → `http://127.0.0.1:54321` (organizer) |
| Docker DB volume | `supabase_db_star-princess-local` |
| Storage volume | `supabase_storage_star-princess-local` |

No `qa:activate`, `db:reset`, `demo:seed`, or integration suite was run against organizer during Assignment 1.

## Evidence — disposable isolation (true second environment)

| Property | Organizer | Disposable |
|---|---|---|
| Project id | `star-princess-local` | `star-princess-disposable-mo` |
| Workdir | `…/Ship It` | `…/Ship-It-disposable-mo` |
| API / DB ports | `54321` / `54322` | `55321` / `55322` |
| DB volume | `…-local` | `…-disposable-mo` |
| Storage volume | separate | separate |
| Active cruise id | `48fa40c6-…` | `eeac0196-…` |
| Lifecycle (observed) | `final` / finalized | `pre_cruise` (embarkation seed) |
| Migrations 109/110 | absent | **present** |
| Auth users | private roster | separate Auth (27 users observed) |

**Conclusion:** Isolation is **proven** at Docker project, port, volume, cruise-id, Auth, and Storage layers. A separate schema in the same DB is **not** used and would not be sufficient.

## Harness hardening added this assignment

1. `tests/helpers/devEnvironmentGuard.ts`
   - Refuses `lifecycle=final` / `finalized` (**PROTECTED_QA_FIXTURE**)
   - Refuses primary `:54321` unless `QA_ALLOW_ORGANIZER_MUTATION=1`
2. `tests/helpers/clockFixtures.ts` calls the guard **before** `dev_seed_cruise_clock`

## Residual risks (inferred)

| Risk | Severity | Mitigation |
|---|---|---|
| Default `npm run test:integration` from main workdir still *attempts* organizer via `.local/test-identities.json` → `:54321` | High if guard bypassed | Guard now blocks; run mutating suites from disposable worktree |
| `qa-scenario.mjs` hardcodes organizer DB container name | High if misused | Never run activate/prepare without authority |
| Capture/e2e scripts often hardcode `:54321` | Medium | Review before running |
| Disposable worktree can drift from main HEAD | Medium | Copy/sync helpers before long test batches |
| Shared `private/roster` symlink into disposable | Low | Read-only source; Auth still separate |

## Commands that remain forbidden on organizer without authority

```bash
npm run db:reset
npm run demo:seed
npm run qa:activate -- …
npm run qa:prepare -- …
# and any integration/e2e that reseeds clock/catalog against :54321
```
