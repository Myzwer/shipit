# R6 — Root Cause

## REP-WRP-RANK-001 / INT-WRP-002

### Mechanism

`wrapped_rank_rows(p_rows)` assigns competition ranks (**1,1,3**) strictly by **array order**, comparing only adjacent `points` values. It does not re-sort.

Pre-`11100`, `wrapped_drinkit_leaderboard` looped:

```sql
select * from public.drinkit_player_score_rows(p_cruise_config_id)
```

`drinkit_player_score_rows` is an SQL function with an explicit `ORDER BY`:

1. `points DESC`
2. `coalesce(first_claim_at, 'infinity') ASC` (earlier first claim wins ties)
3. `lower(display_name) ASC`
4. `player_id ASC`

Migration `11100` changed the loop to a join so each row could carry `achievements`:

```sql
from drinkit_player_score_rows(...) r
left join wrapped_di_player_metrics(...) m on m.player_id = r.player_id
-- no ORDER BY
```

In PostgreSQL, a set-returning function’s `ORDER BY` is **not** guaranteed once its result is joined. The planner returned hash/id order. `wrapped_rank_rows` then stamped ranks by that wrong order → DI-P03 Final Rank and Home LB (`get_my_drinkit_leaderboard`) disagreed with points.

### What was *not* broken

- Achievement **counts** from `wrapped_di_player_metrics` (WRP-001 exposure worked once `11100` body was live).
- Client Achievements tab re-sort (`buildDrinkItLeaderboard(..., 'achievements')`) — ranks by count client-side.
- Ship It! leaderboard / first-to-final-score rules (untouched).

### Fix contract

Restore the same `ORDER BY` as `drinkit_player_score_rows` on the joined select, keep `achievements` metadata, leave `wrapped_rank_rows` competition semantics unchanged.

---

## REP-WRP-MO-001 / INT-WRP-003

### Mechanism

`wrapped_di_log_rows` (migration `10900`) correctly **nulls `bar_id`** for `bars.is_virtual` Mobile Order logs so venue cards can ignore them, while still returning the row for drink/ingredient variety.

DI-P15 Favorite Bar and DI-C08 Most Popular Bar did:

```sql
group by l.bar_id
```

without `bar_id IS NOT NULL`. PostgreSQL still forms a **NULL group**. Aggregating `bar_name` on that group produced a pseudo-venue named **“Mobile Order”**, which could win popularity when MO logs outnumbered a physical bar.

DI-P11 / DI-G09 bars-visited use `count(distinct bar_id)`, which already ignores NULLs. DI-C09 least-visited joins catalog physical bars only.

### Fix contract

Add `and l.bar_id is not null` (personal) / `where l.bar_id is not null` (collective) to DI-P15 and DI-C08 only. Do not change MO bounty eligibility or ordinary log contribution to drink/ingredient variety.
