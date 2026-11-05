# Development checkpoint

**As of:** 2026-11-05  
**Branch:** `main`  
**Phase:** 3A (atomic Drink It! scoring) — verify then closeout

## Baseline

| Phase | Commit |
|---|---|
| 2D-B2.1 | `9caa2f5` / tip was `e279f57` |
| 3A | _(this push)_ |

## 3A delivered

- `submissions` / `drink_logs` / companions / `bounty_claims` / minimal `gallery_events`
- `preview_drink_claims` + `submit_drink` (+ `dev_*_at` timed helpers)
- Shared eligibility evaluator (Cocktail / Ingredient / Bar; Daily blocked)
- Idempotency, pause/finale, receipt-time, claim uniqueness

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

**Phase 3B** — logging wizard / Review using these RPCs.
