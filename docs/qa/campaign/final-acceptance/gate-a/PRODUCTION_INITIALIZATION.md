# Gate A — Production-like First Initialization

## Method

On disposable `:55321` only:

1. `dev_seed_cruise_clock` → synthetic Sat–Fri (`2099-01-03`, offset −240) — clock config only  
2. `dev_clear_bounty_schedule_ledger` → **empty** schedule (not a preseeded fixture reuse for the init proof)  
3. Activate schedule-ready catalog (72 cocktail + 39 ingredient candidates + launch bar keys)  
4. Admin session → `admin_initialize_bounty_schedule` (**R5 production path**)  
5. Verify status, counts, idempotency, concurrency, shortage atomicity, non-admin denial  
6. Confirm `gameplay_started=false` and Ship Time unchanged by init  

**Not used for first schedule:** `dev_generate_bounty_schedule`.

## Results

| Check | Result |
|---|---|
| Status empty → can_initialize | PASS |
| Init → 72 cocktail / 39 ingredient / 7 bar / 7 daily | PASS |
| Day 7 cocktail slots = 6 | PASS |
| All slots `scheduled` at init | PASS (R5 suite) |
| Bar sequence (wake-view → … → promenade) | PASS |
| Same request id → durable replay | PASS |
| New request after success → `SCHEDULE_ALREADY_INITIALIZED` (no reshuffle) | PASS |
| Concurrent inits consistent | PASS |
| Pool shortage → **0 slots** (no partial days) | PASS |
| Non-admin → denied | PASS |
| Finalized → `CRUISE_FINALIZED` | PASS (R5) |
| Paused → init allowed, stays paused | PASS (R5) |
| Production-compatible label during init | PASS (voyage + R5) |

## Pre-cruise after init

Schedule can exist while lifecycle is still `pre_cruise`. Claims rejected before Day 1 open. Init alone does not open gameplay.

## Ops implication

Aboard ship, after catalog + cruise config are ready, **one Admin tap** (or authenticated Admin RPC) initializes the voyage. No developer fixture scripts required for normal operation.
