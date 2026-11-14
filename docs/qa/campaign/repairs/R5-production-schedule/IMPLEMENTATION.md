# R5 — Implementation

## Chosen mechanism

**Admin-authorized production scheduling operation** (not a service-role ops script as the primary path).

Rationale:

- Organizer has effectively no developer access during the cruise.
- Existing Admin patterns already provide request-id idempotency, audit, and lost-response reconcile (pause/skip/catalog).
- Keeps service-role credentials out of the browser.
- Separates schedule preparation from gameplay start (does not unpause, finalize, or mutate Ship Clock).

Controlled service-role ops remain available for disposable QA (`dev_generate_bounty_schedule`, `dev_clear_bounty_schedule_ledger`) but are **not** required for production init.

## Files / migrations changed

| Path | Role |
|---|---|
| `supabase/migrations/20261105011200_admin_initialize_bounty_schedule.sql` | Ledger + Admin RPCs + core generator + disposable clear helper |
| `src/lib/adminBountyScheduleInit.ts` | Admin client |
| `src/lib/pendingBountyScheduleInit.ts` | Lost-response pending storage |
| `src/features/admin/BountyScheduleInitSection.vue` | Minimal Admin UI |
| `src/features/admin/DrinkItAdminSection.vue` | Mount section |
| `src/stores/session.ts` | Clear pending on signOut |
| `src/ui/copy.ts` | Admin strings |
| `docs/BOUNTY_SCHEDULING.md` | Document production path |
| `tests/unit/qa3a-admin-catalog/*` | Contracts / inventory |
| `tests/integration/bountySchedule.r5.init.test.ts` | Disposable integration proof |

## RPCs

| RPC | Who | Behavior |
|---|---|---|
| `admin_initialize_bounty_schedule(request_id, seed?)` | Admin | Atomic first init: 72 cocktail + 39 ingredient + 7 bar + 7 daily |
| `admin_get_bounty_schedule_status()` | Admin | Completeness + can_initialize |
| `admin_find_bounty_schedule_init_request_by_id` | Admin | Lost-response reconcile |
| `initialize_bounty_schedule_core` | internal | Shared generator (not granted) |
| `dev_clear_bounty_schedule_ledger` | service_role + development-only | Disposable test cleanup |

## Safety behaviors

- Requires `is_admin()` + non-null `client_request_id`
- Advisory lock serializes concurrent inits
- Same request id → durable replay
- Complete schedule → `SCHEDULE_ALREADY_INITIALIZED` (no reshuffle)
- Partial ledger → `SCHEDULE_INCOMPLETE_OR_CORRUPT` (no silent repair)
- Finalized / finale → `CRUISE_FINALIZED`
- Shortage / missing bars → structured failure; transaction rolls back slots
- Paused lifecycle **allows** init (does not resume)
- `gameplay_started: false` always on success
- Cocktail pool excludes virtual / `mobile-order` bars

## Migration dependencies

| Migration | Relation to R5 |
|---|---|
| `10900` Mobile Order virtual bar | Applied on disposable; R5 filters `is_virtual` |
| `11000` Activity day boundary | Applied on disposable; orthogonal to schedule init |
| `11100` Wrapped leaderboard ranks | **Not required** by R5; still pending on disposable/organizer (R6) |
| `11200` This repair | Applied to Agent 1 disposable only; **not** organizer |

## Out of scope (explicit)

- Menu extraction / reconstruction agent
- Automatic schedule rewrite on every catalog activate beyond existing publish rebind
- Cruise date Admin editor (still ops/out-of-band — AMBIGUITIES #1)
- Redesign of Admin IA beyond one Drink It! section
