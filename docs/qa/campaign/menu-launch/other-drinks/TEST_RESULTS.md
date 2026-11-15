# Other Drinks — focused test results

**Physical folder:** `/Users/josh/Documents/Web Projects/Vue/Ship It`  
**Branch:** `visual/drinkit-home-v1`  
**M2-P1 checkpoint:** `6a43c84`  
**Feature HEAD working tree:** uncommitted Other Drinks changes  
**Database:** disposable `:55321` / `star-princess-disposable-mo`  
**Protected:** organizer `:54321` and Agent 2 `:56321` unchanged  

## Commands

```bash
npx vitest run tests/unit/otherDrinks.spec.ts \
  tests/unit/organizerExceptionRetention.spec.ts \
  tests/unit/organizerAuthorizedExceptions.spec.ts \
  tests/unit/m2.unpricedMenuPricePolicy.spec.ts
node scripts/menu-launch/run-other-drinks-validation.mjs
npx vue-tsc --noEmit
npx vite build
```

## Unit

| Suite | Result |
|---|---|
| `otherDrinks.spec.ts` + retention + authorized exceptions + M2 Category U | **24/24** then reconfirm **21/21** on focused trio+U |

Category U logic untouched; regression green.

## Disposable harness (`run-other-drinks-validation.mjs`)

Evidence: `evidence/other-drinks-validation.json`, `evidence/validation-console.txt`

| Check | Result |
|---|---|
| Tuesday Day 4 active on disposable | PASS |
| Organizer Wrapped/final intact | PASS |
| 16 code-owned options (no Bourbon Shot; spirit-first customs + TN Whiskey / Scotch) | PASS (unit) |
| Other Drinks → no Cocktail/Ingredient eligibility | PASS |
| Submit Tequila Shot ordinary log + concept id, no offering | PASS |
| Idempotent retry | PASS |
| Mobile Order rejects Other Drinks concept attach | PASS |
| UI: Home / Other Drinks row / full list / companions | PASS |
| UI: Mobile Order no Other Drinks; keeps unlisted | PASS |
| Protected stacks unchanged | PASS |

**18/18 PASS** on final run.

## Typecheck / build

| Gate | Result |
|---|---|
| `vue-tsc --noEmit` | PASS (exit 0) |
| `vite build` | PASS (exit 0) |

## Screenshots

| File | Content |
|---|---|
| `screenshots/01-tuesday-drinkit-home-402.png` | Tuesday Drink It! Home (not Wrapped) |
| `screenshots/02-physical-bar-other-drinks-row-402.png` | Menu with Other Drinks last |
| `screenshots/03-other-drinks-list-402.png` | Full 15-option list |
| `screenshots/04-companions-after-other-drinks-402.png` | Companions immediately after selection |
| `screenshots/05-other-drinks-list-360.png` | Narrow viewport |

## February / Category U

- Launch-candidate / February-style exception integrity: unit PASS  
- Category U unit matrix: PASS  
- Full February 125 schedule init was previously proven on disposable in Gate A / M1; this mission re-initialized disposable schedule to 72/39/7/7 for Tuesday preview

## Known fixture gap (non-blocking for Other Drinks review)

Disposable Home Daily Bounty cards may show unavailable / load messaging on this sparse synthetic ledger (`no_public_slot`). Logging wizard + Other Drinks path is the verified organizer review surface.
