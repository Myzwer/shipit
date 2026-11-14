# R6 — Wrapped Ranking + Mobile Order Venue Stats

**Status:** Repaired and verified on Agent 1 disposable `:55321`  
**Baseline HEAD at start:** `cae8cfe` (`visual/drinkit-home-v1`)  
**Defects:** REP-WRP-RANK-001 (INT-WRP-002, WRP-001), REP-WRP-MO-001 (INT-WRP-003)

## Verdict

Drink It! Wrapped/Home leaderboard rows again rank by the approved points contract while keeping achievement count metadata. Favorite / Most Popular Bar no longer treat Mobile Order as a physical venue. Ship It! standings and MO bounty eligibility were not changed.

## Original defect IDs

| ID | Role |
|---|---|
| INT-WRP-002 | Rank regression introduced by migration `11100` |
| WRP-001 | Achievements LB counts / `hasAchievementCounts` contract |
| INT-WRP-003 | Mobile Order counted as Favorite/Most Popular bar |
| REP-WRP-RANK-001 / REP-WRP-MO-001 | Consolidation repair groups |

## What changed

| Path | Change |
|---|---|
| `supabase/migrations/20261105011100_plan_c_wrapped_leaderboard_achievements.sql` | Corrected source: keep achievements join **and** `ORDER BY` matching `drinkit_player_score_rows` |
| `supabase/migrations/20261105011300_r6_wrapped_rank_and_mo_venue.sql` | **New** additive repair: same LB fix + DI-P15/DI-C08 `bar_id IS NOT NULL` |
| `scripts/qa2b/repro-r6-wrapped-ranking.mjs` | Deterministic disposable proof (independent expectations) |
| `tests/unit/qa3b-achievements-wrapped/wrappedRankingR6.spec.ts` | Contract tests for migrations + client Achievements/Points modes |
| `tests/unit/qa3b-achievements-wrapped/wrappedMetricsAndCarousel.spec.ts` | WRP-001 flipped green for disposable activation |
| Consolidation manifests | Expected-red → Repaired (R6) for WRP rank/MO |

No Vue redesign. Achievements tab still re-ranks client-side from the `achievements` field; server board remains points-ordered with competition ranks from `wrapped_rank_rows`.

## Migration state (this assignment)

| Environment | `11100` | `11200` | `11300` |
|---|---|---|---|
| Agent 1 disposable `:55321` | Applied (recorded) | Already present | **Applied** |
| Organizer `:54321` | Not applied by R6 | Untouched | **Absent** |
| Agent 2 qa2 `:56321` | Already had `11100` | — | **Absent** (needs later apply) |

## Evidence highlights

- Before fix: `join_preserves_order=false` / `lb_matches_score_order=false` on live disposable.
- After `11300`: live order matches `drinkit_player_score_rows`; fixture ties/zeros/achievements match independent JS expectations (`7/7` in `evidence/r6-ranking-results.json`).
- Authenticated `get_my_drinkit_leaderboard`: points-sorted, competition ranks, numeric achievements (`evidence/home-leaderboard-rpc.json`).
- MO: filtered queries pick physical bar; unfiltered control still picks “Mobile Order”; log variety count remains 4.

## Tests

| Check | Result |
|---|---|
| `node scripts/qa2b/repro-r6-wrapped-ranking.mjs` | **7 pass / 0 fail** |
| QA-3B WRP-001 + R6 ranking unit specs | **13 pass** |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |
| Organizer / qa2 mutation | None |

## Completion criterion

Wrapped presents correct and consistent achievement counts and leaderboard ranks; Mobile Order contributes to drink/ingredient variety but not venue popularity; bounty-point standings preserved.
