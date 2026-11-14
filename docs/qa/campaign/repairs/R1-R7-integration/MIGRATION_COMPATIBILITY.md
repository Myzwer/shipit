# R1–R7 Integration — Migration Compatibility

## Intended sequence (filenames verified)

| Version | File | Owner |
|---|---|---|
| `10900` | `20261105010900_mobile_order_virtual_source.sql` | Mobile Order |
| `11000` | `20261105011000_activity_day_reporting_boundary.sql` | Activity-day reporting |
| `11100` | `20261105011100_plan_c_wrapped_leaderboard_achievements.sql` | Wrapped LB achievements |
| `11200` | `20261105011200_admin_initialize_bounty_schedule.sql` | R5 schedule init |
| `11300` | `20261105011300_r6_wrapped_rank_and_mo_venue.sql` | R6 ranks + MO venue |
| `11400` | `20261105011400_r7_gauntlet_covered_count_location.sql` | R7 covered_count location |

Lexicographic order matches dependency intent. `11400` is `CREATE OR REPLACE` on `achievement_collection_covered_count` only (no table drops). Awarding already routes through `achievement_collection_covered_ids` → `achievement_log_counts_for_collection` (location-bound since `11000`).

## Environment history (read before apply)

| DB | Applied through | Notes |
|---|---|---|
| Organizer `:54322` | `10800` | **Do not apply** pending ops approval |
| Agent 1 disposable `:55322` | Was `11300`; now **`11400`** | Used for upgrade + integrity proofs |
| Agent 2 `:56322` | Has `10900`–`11100` + **`11400`**; missing `11200`/`11300` | Left unchanged this assignment |

## Tests performed on disposable infrastructure

### 1. Fresh path (organizer-schema clone)

1. Read-only `pg_dump --schema-only` from organizer (`10800` baseline).
2. Restored into scratch DB `r17_mig_fresh` on disposable container only.
3. Applied `10900` → `11000` → `11100` → `11200` → `11300` → `11400` with `ON_ERROR_STOP`.
4. Post-state fingerprints:
   - `wrapped_drinkit_leaderboard` md5 = `0f478a5abe74a1e525ebd9eca622a1ce` (R6-good), `order by` present
   - `achievement_collection_covered_count` md5 = `3aae1394704480904daef5650b38b5d1`, location bind + virtual exclude **true**
5. Dropped `r17_mig_fresh` afterward.

### 2. Existing DB upgrade (`11100`…`11400`)

Disposable already had through `11300` (R6). Applied `11400` via `docker cp` + `psql -f`, recorded `schema_migrations`.

| Checkpoint | Awards | Defs | LB md5 | covered location |
|---|---:|---:|---|---|
| Before `11400` | 324 | 179 | `0f478a5a…` | false |
| After `11400` | 324 | 179 | `0f478a5a…` (unchanged) | **true** |

Count deltas: awards/logs/subs/defs = **0**. No DELETE/TRUNCATE of awards, scores, or logs.

Idempotent re-apply of `11100`→`11400` on live disposable also succeeded (`CREATE OR REPLACE` / existing-table notices only).

### 3. Behavioral contracts after combined path

| Check | Result |
|---|---|
| R6 ranking + MO venue (`repro-r6-wrapped-ranking.mjs`) | **7/7 PASS** |
| Bar Gauntlet covered_count source guards | **PASS** (unit + function body) |
| Schedule init functions present | `admin_initialize_bounty_schedule` + core helper |
| Mobile Order exclusion in covered_count | `is_virtual is false` + `d.bar_id = bo.bar_id` |

## Safety

- Never applied to organizer.
- Never mutated Agent 2 DB from this agent.
- No `db reset`, stash, or destructive clean.
- Scratch DB dropped; disposable fixture awards preserved.
