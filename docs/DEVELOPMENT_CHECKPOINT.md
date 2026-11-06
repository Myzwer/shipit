# Development checkpoint / agent handoff

**As of:** 2026-11-05  
**Branch:** `main`  
**Tip:** `15893e3` — Phase **4B2** Ship It! photo submissions  
**CI:** https://github.com/Myzwer/shipit/actions/runs/42145564124 — success  
**Prior tip:** `83163af` / feature `4423b22` — Phase **4B1** accepted  
**Do not start Phase 4B3 / Daily / full Gallery until the Development Director authorizes it.**

## What just shipped (Phase 4B2)

| Item | Summary |
|---|---|
| Gate A | Abandon marks ledger only; Storage API deletes; staged not deletable; bound immutable |
| Gate B | Idempotent begin request id; pending emitted immediately; lost confirm reconcile |
| `submit_scavenger` | Atomic team-once completion + photo bind + gallery event; pause-safe; finale-gated |
| UI | Challenge → required PhotoCapture → review → gallery stub; pending UUID recovery |
| Reads | `submission_ready` unlocked; teammate signed photo path for stub |

## Stack / how to work here

- Vue 3 + Pinia + Supabase (local Docker).
- Migrations under `supabase/migrations/` — **never edit applied ones**.
- Photo: begin → Storage → confirm → (scavenger) submit binds.
- Product: **HONOR > ADDED FRICTION**.

Key docs: `docs/MEDIA_PIPELINE.md`, `docs/SHIPIT_CHALLENGES.md`, `docs/DRINKIT_SCORING.md`, `handoff/01–04`.

## Verified at tip

Local + CI: lint ✅ · typecheck ✅ · unit **110** · integration **230** / 24 files · E2E 4B2 **10/10** · build ✅ · Actions **success**  
`dev_seed_cruise_clock` clears scavenger/bound photos + local ingredient_corrections before cruise cascade.

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test && npm run test:integration
npm run db:seed-bounty-now
npm run test:e2e:phase4b1 && npm run test:e2e:phase4b2
npm run build
```

## Explicitly out of scope until authorized

- Drink It! Daily Challenge submission / optional drink photo bind
- Full Gallery / reactions / achievements
- Admin Void; production challenge content; media sweeper; deployment

## Next agent: start here when Director says 4B3 / Daily / Gallery

1. Daily required-photo submit RPC + Claim It UI  
2. Optional `submit_drink` photo attach  
3. Gallery browse/pagination/reactions  
4. Abandoned staging TTL sweeper (never delete bound)

## Pitfalls

- Bound photos use `ON DELETE RESTRICT`; local `dev_seed_cruise_clock` clears them (and scavenger rows) before deleting the development cruise.
- Local fixtures: `both` and `ship_only` share a team; use `admin` for a second Ship It! team.
- Playwright file injection ≠ real rear camera.
