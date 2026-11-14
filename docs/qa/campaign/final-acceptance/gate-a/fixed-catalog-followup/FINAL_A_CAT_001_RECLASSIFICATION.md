# FINAL-A-CAT-001 — Reclassification

## Preserve original failure evidence

| Field | Original Gate A record |
|---|---|
| ID | FINAL-A-CAT-001 |
| Title | Mid-voyage fixture catalog activate strands future bounty windows |
| Evidence (unchanged) | `../evidence/catalog-rebind-repro.json`, `../evidence/voyage-results.json`, `../evidence/catalog-rebind-run.txt` |
| Reproduction | `scripts/gate-a/run-catalog-rebind-repro.mjs` on `:55321` |
| Actual | `dev_activate_catalog_fixture` mid-voyage, after days 1–4 exposures, with Day-5 noon cocktail key removed → Day 5+ Cocktail/Ingredient `unavailable` |

## What remains true

Development fixture activation (`dev_activate_catalog_fixture`) **can invalidate future scheduled bounties** when the replacement catalog omits a key already bound to a future `scheduled` offer. That is unsafe as a stand-in for mid-cruise menu ops.

## What was not claimed / not repaired

- The production Admin publisher was **not** fully re-proven for omitted-key mid-cruise rebind in Gate A (`VALIDATION_NOT_READY` / incomplete harness on that path).  
- This follow-up **does not** claim the defect has been repaired in code.  
- No product change was made to publish/rebind behavior.

## Approved launch workflow (organizer plan)

1. Finalize the catalog **before** gameplay begins.  
2. Activate via Admin stage → preview → publish.  
3. Initialize the bounty schedule once via Admin.  
4. Start the voyage.  
5. **Do not replace the active catalog after gameplay begins.**

Mid-cruise catalog replacement and future-schedule rebinding are **not launch requirements**.

## Reclassification

| Field | Value |
|---|---|
| Prior severity framing | High / launch-relevant if mid-cruise menu swap is required |
| New classification | **Ops / out-of-scope for approved launch** — residual risk only if ops violate the fixed-catalog rule |
| Blocks launch? | **No**, when the fixed-catalog-before-start workflow is used and verified |
| Launch dependency | Operational rule enforcement; not a code fix for mid-cruise republish |

## Follow-up proof

`run-fixed-catalog-followup.mjs` verified the fixed catalog remains valid across seven simulated days **without** catalog replacement. See `FIXED_CATALOG_WORKFLOW.md` and `evidence/fixed-catalog-followup-results.json`.
