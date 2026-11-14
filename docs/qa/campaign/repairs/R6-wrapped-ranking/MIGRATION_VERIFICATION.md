# R6 — Migration Verification

## Sequence

| Version | Purpose | Disposable after R6 |
|---|---|---|
| `10900` | Mobile Order virtual bar + `wrapped_di_log_rows` nulls virtual `bar_id` | Present |
| `11000` | Activity-day Wrapped helpers | Present |
| `11100` | Achievements on Drink It LB (source now includes ORDER BY) | Present (recorded) |
| `11200` | Admin bounty schedule init (R5) | Present |
| `11300` | R6 rank + MO venue repair | **Present** |

No `11300` collision existed before this repair. Agent 2 R7 reserved a later number.

## Disposable apply procedure used

1. Confirmed broken body already live (`achievements` join, no `ORDER BY`) while `11100` was missing from `schema_migrations` (prior manual/partial apply).
2. Recorded `20261105011100` without destructive reset.
3. `docker cp` + `psql -f` applied `20261105011300_r6_wrapped_rank_and_mo_venue.sql`.
4. Inserted `20261105011300` into `supabase_migrations.schema_migrations`.

Fingerprints:

| Checkpoint | `md5(prosrc)` `wrapped_drinkit_leaderboard` |
|---|---|
| Before | `e5d5e03a4468bac00ba49107e7a69918` |
| After | `0f478a5abe74a1e525ebd9eca622a1ce` |

Post-apply checks:

- `after_lb_matches_score=true`
- `sections_has_mo_filter=true`
- `lb_has_order_by=true`

## Other environments

| Target | Action |
|---|---|
| Organizer `:54321` / DB `…-local` | **Not migrated.** `11300` absent. (Readonly note: function body already mentioned achievements without ORDER BY from an earlier experiment — still **must not** receive `11100`/`11300` until ops approve.) |
| Agent 2 `:56321` | **Not migrated.** Still has defective `11100` ranks until `11300` is applied there. |
| Fresh reset | Applying migrations in order yields correct `11100` then reinforcing `11300`. |

## Safety

- No `db reset`, stash, or organizer mutation.
- `QA_ALLOW_ORGANIZER_MUTATION` never set.
- No data DELETE/TRUNCATE of scores or awards; function replace only.
- Fixture proofs used `BEGIN`/`ROLLBACK` transactional DDL.
