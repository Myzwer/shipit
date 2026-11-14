# Approved fixed-catalog pre-cruise sequence

Operational order for launch (verified on disposable `:55321`):

1. **Configure synthetic / voyage cruise** — `day1_ship_date` (Saturday), `base_ship_offset_minutes`, Ship Clock plan.  
2. **Stage a valid launch-candidate catalog** — Admin `admin_stage_catalog_import` with pure-TS `ready_for_scheduling` validation + payload hash (not `dev_activate_catalog_fixture` for the happy path).  
3. **Preview** — `admin_preview_catalog_publish`.  
4. **Activate / publish before gameplay** — `admin_publish_catalog_import` with `p_expected_active_catalog_version_id` + `p_expected_payload_hash`.  
5. **Initialize bounty schedule** — Admin `admin_initialize_bounty_schedule` (R5). Expect 72 cocktail + 39 ingredient + 7 bar + 7 daily = **125** entries; `gameplay_started=false`.  
6. **Verify schedule refs** — every cocktail/ingredient current offer joins eligible candidates on the **active** catalog version.  
7. **Start gameplay** via normal Ship Clock lifecycle (Day 1 open).  
8. **Do not change the active catalog** for the remainder of the seven-day cruise.

## Pre-gameplay failure matrix (verified)

| Case | Expected | Result |
|---|---|---|
| Invalid / non-catalog JSON stage | Rejected | PASS |
| Missing required relationships | Not `ready_for_scheduling`; does not stage | PASS |
| Catalog pool shortage on init | Atomic fail, **0** slots | PASS |
| Publish then retry same candidate | First OK; second fails cleanly | PASS |
| Production-compatible cruise label during init | Init still succeeds | PASS |

## Seven-day proof (no catalog change)

Days 1–7 noon Cocktail **active** with designated physical bar; Ingredient resolves; active `catalog_id` unchanged for the whole voyage simulation.

## Explicit ops rule

**Do not replace the active catalog after gameplay begins.**

Fixture activate is disposable-only and remains unsafe mid-voyage (FINAL-A-CAT-001 evidence preserved).
