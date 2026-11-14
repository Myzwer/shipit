# MIGRATIONS — QA-4A disposable schema

## State used for integration tests

All mutating tests ran against `star-princess-qa2-backend` with **111 migrations applied** on first `supabase start`, including:

| Version | File | Applied on qa2 | Organizer | Agent 1 |
|---|---|---|---|---|
| `20261105010900` | Mobile Order virtual source | Yes | No (stops ~10800) | Yes |
| `20261105011000` | Activity-day reporting boundary | Yes | No | Yes |
| `20261105011100` | Plan C Wrapped leaderboard achievements | Yes | No | No |

No manual schema patches were used. Failures were not papered over.

## Ordering / compatibility

- Migrations applied in filename order by Supabase CLI; start completed without migration errors.
- Seed file pattern `supabase/seed.sql` absent (logged as warning only).
- Application compatibility verified via live RPCs: catalog stage/publish/rollback, Mobile Order bar, achievement engine, Wrapped aggregation with 11100 columns.

## Idempotency / rollback notes

- Catalog publish apply-time `REMAINING_POOL_SHORTAGE` rolls back the full transaction (versions, offers, global rows) — proven live (`QA3A-B003`).
- `dev_seed_cruise_clock` + `dev_reset_preview_gameplay_ledger` used between incompatible scenarios on **qa2 only**.
- Migration `11100` applied only inside qa2; never applied to organizer or Agent 1.

## WRP-001 vs 11100

With 11100 active on qa2, client `hasAchievementCounts` becomes true and Achievements leaderboard mode exposes real counts with denominator **126**. **Migration alone resolves WRP-001 exposure.** However, 11100 introduces **INT-WRP-002** (rank ordering regression) — see DEFECTS.md / Wrapped report.
