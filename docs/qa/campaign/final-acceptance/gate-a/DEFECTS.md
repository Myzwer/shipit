# Gate A — Defects

## Confirmed new product / ops defects

### FINAL-A-CAT-001 — Mid-voyage fixture catalog activate strands future bounty windows

| Field | Value |
|---|---|
| Severity | **High** (cruise days become unplayable for Cocktail/Ingredient) |
| Expected | After a catalog replacement, future `scheduled` windows remain playable via rebind **or** the replacement fails atomically with a clear shortage/invalid code — never silent `unavailable` days |
| Actual | `dev_activate_catalog_fixture` mid-voyage, after days 1–4 exposures, with the Day-5-noon cocktail key removed from the replacement catalog, leaves Day 5 cocktail status `unavailable` (voyage days 5–7 Cocktail/Ingredient broken) |
| Reproduction | `scripts/gate-a/run-catalog-rebind-repro.mjs` on `:55321`; also voyage catalog B path |
| Evidence | `evidence/catalog-rebind-repro.json`, `evidence/voyage-results.json` |
| Backend state | Schedule slots remain but public resolve returns `unavailable` for affected future windows |
| Affected workflow | On-ship menu replacement / catalog republish during an active cruise |
| Continue tests? | **Yes** — Bar bounty, finale, Wrapped, Admin still testable |
| Notes | Production path is Admin publish+rebind (R5 contract). Fixture activate is disposable-only and **unsafe** as a stand-in for mid-cruise menu ops. Admin stage with incomplete validation returned `VALIDATION_NOT_READY` in the same repro — full Admin omitted-key publish proof remains a gap for the menu-agent phase |

## Triaged non-defects (harness)

| ID | Why not a product defect |
|---|---|
| Voyage ingredient DAY1–4 “FAIL” | Active windows; wrong field names in assertion |
| Voyage WRP-AVAILABLE | Missing `p_game` argument |
| Voyage ACH-BLOCKED-10 | Wrong map field (`release_enabled` vs `enabledInProductionRelease`) |
| Cocktail claim without `offer_id` | Contract requires `selected_claims[].offer_id`; preview shows eligible |

## Pre-existing residuals (not re-filed)

- R2 Storage SDK limitation  
- INT-AUTH-001 JWT residual until expiry  
- Organizer migrations 10900–11400 not applied (protected fixture)  
- 10 achievement operational blocks (by design until organizer/UUID map)
