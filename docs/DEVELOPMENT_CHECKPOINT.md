# Development checkpoint

**As of:** 2026-11-05  
**Branch:** `main`  
**Phase:** 3A.1 (scoring correctness closeout) — verify then stop

## Baseline

| Phase | Commit |
|---|---|
| 2D-B2.1 | `9caa2f5` / tip was `e279f57` |
| 3A | `551284e` (checkpoint tip was `7ebe14b`) |
| 3A.1 | *(pending commit)* |

## 3A.1 delivered

- Idempotent replay returns saved result **before** eligibility / pause / finale revalidation
- Deterministic request fingerprint (client payload only; no live game state)
- `bar_eligible_companion_ids` honor-system subset for Bar multiplier (presence companions unchanged for Cocktail/Ingredient)
- `drink_log_companions.bar_multiplier_eligible` audit flag

## Deliberately deferred

Wizard UI, Claim It enablement, Daily photo submit, ingredient correction persistence, Admin Skip, Gallery UI, Achievements, Ship It! scavenger.

## Verify

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test
npm run test:integration
npm run build
```

## Next (when authorized)

**Phase 3B** — logging wizard / Review using these RPCs (`companion_player_ids` + `bar_eligible_companion_ids` on Friends).
