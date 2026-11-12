# Pre-Cruise opening contract (backend verification)

**Status:** Verified against Scenario B — Pre-Cruise (unchanged)  
**Date:** 2026-11-12  
**Audience:** Visual Fidelity Agent (welcome/countdown UI)

## Authoritative opening rules (unchanged)

| Instant | Ship-local wall | Rule |
|---|---|---|
| Shared cruise gameplay open | Day 1 **00:00** | `ship_clock_state_at` → `lifecycle: active`; `cruise_day = 1` |
| Ship It! first scavenger submission | Day 1 **00:00** | `shipit_lifecycle_at` → `active` / `accepting_submissions` |
| Drink It! ordinary logging | Day 1 **00:00** | Submit path requires `cruise_day`; does **not** wait for noon |
| Drink It! first bounty / Daily window | Day 1 **12:00** | `drinkit_lifecycle_at` leaves `pre_open` → `open` |

`evaluate_submission_acceptance` uses Ship Clock lifecycle: `PRE_CRUISE` until Day 1 00:00, then `OK` (unless paused / finale).

**Gameplay open times match.** Drink It! **bounty scoring** begins later at noon.

## Countdown contract (`get_ship_clock_state`)

Prefer the existing clock RPC. After migration `20261105010600_precruise_opening_instants`, the snapshot includes:

| Field | Meaning |
|---|---|
| `at_utc` | Authoritative server time |
| `lifecycle` | `pre_cruise` \| `active` \| `final` |
| `cruise_opens_at_utc` | Day 1 00:00 UTC (shared open) |
| `shipit_opens_at_utc` | Same as `cruise_opens_at_utc` |
| `drinkit_opens_at_utc` | Same as `cruise_opens_at_utc` (logging / cruise access) |
| `drinkit_bounty_opens_at_utc` | Day 1 12:00 UTC (first noon bounty) |
| `finale_at_utc` | Existing finale boundary |

Opening UTCs use iterative offset refine (`ship_wall_at_utc`), same pattern as `finale_at_utc`. Do **not** derive openings from device local time or from `nextOpeningUtcIso` during `pre_cruise` (that helper targets the next noon on the *current* ship date, not Day 1 embarkation).

### Active QA Pre-Cruise snapshot (synthetic)

- `day1_ship_date = 2026-11-12`, `offset_minutes = -766`
- Shared open: `2026-11-12T12:46:00Z`
- Drink It! noon bounty: `2026-11-13T00:46:00Z`
- Live `lifecycle` remains `pre_cruise`

## Visual Fidelity coordination

1. **Shared countdown** to `cruise_opens_at_utc` / `shipit_opens_at_utc` / `drinkit_opens_at_utc` is correct for “games open.”
2. Do **not** promise Drink It! **bounty** play at that instant; use `drinkit_bounty_opens_at_utc` only if copy refers to noon bounties / “Game begins at 12:00 PM.”
3. Countdown reaching zero is **not** authorization. Gate on server `lifecycle !== 'pre_cruise'` (and existing Awards Mode on `final`). If still `pre_cruise`, show Opening Soon.
4. Poll / refresh `get_ship_clock_state` (existing `awardsMode` sync already refreshes ~15s) so transition to `active` does not require a redeploy.
5. Keep How to Play, Login, Account, Logout, and Admin reachable; do not invent new lifecycle states.
6. Existing finale / Awards Mode routing remains authoritative when `lifecycle === 'final'`.

## Routing note (current SPA)

Router Awards Mode remaps homes + submission routes when `final`; there is **not** yet a `pre_cruise` welcome gate in `src/app/router.ts`. Server submission RPCs still reject with `PRE_CRUISE` / unavailable. VF owns the frontend gate.
