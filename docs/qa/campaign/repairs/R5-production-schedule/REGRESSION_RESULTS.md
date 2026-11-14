# R5 — Regression results

Environment: disposable Supabase `http://127.0.0.1:55321`. Never `QA_ALLOW_ORGANIZER_MUTATION=1`. Organizer `:54321` and Agent 2 `:56321` untouched.

## Before

| Check | Result |
|---|---|
| `pg_proc` schedule generators on `:55321` | Only `dev_generate_bounty_schedule` |
| Production Admin init | Missing (INT-SCHED-001) |

## After — R5-specific

| Suite | Result | Evidence |
|---|---|---|
| `tests/integration/bountySchedule.r5.init.test.ts` | **4/4 pass** | `evidence/r5-integration.txt`, `r5-integration-rerun.txt` |
| `tests/unit/qa3a-admin-catalog/scheduleInit.contract.spec.ts` | **3/3 pass** | `evidence/r5-init-vitest.txt` |
| Full `tests/unit/qa3a-admin-catalog` | **230/230 pass** | `evidence/qa3a-admin-catalog.txt` |
| Launch config contract (updated) | Pass — asserts Admin prod path exists + `dev_*` remains gated | same |

### Integration coverage exercised on real disposable DB

1. Synthetic cruise provisioned (`dev_seed_cruise_clock`) then **production-like label** flip
2. Valid active catalog via fixture activate (≥72/39)
3. Seven-day schedule via **Admin** RPC (no `dev_generate_bounty_schedule`)
4. Counts: 72 cocktail / 39 ingredient / 7 bar / 7 daily; Day 7 cocktail = 6
5. Bar sequence Wake View → … → Promenade keys verified
6. Timed cocktail/ingredient resolve after restoring development-only for `dev_*_at` helpers
7. Same request-id replay; post-success acknowledge; concurrent acknowledges
8. Shortage atomic (0 slots left); non-admin denied; finalized rejected; paused allows init without resume

## Related regressions

| Suite | Result | Notes |
|---|---|---|
| R1 `submissionIntegrity.r1.test.ts` | **3/3 pass** after restoring wall-clock-overlapping day1 | Transient red while R5 left day1 at 2099 (`Outside cruise window`); restored `2026-11-14` — see `evidence/r1-regression-restored.txt` |
| Related unit (`bounty`, `adminCatalogImport`, `devEnvironmentGuard`) | **30/30 pass** | `evidence/unit-related.txt` |
| `vue-tsc --noEmit` | Pass | `evidence/typecheck.txt` |
| `npm run build` | Pass | `evidence/build.txt` |

## Suites not re-driven from this worktree

Integration suites that call `npx supabase status` against the **organizer** worktree config (`:54321`) were not re-pointed at `:55321` (would require mutating organizer `config.toml`). R5 proof uses the dedicated disposable env pattern established in R1/R4.

QA-1 clock/lifecycle/rotation suites that require status URL match → deferred to disposable-mo worktree runs; engine paths are unchanged (R5 adds Admin bootstrap only).

## Known-red preserved

Unrelated open items (R3 signed URLs, R6 Wrapped ranks / `11100`, R7 achievements, CAT-002 polish) were not “fixed” by weakening assertions.
