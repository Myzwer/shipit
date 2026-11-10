# Bar Bounty Daily Crews (Phase B1)

Server-authoritative daily crew assignment for the Bar Bounty redesign. **B1 does not change scoring or UI.**

## Authority

- Ship Clock only: `bar_bounty_crew_context_at(at_utc)` → `cruise_day` via `clock_offset_at` + `utc_to_ship_local` + `cruise_day_for_ship_date`.
- Never uses client device time, timezone, geolocation, or a client-supplied day/roster.
- Day identity is cruise day `1..7`. Offset changes that keep the same cruise day reuse the locked assignment (`unique (cruise_config_id, day_number)`).

## Schema

| Table | Role |
|---|---|
| `bar_bounty_crew_days` | One generation ledger row per cruise day (seed, roster_size, algorithm_version) |
| `bar_bounty_crews` | Crew groups (`size` 3 or 4) for a day |
| `bar_bounty_crew_members` | Immutable membership snapshot (`unique` player per day) |

FK `cruise_config_id … on delete cascade` so `dev_seed_cruise_clock` clears local history.

## Roster source

Active Drink It! participants only:

`players.active` + `game_memberships(game='drinkit', enabled=true)`.

Independent of Ship It! teams. Seven is the minimum; fewer returns `ROSTER_TOO_SMALL` and does **not** invent invalid crew sizes.

## Partitioning

`bar_bounty_crew_partition_sizes(n)` — crews of 3 or 4 only:

| `n % 4` | Rule | Examples |
|---|---|---|
| 0 | all fours | 8→4+4, 12→4+4+4 |
| 1 | three threes + remaining fours | 9→3+3+3, 13→4+3+3+3 |
| 2 | two threes + remaining fours | 10→4+3+3, 14→4+4+3+3 |
| 3 | one three + remaining fours | 7→4+3, 11→4+4+3 |

Same rule extends to larger reasonable rosters.

## Weighted randomization (`b1-v1`)

1. Build unordered pair history from **earlier** locked days on this cruise (how often each pair shared a crew).
2. Sample **48** random partitions: Fisher–Yates shuffle of the roster with a hash stream `md5(seed:trial:counter)`, then cut by the partition sizes.
3. Score each trial = sum of historical co-assignment counts over all within-crew pairs.
4. Softmax-style pick: `weight = exp(-0.85 × score)`, seeded roulette selection among trials.

Properties:

- Day 1 (empty history): uniform among shuffles → genuine randomness.
- Later days: lower-repeat partitions are preferred, but higher-score partitions retain non-zero probability.
- Does not promise zero repeats; does not use Ship It! teams; not a fixed rotation table.
- Seed is stored on `bar_bounty_crew_days.seed` (dev can pass `p_seed`).

## Day locking / concurrency

`bar_bounty_ensure_crews_at`:

1. Resolve cruise day from Ship Clock.
2. `pg_advisory_xact_lock` on `(cruise_config_id, day_number)`.
3. If a day row exists → return identical payload (`idempotent: true`).
4. Else generate, insert day row (unique constraint backstop), then crews + members.
5. Concurrent losers catch `unique_violation` and re-read.

No future-day generation: only the day implied by `p_at_utc` / `clock_timestamp()`.

## Roster changes

- Snapshot at generation time is immutable for that day.
- Mid-day join → `get_my_bar_bounty_crew` returns `status: unassigned` / `not_in_todays_roster`.
- Mid-day opt-out → existing member rows remain; no reshuffle; no incomplete-crew repair.
- Next game day reads the live roster again.

## RPCs / data contract

### `get_my_bar_bounty_crew()` → player

Requires Drink It! (or admin). Generate-on-demand for **today**.

Assigned:

```json
{
  "ok": true,
  "status": "assigned",
  "cruise_day": 3,
  "crew_day_id": "…",
  "crew_id": "…",
  "crew_size": 4,
  "members": [
    { "player_id": "…", "display_name": "…", "is_self": true },
    { "player_id": "…", "display_name": "…", "is_self": false }
  ],
  "generated_at_utc": "…"
}
```

Other statuses: `unassigned`, `roster_too_small`, `unavailable` (`DAY_UNAVAILABLE`).

### `admin_list_bar_bounty_crews()` → admin

All of today's crews (same generate-on-demand). On `<7` players returns explicit `issue.code = ROSTER_TOO_SMALL`.

### Dev (service_role + `development-only`)

- `dev_ensure_bar_bounty_crews_at(p_at_utc, p_seed?, p_roster_override?)`
- `dev_get_bar_bounty_crews_at(p_at_utc)`
- `dev_bar_bounty_crew_partition_sizes(p_n)`

`p_roster_override` is **dev-only** so tests can use synthetic ids without private roster material.

## B2 integration points (not implemented in B1)

Planned claim rules use **assigned crewmates only** (selected companions ∩ assigned mates):

| Present assigned mates (incl. self) | Points |
|---|---|
| Solo / cannot claim | 0 |
| 2 of crew (incl. self) | 20 |
| Full 3-person crew | 40 |
| 3 of 4-person crew | 30 |
| Full 4-person crew | 40 |

Helper for scoring RPCs:

`bar_bounty_crew_mate_ids(cruise_config_id, day_number, player_id) → uuid[]`

Read path for B2:

1. Server stamps `cruise_day` from Ship Clock (existing submit path).
2. Load locked crew via members table / mate helper (do not regenerate).
3. Intersect claim companion ids with assigned mates.
4. Map presence count + `crew_size` to points.
5. Keep one claim per player per day (existing `bounty_claims` uniqueness pattern).

Do **not** change B1 tables for ordinary client writes; claims remain RPC-only.

## Tests

- Unit: `tests/unit/barBountyCrewPartition.spec.ts`
- Integration: `tests/integration/drinkit.barBountyCrew.phaseB1.test.ts`

```bash
LOCAL_TEST_PASSWORD='…' npm run test:crew
```
