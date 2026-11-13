# Activity-day reporting boundary (05:00 ship-local)

Organizer rule: overnight logging statistics use an **activity day** from **05:00** through **04:59:59** the next morning, in authoritative historical ship-local time.

## Examples

| Ship-local wall time | Activity day |
|---|---|
| Monday 11:18 PM | Monday |
| Tuesday 1:34 AM | Monday |
| Tuesday 4:59 AM | Monday |
| Tuesday 5:00 AM | Tuesday |
| Tuesday 8:30 AM | Tuesday |

Display is unchanged: a 1:34 AM drink still shows as 1:34 AM.

## What changed

| Area | Behavior |
|---|---|
| `ship_time_window` `before_hour` | Counts **[05:00, H)** only (post-midnight no longer counts as “morning”) |
| `ship_time_window` `after_hour` | Counts **[H, 24:00) ∪ [00:00, 05:00)** |
| Day-grouping achievements (`cruise_days`, `events_same_day`, `bars_same_day`, `same_bar_distinct_days`) | Group by activity day |
| Wrapped DI-G13 / DI-G14 | Order by minutes since 05:00; Day N uses activity day; primary text stays wall-clock |
| Wrapped log day buckets (DI-P18, DI-G16, DI-C10, …) | Drink logs bucket by activity day |
| Wrapped Ship It! day buckets | Completions use activity day |
| Gallery / earned badges | Unchanged wall-clock formatting |

## What did **not** change

- Ship Clock / offsets / scheduled 03:00 changes
- Game lifecycle, Drink It! noon open, bounty windows, one claim per category per game day
- Daily Challenge / Bar Bounty crew / Friday 18:00 finale
- `submissions.ship_day` storage (still calendar cruise day at submit)
- Bounty `game_day` and achievements that key on it (`day_bounty_score`, bounty claim days)
- `cruise_day` first / final / thanksgiving achievements (calendar semantics — see open decisions)
- `port_day_only` membership (still `submissions.ship_day`)

## SQL helpers

- `activity_day_boundary_time()` → `05:00:00`
- `activity_date_from_ship_local(timestamp)`
- `activity_clock_minutes_from_ship_local_time(time)`
- `achievement_activity_day_for_submission(submissions)`
- `achievement_activity_clock_minutes_for_submission(submissions)`
- `activity_day_for_utc(cruise_config_id, timestamptz)`

Migration: `20261105011000_activity_day_reporting_boundary.sql`.

## Open semantic decisions (do not guess)

1. **Pre-Day-1 overnight (00:00–04:59 on embarkation morning)** — activity date falls before Day 1; cruise day is null.
2. **Final-day / thanksgiving / port-day achievements** — still calendar `ship_day` / calendar date; overnight before 05:00 on that civil morning stays on the prior activity day if those were switched.
3. **DI-P17 / DI-G15 (bounty points by day)** — remain gameplay `game_day` (claims are midday-only).

## Activate in organizer environment

Apply **after** Mobile Order `10900` on a disposable check first. Do **not** `db reset` the Wrapped Scenario C database. Apply `11000` only when approved alongside or after `10900`.
