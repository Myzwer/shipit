# Recommended next automated testing batch

Priority after Assignment 1. All mutating work → **disposable `:55321` worktree** only.

## Batch A — Lifecycle + grace + cutoff (highest risk)

**Goal:** Prove the voyage clock and private grace cannot strand players mid-cruise.

| Suite | Command (from disposable worktree) | Est. coverage |
|---|---|---|
| Clock core | `LOCAL_TEST_PASSWORD=… npm run test:clock` | Open, pause, finale, security |
| Pre-cruise open | `npx vitest run --fileParallelism=false tests/integration/clock.precruise_opening.test.ts` | Shared Day1 unlock |
| Bounty grace | `npx vitest run --fileParallelism=false tests/integration/bounty.phase2da.schedule.test.ts` | QA-GR-002..004 |
| Scoring grace claims | slice of `scoring.phase3a.submit.test.ts` grace cases | Claim-time boundaries |

**Preflight:** `npx supabase status` shows `55321`; `get_ship_clock_state` not final; organizer `qa:inspect` still wrapped.

## Batch B — Drink It! claim matrix

Crew B1–B4, Daily attest (PC1), one-per-category, companion rules, idempotency:

```bash
npm run test:crew
npm run test:c1
npx vitest run --fileParallelism=false tests/integration/drinkit.pc1.dailyAttest.test.ts
npx vitest run --fileParallelism=false tests/integration/scoring.phase3a.submit.test.ts
```

## Batch C — Ship It! ranking + void

```bash
npx vitest run --fileParallelism=false tests/integration/shipit.pc1.scoreReachedRanking.test.ts
npx vitest run --fileParallelism=false tests/integration/admin.phase5b.void.test.ts
```

## Batch D — Mobile Order + activity day (already on disposable)

```bash
npx vitest run --fileParallelism=false \
  tests/integration/drinkit.mobileOrder.test.ts \
  tests/integration/activityDay.reporting.test.ts
```

Do **not** apply 109/110 to organizer until Batch D green + snapshot plan.

## Batch E — Wrapped 80-metric provenance (QA-3)

Prefer read-only probes against organizer full fixture **or** restore disposable to wrapped seed. Do not re-activate organizer scenarios without authority.

## Sync note

Disposable worktree can lag main. Before large batches, copy updated helpers/migrations from main:

```bash
cp tests/helpers/devEnvironmentGuard.ts tests/helpers/clockFixtures.ts \
  "/Users/josh/Documents/Web Projects/Vue/Ship-It-disposable-mo/tests/helpers/"
```
