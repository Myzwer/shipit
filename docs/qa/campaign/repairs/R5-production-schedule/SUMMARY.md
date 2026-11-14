# R5 — Production Bounty Schedule Initialization

**Status:** Repaired and verified on disposable `:55321`  
**Baseline HEAD:** `535686f` on `visual/drinkit-home-v1`  
**Defect:** REP-SCHED-001 / INT-SCHED-001 / QA3A-B012 / RISK-CAT-D

## Verdict

A correctly configured cruise can generate and use its entire seven-day bounty schedule through an Admin production path — without `dev_*` fixture scripts and without starting gameplay. Initialization is idempotent, refuses unsafe states, and leaves catalog publish rebind as the existing path for later menu updates.

## Chosen execution mechanism

**Admin-authorized RPC + minimal Drink It! Admin section** (`admin_initialize_bounty_schedule`), with durable request-id ledger and reconcile. Preferred over a service-role-only ops script so the organizer can initialize aboard without developer tooling or bundled secrets.

## How a new cruise is initialized

1. Ops/config: active cruise dates + clock (still out-of-band).
2. Admin publishes a scheduling-ready catalog (R4 path).
3. Admin → Drink It! → **Initialize Bounty Schedule** (or Admin RPC with `client_request_id`).
4. Server atomically writes 72 Cocktail + 39 Ingredient slots, 7 Bar Bounties, 7 Daily Challenges bound to the active catalog version.
5. Windows become player-visible only when Ship Time enters them; init itself does not open play.

## Schedule activation vs gameplay

| Action | Starts gameplay? |
|---|---|
| Initialize schedule | **No** |
| Ship Time reaches Day 1 noon + Drink It! not paused | Cocktail/Ingredient windows resolve |
| Friday 6 PM / finale latch | All eligibility ends (existing rules) |

## Verified windows

| Category | Total | Notes |
|---|---|---|
| Cocktail | **72** | Days 1–6: 11 hourly 12–23; Day 7: 6 hourly 12–18 |
| Ingredient | **39** | 2h cadence; final Days 1–6 window 22–23 (1h) |
| Bar | **7** | Wake View → Good Spirits → Sea View → Crooners → O'Malley's → Lido → Promenade |
| Daily | **7** | Existing titles/modes; 50 points |

## Failures / retries

Same request id replays; post-success returns `SCHEDULE_ALREADY_INITIALIZED` without reshuffle; concurrent calls serialize; partial/finalized/shortage/non-admin rejected with actionable codes.

## Catalog updates

First schedule ≠ catalog publish. Later publish **rebinds future scheduled slots only** (existing). Full mid-cruise reshuffle reserved for menu-agent phase — see `CATALOG_UPDATE_CONTRACT.md`.

## User action before boarding

**One Admin initialize** after catalog + cruise config are ready. No player action. No browser required for rotations underway.

## Verification snapshot

| Check | Result |
|---|---|
| Disposable Admin init integration | **4/4 pass** |
| QA-3A admin-catalog units | **230/230 pass** |
| R1 submission integrity (clock restored) | **3/3 pass** |
| Typecheck / build | Pass |
| Organizer / Agent 2 DBs | Untouched |

## Remaining launch inputs

- Apply `11200` to organizer when approved (with snapshot)
- Real voyage dates / offset (AMBIGUITIES #1)
- Pending `11100` Wrapped ranks (R6 — independent)

## Docs in this folder

- `ROOT_CAUSE.md`
- `IMPLEMENTATION.md`
- `INITIALIZATION_RUNBOOK.md`
- `CATALOG_UPDATE_CONTRACT.md`
- `REGRESSION_RESULTS.md`
- `REMAINING_RISKS.md`
- `evidence/`
