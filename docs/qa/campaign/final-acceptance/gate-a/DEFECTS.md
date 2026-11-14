# Gate A — Defects

## Reclassified (does not block launch under fixed-catalog workflow)

### FINAL-A-CAT-001 — Mid-voyage fixture catalog activate strands future bounty windows

| Field | Value |
|---|---|
| Severity (original) | **High** when mid-cruise catalog replacement is required |
| Launch disposition (2026-11-14 follow-up) | **Does not block launch** if the organizer follows the approved **fixed catalog before gameplay** workflow |
| Expected (original) | After a catalog replacement, future `scheduled` windows remain playable via rebind **or** the replacement fails atomically — never silent `unavailable` days |
| Actual (preserved) | `dev_activate_catalog_fixture` mid-voyage, after days 1–4 exposures, with the Day-5-noon cocktail key removed from the replacement catalog, leaves Day 5 cocktail status `unavailable` |
| Reproduction | `scripts/gate-a/run-catalog-rebind-repro.mjs` on `:55321`; also voyage catalog B path |
| Evidence (preserved) | `evidence/catalog-rebind-repro.json`, `evidence/voyage-results.json` |
| Backend state | Schedule slots remain but public resolve returns `unavailable` for affected future windows |
| Affected workflow | On-ship menu replacement / catalog republish during an active cruise |
| Reclassification notes | Mid-cruise replacement is **outside the approved launch workflow**. Development fixture activation can invalidate future scheduled bounties. Production Admin publish+rebind for omitted keys was **not** fully re-proven and is **not** claimed repaired. Operational rule: **do not replace the active catalog after gameplay begins**. See `fixed-catalog-followup/FINAL_A_CAT_001_RECLASSIFICATION.md` |

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
