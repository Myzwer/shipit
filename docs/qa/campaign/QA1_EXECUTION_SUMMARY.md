# QA-1 — Game engine & gameplay verification (execution summary)

**Executed:** 2026-11-14 (local)  
**Mutating env:** disposable `Ship-It-disposable-mo` API `http://127.0.0.1:55321` only  
**Organizer `:54321`:** preserved — `lifecycle=final`, `finalized=true`, `accepting_submissions=false`, config `48fa40c6-…` (read-only check post-batch)  
**`QA_ALLOW_ORGANIZER_MUTATION`:** never set  
**App repairs:** none (harness-only fixes recorded below)

## Migration `11100`

| Item | Finding |
|---|---|
| File | `supabase/migrations/20261105011100_plan_c_wrapped_leaderboard_achievements.sql` |
| Purpose | Adds per-player `achievements` count metadata to `wrapped_drinkit_leaderboard` (display); points ranking unchanged |
| Applied on disposable? | **No** (schema_migrations has `10900` + `11000` only) |
| Applied on organizer? | **No** (not required for QA-1 core engine) |
| Affects QA-1 core gameplay? | **No** — Wrapped leaderboard display metadata only. Deferred to Wrapped/achievements batch |

## Evidence classification

| Method | What was exercised |
|---|---|
| **Backend integration** (authoritative) | Clock, bounty rotations/grace, Bar crew, Daily attest, scoring RPCs, Ship It submit/ranking/void, Mobile Order, activity-day helpers — via Vitest + service/auth clients against disposable Supabase |
| **Unit** | Grace contract math, QA safety guards |
| **Browser E2E** | **Not executed in QA-1** (deferred) — refresh/stale-tab/wrong-client-clock not visually verified |
| **Code inspection only** | Client timer authority assumptions cross-checked against server `*_at` RPCs; not counted as passes |

## Aggregate counts (distinct meaningful Vitest cases)

Counts are **test cases** (Vitest `it(...)`), not assertion lines. Overlapping re-runs of the same suite are not double-counted in the “unique executed” column; latest decisive result wins.

| Area | Unique cases executed | Passed | Failed | Blocked |
|---|---:|---:|---:|---:|
| Lifecycle + ship clock | ~48 | ~48 | 0 | 0 |
| Bounty schedule / grace / pause / home / daily | ~58 | ~58 | 0 | 0 |
| Drink It! crew / daily / buddy / scoring | ~90 | ~89 | 1 | 0 |
| Ship It! reads / submit / first-to-score + Admin void | ~36 | ~36 | 0 | 0 |
| Mobile Order + 5 AM activity day | 11 | 11 | 0 | 0 |
| Unit (grace + safety) | 11 | 11 | 0 | 0 |
| **Approx. total distinct** | **~254** | **~253** | **1** | **0** |

Harness-induced false fails (MO wrong offering; B2/B4 `disposePlayers` FK) were corrected in **tests/helpers only**, then suites re-run to green. They are **not** filed as product defects.

## Exact execution commands (disposable worktree)

```bash
cd "/Users/josh/Documents/Web Projects/Vue/Ship-It-disposable-mo"
export LOCAL_TEST_PASSWORD='local-only-password-12+'

# Clock + bounty engines
npx vitest run --fileParallelism=false --testTimeout=90000 --hookTimeout=180000 \
  tests/integration/clock.precruise_opening.test.ts \
  tests/integration/clock.phase2a.test.ts \
  tests/integration/clock.phase2a1.security.test.ts \
  tests/integration/clock.phase2b.stability.test.ts \
  tests/integration/clock.phase2b1.atomic.test.ts \
  tests/integration/bounty.phase2da.schedule.test.ts \
  tests/integration/bounty.phase2da.closeout.test.ts \
  tests/integration/bounty.phase2db1.home.test.ts \
  tests/integration/bounty.phase2db2.daily.test.ts \
  tests/integration/bounty.phase2db2_1.pause.test.ts
# → 10 files, 106 passed (qa1-results/batch-e-clock-bounty.log)

# Drink It! crew / daily / scoring
npx vitest run --fileParallelism=false --testTimeout=90000 --hookTimeout=180000 \
  tests/integration/drinkit.barBountyCrew.phaseB1.test.ts \
  tests/integration/drinkit.barBountyCrew.phaseB2.test.ts \
  tests/integration/drinkit.barBountyCrew.phaseB4.test.ts \
  tests/integration/drinkit.dailyChallenge.phaseC1.test.ts \
  tests/integration/drinkit.pc1.dailyAttest.test.ts \
  tests/integration/drinkit.pc1.buddyAndSchedule.test.ts \
  tests/integration/scoring.phase3a.submit.test.ts \
  tests/integration/scoring.phase3a1.closeout.test.ts \
  tests/integration/scoring.phase3ca.corrections.test.ts \
  tests/integration/scoring.phase5c.provenance.test.ts \
  tests/integration/scoring.phase6a.provenance_race.test.ts
# → after disposePlayers harness fix: B2+B4 13/13; scoring closeout 11/12 (1 fail)

# Ship It! + void
npx vitest run --fileParallelism=false --testTimeout=90000 --hookTimeout=180000 \
  tests/integration/shipit.pc1.scoreReachedRanking.test.ts \
  tests/integration/shipit.phase4a.reads.test.ts \
  tests/integration/shipit.phase4b2.submit.test.ts \
  tests/integration/admin.phase5b.void.test.ts
# → 4 files passed (with scoring suite: 36 pass / 1 fail overall in batch-g)

# Mobile Order + activity day
npx vitest run --fileParallelism=false --testTimeout=60000 --hookTimeout=180000 \
  tests/integration/drinkit.mobileOrder.test.ts \
  tests/integration/activityDay.reporting.test.ts
# → 11 passed (qa1-results/batch-d-fixed.log)
```

Unit (main workspace, non-mutating):

```bash
cd "/Users/josh/Documents/Web Projects/Vue/Ship It"
npx vitest run --fileParallelism=false \
  tests/unit/bountyGraceContract.spec.ts \
  tests/unit/devEnvironmentGuard.spec.ts \
  tests/unit/qaScenarioSafety.spec.ts
# → 11 passed
```

Logs: `docs/qa/campaign/qa1-results/`.

## Harness changes (allowed; not app repairs)

1. **MO / activity-day offering selection** — tests preferred `lookupOffering('lido-bar','tropical-alibi')` under `bar_canonical_key=mobile-order`, which correctly returns `OFFERING_NOT_AT_BAR`. Fixed to use `list_drinkit_mobile_order_drinks` offerings. Product rejection of mismatched offering confirmed by diag (`qa1-results/mo-diag3b.log`).
2. **`disposePlayers`** — now deletes `submissions` authored by synthetic fillers before `players` delete (prevents `submissions_author_player_id_fkey` teardown failures after crew padding).

## Product defect retained

See [QA1_DEFECTS.md](./QA1_DEFECTS.md) — **DEF-QA1-001** only.

## Voyage automation conclusion (backend)

Server-side clock + bounty exposure + acceptance RPCs advance the simulated voyage **without** logged-in browsers or admin intervention when authoritative `p_at_utc` / ship clock are set. Pre-cruise blocks, Day1 open, Friday 18:00 latch, grace half-open windows, and post-finale rejection are covered on disposable. **Client UX after refresh / wrong device clock / stale bounty cards** remains an E2E gap (next batch).
