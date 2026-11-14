# R6 — Implementation

## Strategy

Forward-compatible additive migration **`20261105011300`**, plus correcting the `11100` source so fresh installs never ship the broken join.

Editing only `11100` would not heal environments that already applied it (qa2 `:56321`, and disposable which already had the broken function body). `11300` is idempotent `CREATE OR REPLACE`.

## SQL changes

### 1. `wrapped_drinkit_leaderboard`

- Keep left join to `wrapped_di_player_metrics` for `coalesce(m.achievements, 0)`.
- Select `r.first_claim_at` for ordering.
- Explicit:

```sql
order by
  r.points desc,
  coalesce(r.first_claim_at, 'infinity'::timestamptz) asc,
  lower(r.display_name) asc,
  r.player_id asc
```

- Still pipes JSON into `wrapped_rank_rows` for competition ranks.
- Achievements remain **display metadata** on the points board; Achievements tab re-ranks in `buildLeaderboardModes.ts`.

### 2. `wrapped_drinkit_sections` (DI-P15 / DI-C08)

Replaced from the `11000` body with two filters:

- DI-P15: `where l.player_id = p_player_id and l.bar_id is not null`
- DI-C08: `where l.bar_id is not null`

No other metric definitions, carousel eligibility, or Ship It sections changed.

## Files

| File | Role |
|---|---|
| `supabase/migrations/20261105011100_plan_c_wrapped_leaderboard_achievements.sql` | Source-corrected LB |
| `supabase/migrations/20261105011300_r6_wrapped_rank_and_mo_venue.sql` | Additive LB + MO venue repair |
| `scripts/qa2b/repro-r6-wrapped-ranking.mjs` | Disposable authoritative proofs |
| `tests/unit/qa3b-achievements-wrapped/wrappedRankingR6.spec.ts` | Migration + client contracts |
| `tests/unit/qa3b-achievements-wrapped/wrappedMetricsAndCarousel.spec.ts` | WRP-001 activation |

## Out of scope (preserved)

- R7 achievement release mappings / frozen tags / empty eligible sets
- Mobile Order bounty eligibility / Ingredient `virtual_order_source`
- Ship It! `score_reached` ranking
- Organizer DB apply
- Wrapped UI redesign / 80-metric definition changes / featured slide contracts
