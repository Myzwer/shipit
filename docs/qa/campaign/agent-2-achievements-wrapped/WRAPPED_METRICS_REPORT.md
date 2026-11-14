# WRAPPED_METRICS_REPORT — QA-3B

## Authority sources

| Source | Status |
|---|---|
| Downloads `CRUISE_WRAPPED_FINAL_IMPLEMENTATION_SPEC.md` | Present outside repo — cross-checked 80 / sections |
| Plan C handoff `00_READ_ME_PLAN_C_CURSOR_BUILD_HANDOFF.md` | Present outside repo — presentation overrides |
| `src/lib/wrapped/inventory.ts` | In-repo approved inventory |
| `supabase/migrations/20261105010000_phase_final_wrapped.sql` | Aggregation authority |
| `20261105010700_pc1_shipit_score_reached_ranking.sql` | Ship It! tie / first-reached-final-score |
| `20261105011100_…achievements.sql` | Achievements LB metadata — **unapplied** |

`CRUISE_WRAPPED_FINAL_IMPLEMENTATION_SPEC(1).md` / Plan C file under that exact assignment filename: **not in worktree**; Downloads copies used.

## Inventory audit

| Bucket | Expected | Observed |
|---|---:|---:|
| Drink It! personal | 18 | 18 |
| Drink It! global | 16 | 16 |
| Drink It! collective | 12 | 12 |
| Ship It! personal | 10 | 10 |
| Ship It! global | 12 | 12 |
| Ship It! collective | 12 | 12 |
| **Total** | **80** | **80** |

Matrix: `WRAPPED_METRIC_MATRIX.json`.

## Aggregation correctness

| Layer | Coverage |
|---|---|
| Spec ID / label / section inventory | **Audited** (unit) |
| Presentation builders (`buildAllStatsRows`, feature slides, LB modes) | **Exercised** with fixtures |
| SQL metric computation (`wrapped_*_sections`) | **Blocked** — no disposable DB; do not pass from source reading alone |
| Voided / historical / empty / boundary datasets in SQL | **Blocked** |

Independent fixture expectations (not the SQL under test) cover: ordinary log ≠ bounty inflation; voided claim drops bounty; Drink It! 1,1,3 ranks; Ship It! equal points ordered by earlier `score_reached_at`.

## Ship It! tie rule

Migration `10700` implements: equal points → earlier `score_reached_at` (= max active completion time) ranks higher, then finishing completion id. Matches approved “first team to reach its final score” rule. Wrapped leaderboard reuses `shipit_team_score_rows`.

## Migration 11100

Adds `achievements` onto `wrapped_drinkit_leaderboard`. Client denominator for Achievements mode is **126** via `activeAchievementCatalogCount('drinkit')`. Without apply → Achievements toggle hidden (**WRP-001**).

## What is not claimed

That each of the 80 metrics returns the correct numeric value against live cruise data. Definition/presentation audit ≠ aggregation proof.
