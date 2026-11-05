# Ship Clock (Phase 2A)

Server-authoritative cruise timeline for Star Princess. **No device time, browser timezone, or client-supplied timestamp authorizes gameplay.**

Authority: `handoff/03-Technical-Spec.md` §5.1–5.4.

## Architecture

| Table | Role |
|---|---|
| `cruise_config` | Active sailing config: `day1_ship_date`, `base_ship_offset_minutes`, finale hour, `label` |
| `ship_clock_plan` | Seven optional daily deltas (`-120/-60/0/+60/+120`), enabled flag |
| `ship_clock_events` | Applied timeline segments (scheduled + manual); historical rows immutable |
| `game_control` | Per-game lifecycle + monotonic `finalized_at_utc` latch; pause columns reserved |
| `admin_audit_log` | Privileged mutation audit |

**Offset model:** `ship_local_wall = utc_instant + offset_minutes`.

Effective offset at UTC `T` =

`base_ship_offset_minutes + Σ delta_minutes` of events with `effective_at_utc ≤ T`.

## Scheduled 3:00 AM changes

For each enabled plan day with non-zero delta:

1. Take the offset **in force immediately before** the change.
2. Convert that cruise day’s **03:00 ship-local** wall time to UTC with that prior offset.
3. Insert a `scheduled` event with stable `schedule_key = plan:day:{n}`.

The unique `schedule_key` guarantees the adjustment **never applies twice**, even when a backward shift repeats a local hour.

**No cron:** reads call `rebuild_scheduled_clock_events` / `get_ship_clock_state`, which materialize missing future (and overdue) scheduled rows deterministically.

## Manual corrections

| RPC | Behavior |
|---|---|
| `admin_preview_manual_clock_correction(±60)` | Preview only |
| `admin_apply_manual_clock_correction(±60)` | Insert `manual_delta` event; rebuild **future** schedule |
| `admin_apply_manual_clock_set(target_ship_local)` | Compute delta to match displayed time; `manual_set` |

Past applied scheduled events stay immutable. Editing the plan after a day has fired does not rewrite that day’s historical event.

## Cruise calendar

- Day 1 = Saturday = `day1_ship_date` (ship-local calendar date)
- Day 7 = Friday = day1 + 6 days
- `cruise_day = (ship_date - day1_ship_date) + 1` when in range; otherwise `null`
- Finale: Day 7 at `final_hour:final_minute` (default **18:00**) ship-local → `finale_at_utc`
- Once `now ≥ finale_at_utc`, `game_control.finalized_at_utc` latches; **manual clock changes cannot clear it**

## RPCs (Phase 2A.1 hardened)

| Function | Who | Purpose |
|---|---|---|
| `get_ship_clock_state()` | authenticated | Clock snapshot at **server** `clock_timestamp()` only |
| `evaluate_submission_acceptance(game)` | authenticated | Acceptance using **server receipt** (`capture_submission_receipt_time`) |
| `admin_*` diagnostics / corrections / plan upsert | admin | Privileged mutations + audit; client `p_at_utc` ignored unless `service_role` |
| `dev_get_ship_clock_state_at(p_at_utc, p_apply_lifecycle_side_effects?)` | **service_role only** | Deterministic simulation |
| `dev_evaluate_submission_acceptance_at(...)` | **service_role only** | Boundary tests for cutoff / eligibility |
| `dev_seed_cruise_clock` | **service_role only** | Replace `development-only` config for tests |
| `capture_submission_receipt_time()` | service_role / internal | Contract helper for future scoring RPCs |

Players **cannot** pass evaluation timestamps. Simulated cruise days are available only through service-role `dev_*` RPCs (local tests), never production-facing player grants.

## Development config

Production sailing dates are **not** configured in this phase.

Tests seed via service role:

```text
label = development-only
day1_ship_date = 2099-01-03   # Saturday — explicitly non-production
base_ship_offset_minutes = -240
```

## How to run clock tests

```bash
export PATH="$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
npx supabase start
npx supabase db reset
export LOCAL_TEST_PASSWORD='…'
npm run db:provision
npm run test:clock
npm run test:integration   # includes Auth/RLS + clock
```

## Ambiguities documented (not invented as product rules)

1. **Plan delta `0`:** stored but does not create a `ship_clock_events` row.
2. **Simulated evaluation:** use `dev_*` service-role RPCs only. Production player RPCs never accept client timestamps.
3. **Pause/Resume Drink It!:** `game_control` columns/status exist; organizer pause RPCs are deferred to the approved later phase.
4. **Admin clock UI:** backend only in 2A; Vue Admin controls are the next Phase 2 slice.
