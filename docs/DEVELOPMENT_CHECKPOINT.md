# Development checkpoint

**As of:** 2026-11-05  
**Branch:** `main`  
**Phase:** 3C-A (submission recovery + ingredient corrections) — verify then stop

## Baseline

| Phase | Commit |
|---|---|
| 3A | `551284e` |
| 3A.1 | `a7ac2a0` (checkpoint tip was `7703db3`) |
| 3B | `5eb4123` / provisionally accepted at `0d4ac17` |
| 3C-A | *(this tip — see git log)* |

## 3C-A delivered

- Pending submit recovery via `localStorage` (`pendingDrinkSubmit`) scoped to player
- Review Yes/No ingredient mismatch → atomic `ingredient_corrections` on Ingredient award
- Unlisted honor Ingredient + featured Cocktail at designated bar
- Admin-ready `admin_deactivate_ingredient_correction` (audited; UI deferred)
- Catalog snapshot replacement review notes in `docs/CATALOG.md`

## Deliberately deferred

Admin Skip (3C-B), Daily Claim It, full photo pipeline, full Gallery/reactions, Achievements, visual polish.

## Verify

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test
npm run test:integration
npm run db:seed-bounty-now && npm run test:e2e:phase3b && npm run test:e2e:phase3ca
npm run build
```

## Next (when authorized)

**Phase 3C-B** — Admin Skip Current Cocktail / Ingredient.
