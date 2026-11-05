# Development checkpoint

**As of:** 2026-11-05  
**Branch:** `main`  
**Phase:** 2D-B1 complete (pending Director review of this commit)

## Baseline before 2D-B1

- Commit `b1f0d92` — Phase 2D-A closeout (player time lockdown); CI green

## Phase 2D-B1 delivered

Drink It! Home Cocktail + Ingredient cards use:

- `get_my_current_cocktail_bounty()`
- `get_my_current_ingredient_bounty()`
- `get_ship_clock_state()`

Four-card carousel preserved. Bar/Daily remain shells. Claim It disabled. Docs: `docs/HOME_BOUNTIES.md`.

## Security rule (do not regress)

No production-facing **authenticated** RPC may honor caller-controlled authoritative time (`p_at_utc`).

## Verify

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test
npm run test:integration
npm run test:bounty
npm run db:seed-bounty-now
npm run test:e2e:phase2db1   # Vite running
npm run build
```

## Next (when authorized)

**Phase 2D-B2** — Bar + Daily Challenge Home wiring. Still out: scoring/claims, Admin Skip, Publish/Rollback, galleries, Ship It! challenges, Phase 3 wizard.
