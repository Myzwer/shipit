# Development checkpoint

**As of:** 2026-11-05  
**Branch:** `main`  
**Phase:** 3C-B (Admin Skip Current Cocktail / Ingredient) — verify then stop

## Baseline

| Phase | Commit |
|---|---|
| 3A.1 | `a7ac2a0` |
| 3B | `5eb4123` / `0d4ac17` |
| 3C-A | `9df56c3` |
| 3C-B | *(this tip — see git log)* |

## 3C-B delivered

- Gate: deactivated `ingredient_corrections` never silently reactivate
- Admin Skip RPCs + unused-reserve counts + request-id ledger
- Admin UI: Skip Cocktail / Ingredient with confirm + pending recovery
- Timed `dev_admin_skip_bounty_at` + 80/45 reserve seed helper

## Deliberately deferred

Daily Claim It (Phase 4), Admin Add Drink, photo/Gallery, Achievements, Publish/Rollback, visual polish.

## Verify

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test
npm run test:integration
npm run db:seed-bounty-now
npx vite-node scripts/seed-skip-reserves.ts
npm run test:e2e:phase3b && npm run test:e2e:phase3ca && npm run test:e2e:phase3cb
npm run build
```

## Next (when authorized)

**Phase 4** — Daily Challenge Claim It.
