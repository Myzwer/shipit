# Gate A — Catalog Runtime Results

## Contract under test (R5)

- First schedule **only** via Admin init (not catalog activate alone)  
- Later Admin publish rebinds **future `scheduled`** offers or fails transactionally  
- Historical claims / exposures preserved  
- Raw disposable `dev_activate_catalog_fixture` is **not** the production Admin publish path

## Gate A exercises

| Step | Result |
|---|---|
| Start catalog A + Admin init | PASS |
| Legitimate gameplay (cocktail claim) before change | PASS (supplemental) |
| Pointer moves on catalog activate B | PASS (voyage) |
| Historical claim count preserved | PASS (voyage; 0→0 then supplemental ≥ before) |
| New drink ordinary log after B | PASS (voyage) |
| Future windows after fixture activate **removing a Day5-scheduled key** | **FAIL — FINAL-A-CAT-001** |
| Admin stage of replacement omitting key | `VALIDATION_NOT_READY` with incomplete harness validation — Admin publish-with-shortage **not fully re-proven** this gate |
| Rollback after publish failure | Not completed (publish path incomplete) |

## Defect dependency for menu-agent phase

**FINAL-A-CAT-001 (reclassified for launch):** Mid-voyage `dev_activate_catalog_fixture` that drops a cocktail key already bound to a future scheduled offer leaves that window `unavailable`. Evidence preserved. **Approved launch does not include mid-cruise replacement** — see `fixed-catalog-followup/`.

**Required before trusting onboard menu replacement (future / menu-agent):**

1. Always use Admin stage → preview → publish (R4/R5 path), never raw fixture activate on a live schedule.  
2. Prove publish either rebinds the affected future slots from remaining pool **or** fails atomically with `REMAINING_POOL_SHORTAGE` (no silent stranded days).  
3. Explicit omitted-key publish proof after exposures on days 1–4.

## Fixed-catalog follow-up (2026-11-14)

Admin stage → preview → publish of a launch-candidate clone **before** gameplay, then Admin schedule init, then seven days **without** catalog change: **PASS**. Unlisted drink logging: **PASS** E2E. Details: `fixed-catalog-followup/`.

## Menu-generation agent

Not implemented (out of scope for launch). Disposable fixture activate remains unsafe mid-voyage; production Admin rebind remains the intended contract **if** mid-cruise replacement is ever approved later.
