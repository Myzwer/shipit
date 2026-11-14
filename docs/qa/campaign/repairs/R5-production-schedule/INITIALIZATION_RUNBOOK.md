# R5 — Production bounty schedule initialization runbook

## Preconditions (before boarding)

1. **Cruise config** present and active: real `day1_ship_date` (Saturday), `base_ship_offset_minutes`, Ship Clock plan as known. (Still out-of-band / not Admin-edited — see AMBIGUITIES #1.)
2. **Active catalog** published and scheduling-ready (≥72 eligible physical Cocktail candidates, ≥39 eligible Ingredient candidates). Prefer launch-candidate or a reviewed replacement via Admin Catalog Import.
3. **Admin** account available on the production project.
4. Migration `20261105011200_admin_initialize_bounty_schedule` applied to the target database.
5. Drink It! must **not** be finale-latched.

## Initialize (Admin UI)

1. Sign in as Admin → **Drink It!** → **Bounty Schedule**.
2. Confirm status shows schedule not initialized and **Initialize** enabled.
3. Confirm counts: Cocktail 0/72 · Ingredient 0/39 · Bar 0/7 · Daily 0/7 (or equivalent empty).
4. Tap **Initialize Bounty Schedule** → confirm.
5. Success: seven-day schedule ready. This does **not** start gameplay and does **not** change Ship Time.
6. If the UI shows unknown after a timeout: use **Refresh Status** / **Retry Same Change** (same request id). Do not mint a new init until reconcile completes.

## Initialize (RPC / ops backup)

Authenticated Admin session only (never embed service_role in a device):

```text
admin_get_bounty_schedule_status()
admin_initialize_bounty_schedule(p_client_request_id := <uuid>, p_seed := null)
admin_find_bounty_schedule_init_request_by_id(p_client_request_id := <uuid>)
```

## What becomes active

- Slot ledger rows exist in `scheduled` state for all Cocktail/Ingredient windows.
- Bar Bounty day sequence and Daily Challenges are written.
- Player bounty RPCs return live objectives only when Ship Time enters the matching window (and Drink It! is not paused / not finale).
- Preparing the schedule alone never opens Day-1 noon play.

## Failure / retry matrix

| Situation | Expected |
|---|---|
| First init | `INITIALIZED` with 72/39/7/7 |
| Same request id | Durable replay (`idempotent_replay`) |
| New request after success | `SCHEDULE_ALREADY_INITIALIZED` (no reshuffle) |
| Concurrent inits | Serialized; one creates or all acknowledge complete |
| Timeout after accept | Reconcile by request id |
| Partial ledger | `SCHEDULE_INCOMPLETE_OR_CORRUPT` — stop; do not force |
| No / invalid catalog | `NO_ACTIVE_CATALOG` / pool shortage codes |
| Missing bar keys | `BAR_KEY_MISSING` / `DAILY_BAR_KEY_MISSING` |
| Finalized cruise | `CRUISE_FINALIZED` |
| Paused Drink It! | Init **allowed**; remains paused |
| Active claims without complete schedule | `EXISTING_ACCEPTED_CLAIMS` |

## User action before boarding

**Yes — one Admin initialization** after catalog + cruise config are ready. No developer fixture scripts. No action required from players. No requirement for an open browser during the voyage for rotations (server clock authoritative).

## Do not

- Run `dev_generate_bounty_schedule` / `dev_seed_daily_assignments` on production labels.
- Set `QA_ALLOW_ORGANIZER_MUTATION=1`.
- Silently replace an active schedule.
- Assume catalog publish creates the first schedule (it only rebinds future slots once a schedule exists).
