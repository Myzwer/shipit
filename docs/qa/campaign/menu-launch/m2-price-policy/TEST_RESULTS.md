# M2-P1 positive / negative test evidence

**Physical folder:** `/Users/josh/Documents/Web Projects/Vue/Ship It`  
**Branch/HEAD at implementation:** `visual/drinkit-home-v1` @ `0edb91c`  
**Database:** disposable `:55321` / `star-princess-disposable-mo` only  
**Protected:** organizer `:54321` and Agent 2 `:56321` unchanged  

## Commands

```bash
npx vitest run tests/unit/m2.unpricedMenuPricePolicy.spec.ts tests/unit/phase10b.priceEvidence.spec.ts
node scripts/menu-launch/run-m2-price-policy-validation.mjs
```

## Unit (Vitest)

`tests/unit/m2.unpricedMenuPricePolicy.spec.ts` + Phase 10B regression: **20/20 pass**.

## Disposable harness

Evidence: `evidence/m2-validation-results.json`, `evidence/m2-validation-console.txt`

| # | Requirement | Result |
|---|---|---|
| 1 | Category A/B/C/D baseline | PASS (`TS-ABCD-BASE`, Feb pools, Phase10B) |
| 2 | $14 eligible | PASS `TS-14-ELIGIBLE` |
| 3 | $15 eligible | PASS `TS-15-ELIGIBLE` |
| 4 | $16 log only | PASS `TS-16-LOG-ONLY`, `SQL-16-INELIGIBLE` |
| 5 | Complete unpriced menu candidates | PASS `TS-UNPRICED-READY`, `SQL-UNPRICED-NO-ERR` |
| 6 | Good Spirits when authorized | PASS `SQL-GS-UNPRICED-ELIGIBLE` |
| 7 | Isolated missing price | PASS `TS-ISOLATED-MISSING`, `SQL-ISOLATED-MISSING` |
| 8 | Cropped/incomplete | PASS `TS-CROPPED`, `SQL-CROPPED` |
| 9 | Fabricated U without auth | PASS `TS-FABRICATED-REJECT`, `SQL-FABRICATED-REJECT` |
| 10 | Cross-bar isolation | PASS `TS-CROSS-BAR`, `SQL-CROSS-BAR` |
| 11 | Category B cannot be copied | PASS `TS-NO-B-COPY`, `SQL-NO-B-COPY` |
| 12 | Unpriced bar rarity once | PASS `TS-RARITY-ONCE`, `SQL-RARITY-ONCE` |
| 13 | Over-limit never inflates rarity | PASS `TS-OVER-NO-INFLATE` |
| 14 | February ≥79/44 + init 125 | PASS `FEB-POOLS`, `BE-FEB-INIT-125` |
| 15 | Synthetic U stage→publish→init→claim | PASS `BE-U-*` |

**Harness totals (latest):** 38 PASS / 0 FAIL / 1 INFO.

## February fallback

Still `ready_for_scheduling` with cocktailEligible **79** and ingredientEligible **44**; Admin publish + `admin_initialize_bounty_schedule` yields 72+39+7+7 = **125**.
