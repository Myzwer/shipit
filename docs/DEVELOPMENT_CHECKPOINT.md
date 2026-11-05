# Development checkpoint

**As of:** 2026-11-05  
**Branch:** `main`  
**Phase:** 3B (functional Drink It! logging wizard) — verify then stop

## Baseline

| Phase | Commit |
|---|---|
| 3A | `551284e` |
| 3A.1 | `a7ac2a0` (checkpoint tip was `7703db3`) |
| 3B | `5eb4123` |

## 3B delivered

- Five-step wizard: Bar → Drink → Friends → Photo → Review
- Plus + Cocktail / Ingredient / Bar Claim It entry (Daily still disabled)
- Player-safe RPCs: `list_drinkit_bars`, `list_drinkit_bar_drinks`, `list_drinkit_companions`, `drinkit_bar_bounty_reminder`, `get_my_drink_submission`
- Single Friends selector; `bar_eligible_companion_ids` auto-filled; optional Bar reminder
- Photo step: caption only; upload deferred (Phase 5)
- `preview_drink_claims` / `submit_drink` wired with idempotent Retry
- Minimal Gallery stub after success

## Deliberately deferred

3C ingredient corrections, Admin Skip, Daily Claim It, full photo pipeline, full Gallery/reactions, Achievements, visual polish.

## Verify

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test
npm run test:integration
npm run db:seed-bounty-now && npm run test:e2e:phase3b
npm run build
```

## Next (when authorized)

**Phase 3C** — ingredient confirmation / correction persistence.
