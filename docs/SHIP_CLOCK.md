# Ship Clock (Phase 2A–2B)

Server-authoritative cruise timeline for Star Princess. **No device time, browser timezone, or client-supplied timestamp authorizes gameplay.**

Authority: `handoff/03-Technical-Spec.md` §5.1–5.4, `handoff/02-UX-Behavior.md` §10.1.

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

## Read stability (Phase 2B)

Ordinary clock reads (`get_ship_clock_state`, `ship_clock_state_at`) **evaluate** persisted events and may latch finale. They do **not** delete or recreate future scheduled rows.

`rebuild_scheduled_clock_events` runs only when the organizer changes the plan or applies a manual correction (and during `dev_seed_cruise_clock`). That keeps scheduled event IDs stable across concurrent player reads and avoids wiping a future rehearsal schedule when wall-clock “now” is before Day 1.

## Scheduled 3:00 AM changes

For each enabled plan day with non-zero delta:

1. Take the offset **in force immediately before** the change.
2. Convert that cruise day’s **03:00 ship-local** wall time to UTC with that prior offset.
3. Insert a `scheduled` event with stable `schedule_key = plan:day:{n}`.

Manual corrections stay additive: later scheduled deltas still apply on top of the corrected baseline.

## Admin UI

Organizer path: Home → Account → **Admin** (`/admin`, `is_admin` required).

**Ship Clock** section shows Current Ship Time, cruise day/date when configured, effective UTC offset, lifecycle, planned seven-day adjustments, and recent manual adjustments.

| Control | Behavior |
|---|---|
| `−1 Hour` / `+1 Hour` | Preview → confirm (`Apply Ship Time Change?`) → `admin_apply_manual_clock_correction` |
| `Set Ship Time` | Emergency target ship-local wall → same confirmation → `admin_apply_manual_clock_set` |
| `Planned Time Changes` | Seven Saturday–Friday rows → confirm → **one** `admin_save_ship_clock_plan` (atomic) |

**Plan row states** (round-trip distinctly):

- **Schedule off** → `enabled=false` (no overnight event)
- **No change** → `enabled=true`, `delta_minutes=0` (explicit zero)
- **±1 / ±2 hours** → enabled non-zero delta

After a successful correction, the UI refreshes diagnostics and shows the resulting Ship Time. **Change Not Saved** is shown only when non-application is confirmed.

If a network error leaves ±1h / Set Ship Time uncertain, the UI reports an **unknown** outcome and:

- Persists the pending `client_request_id` + intent in `localStorage` (no credentials)
- Blocks new ±1h / Set Ship Time until the pending operation is confirmed
- Survives refresh and leaving/returning to Admin
- Offers **Refresh Ship Time** (reconcile only) and **Retry Same Change** (idempotent replay of the *same* request id)
- Does **not** unlock merely because a warning was dismissed, remounted, or a reconcile call failed
- Does **not** treat a missing request-id row after a successful read as confirmed failure (it may still be processing)

Server-side, each request id is bound to an operation fingerprint (`manual_delta:±60` / `manual_set:…`). Replaying the same id with a different payload raises `REQUEST_ID_OPERATION_MISMATCH`.

Historical nights that already applied explain that plan edits will not rewrite past events.

### Verify a correction

1. Note **Current Ship Time** and offset before confirm.
2. Apply with confirmation.
3. Confirm success feedback plus updated Current Ship Time / offset.
4. Optionally open a player Home and check the Ship Time indicator matches (after refresh).

## Player display

`src/lib/shipClock.ts` fetches `get_ship_clock_state()` (server `clock_timestamp()` only). Home shells show a compact Ship Time indicator that may tick visually between syncs; refresh reconciles to the server snapshot. Phone timezone never authorizes eligibility.

Drink It! Pause/Resume is **not** a clock operation. Organizer controls live under Admin → Game Status (`admin_set_drinkit_paused`). Do not reuse manual clock correction RPCs to pause the game.

## RPCs

| Function | Who | Purpose |
|---|---|---|
| `get_ship_clock_state()` | authenticated | Clock snapshot at server time |
| `evaluate_submission_acceptance(game)` | authenticated | Acceptance using server receipt time |
| `admin_*` diagnostics / corrections | admin | Privileged mutations + audit; client `p_at_utc` ignored unless `service_role` |
| `admin_save_ship_clock_plan(p_days)` | admin | Atomic validated seven-day plan write + single rebuild |
| `admin_find_clock_event_by_request_id` | admin | Reconcile uncertain manual corrections |
| `dev_get_ship_clock_state_at` / `dev_evaluate_submission_acceptance_at` | **service_role only** | Deterministic simulation |
| `dev_seed_cruise_clock` | **service_role only** | Replace `development-only` config for tests |

## Development vs launch configuration

Production sailing dates are **not** configured in this phase.

Local/tests seed:

```text
label = development-only
day1_ship_date = 2099-01-03   # Saturday — explicitly non-production
base_ship_offset_minutes = -240
```

**Still required before launch:** real Day 1 Saturday date, starting offset, and the organizer’s best-guess seven-day 3 AM plan (editable in Admin). Roster/content remain later phases.

## How to run clock / security tests

```bash
export PATH="$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
npx supabase start
npx supabase db reset
export LOCAL_TEST_PASSWORD='…'
npm run db:provision
npm run test:clock
npm run test:integration
npm run test:e2e:phase2b   # Vite must be running
npm run screenshots:phase2b
```

Screenshots: `docs/phase2b-screenshots/`.

## Ambiguities documented

1. **Plan delta `0`:** stored but does not create a `ship_clock_events` row.
2. **Simulated evaluation:** service-role `dev_*` only.
3. **Pause/Resume Drink It!:** shipped in Phase 2D-B2 (Admin → Game Status; not a clock mutation).
4. **Bounty countdowns / slot eligibility:** not in Phase 2B.
