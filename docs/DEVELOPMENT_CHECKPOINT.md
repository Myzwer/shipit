# Development checkpoint / agent handoff

**As of:** 2026-11-05  
**Branch:** `main`  
**Tip:** `ddb402d` — Phase **4B3** Drink It! Daily Challenge submissions  
**CI:** https://github.com/Myzwer/shipit/actions/runs/42148610261 — success  
**Prior tip:** `07c48fc` / feature `15893e3` — Phase **4B2** functionally approved  
**Do not start the next phase until the Development Director authorizes it.**

## What just shipped (Phase 4B3)

| Item | Summary |
|---|---|
| Gate A | Pending scavenger recovery precedes already-completed UI; foreign pending auto-reconciled |
| Gate B | Bound Ship It! Storage reads require `has_game('shipit')` via security-definer helper |
| `submit_daily` | Atomic Daily claim + required `daily` photo bind; fixed 50 points; pause/finale gated |
| UI | Home Claim It → confirm → PhotoCapture → review → gallery stub |
| Home | Active Daily Claim It enabled; `already_claimed` CLAIMED presentation |

## Stack / how to work here

- Vue 3 + Pinia + Supabase (local Docker).
- Migrations under `supabase/migrations/` — **never edit applied ones**.
- Photo: begin → Storage → confirm → bind on submit (`daily` / `scavenger`).
- Product: **HONOR > ADDED FRICTION**.

Key docs: `docs/MEDIA_PIPELINE.md`, `docs/DRINKIT_SCORING.md`, `docs/SHIPIT_CHALLENGES.md`, `handoff/01–04`.

## Verified at tip

Local + CI: lint ✅ · typecheck ✅ · unit **110** · integration **234** / 26 files · E2E recovery **6/6** · E2E daily **7/7** · build ✅ · Actions **success**

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test && npm run test:integration
npm run db:seed-bounty-now
npm run test:e2e:phase4b2 && npm run test:e2e:phase4b3:recovery && npm run test:e2e:phase4b3
npm run build
```

## Explicitly out of scope until authorized

- Optional photo binding for ordinary drink logs
- Full Gallery / reactions / achievements
- Admin Void; production Daily content; media sweeper; deployment

## Next agent: start here when Director says next phase

1. Optional `submit_drink` photo attach  
2. Full Gallery browse/pagination/reactions  
3. Achievements  
4. Abandoned staging TTL sweeper (never delete bound)

## Pitfalls

- Bound photos use `ON DELETE RESTRICT`; local `dev_seed_cruise_clock` clears them before cruise cascade.
- Storage teammate policy must use a security-definer helper — direct EXISTS against `photos` fails RLS.
- Local fixtures: `both` and `ship_only` share a team; `drink_only` must not keep a leftover team row after privacy tests.
- Playwright file injection ≠ real rear camera.
