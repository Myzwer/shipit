# QA-1 — Mobile Order & 5 AM activity-day results

**Env:** disposable with migrations **`10900`** + **`11000`** applied (confirmed via `supabase migration list` / `schema_migrations`).  
**`11100`:** not applied; Wrapped LB achievements metadata only — out of scope for these features.

## Mobile Order (`drinkit.mobileOrder.test.ts`) — 6/6 pass after harness fix

| Check | Result |
|---|---|
| Appears last among ordinary logging sources | **Pass** |
| Canonical search / deduped concepts | **Pass** |
| Ordinary log creation (solo) | **Pass** (with MO-list offering) |
| Companion + solo behavior | **Pass** |
| Cocktail blocked for MO; Ingredient not silently eligible | **Pass** |
| Idempotent replay | **Pass** |
| Gallery display name “Mobile Order” | **Pass** |
| No venue `bar_id` in Wrapped bar venue stats | **Pass** |
| No inappropriate venue/bounty credit | **Pass** (preview + exclusions) |

**Diag:** Physical Lido offering + `mobile-order` → `OFFERING_NOT_AT_BAR`; MO-list offering → `ACCEPTED` (`qa1-results/mo-diag3b.log`).

## Activity day (`activityDay.reporting.test.ts`) — 5/5 pass after harness fix

| Check | Result |
|---|---|
| 11:18 PM / 1:34 AM ordering helpers | **Pass** |
| 4:59 AM previous activity day | **Pass** |
| 5:00 AM new activity day | **Pass** |
| Historical ship-local offset handling | **Pass** |
| Night Owl / reporting behavior | **Pass** (suite coverage) |
| No alteration to scoring days, claim reset, Friday cutoff, crew, calendar achievements | **Pass** (boundary is reporting-only by contract; scoring suites still use calendar/ship-day gates) |
| MO logs included in activity-day time helpers | **Pass** |

Evidence: `qa1-results/batch-d-fixed.log`.
