# Development checkpoint / agent handoff

**As of:** 2026-11-05  
**Branch:** `main` (Phase 4A ready for Director verification)  
**Prior tip:** `b5aeb22` — Phase **3C-B** accepted  
**Do not start Phase 4B / photo submissions until the Development Director authorizes them.**

## What just shipped (Phase 4A)

| Item | Summary |
|---|---|
| Skip gate | Concurrent same-UUID Admin Skip now returns the original durable result; paused preallocated current-slot skip verified |
| Challenges | 50 development-only scavenger tasks (5×10, 100–500), stable IDs, photo-required flag |
| Ledger | `scavenger_completions` team-once uniqueness + snapshots; service-role fixtures only |
| Reads | `get_my_shipit_home`, `get_my_shipit_challenges` — membership-derived team; Drink It!-only denied |
| UI | Ship It! Home live progress/leaderboard; Challenges list + category filter; no pretend complete |

## Stack / how to work here

- Vue 3 + Pinia + Supabase (local Docker). Auth via provisioned demo identities.
- Migrations are ordered under `supabase/migrations/` — **never edit applied ones**; add a new file.
- Scoring/logging authority is server-side RPCs (`preview_drink_claims`, `submit_drink`, admin skip/pause/clock).
- Ship It! reads: `get_my_shipit_home`, `get_my_shipit_challenges`.
- Product override still stands: **HONOR > ADDED FRICTION** (one Friends selector).

Key docs: `docs/SHIPIT_CHALLENGES.md`, `docs/DRINKIT_SCORING.md`, `docs/DRINKIT_LOGGING.md`, `docs/BOUNTY_SCHEDULING.md`, `docs/HOME_BOUNTIES.md`, `docs/SHIP_CLOCK.md`, `handoff/01–04`.

## Verify

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test && npm run test:integration
npm run db:seed-bounty-now
npm run db:seed-skip-reserves   # 80/45 catalog — exact 72/39 has zero Skip reserves
npm run test:e2e:phase3b && npm run test:e2e:phase3ca && npm run test:e2e:phase3cb
npm run test:e2e:phase4a
npm run build
```

## Explicitly out of scope until authorized

- **Phase 4B+:** Ship It! photo-required submit / scoring; Daily Challenge Claim It
- Admin Add Drink UI, catalog Publish/Rollback
- Photos / Storage / full Gallery / reactions
- Achievements, Wrapped, visual polish
- Production challenge content / deployment

## Next agent: start here when Director says photo pipeline / 4B

1. Shared media upload + required-photo validation for Ship It! and Daily.
2. Atomic `submit_scavenger` (request UUID, team-once, finale gate) — no photo-less player path.
3. Wire Challenge card action to real submit; remove Phase 4A unavailable notice.
4. Preserve pause/finale, idempotency, and receipt-time rules from 3A–4A.

## Pitfalls worth knowing

- Skip reserves need **extra** candidates beyond 72/39 (`scripts/seed-skip-reserves.ts`).
- Admin Skip concurrent same UUID is serialized by request-id advisory lock (`20261105002900_…`).
- `scavenger_completions.cruise_config_id` cascades on cruise delete — clear/fixture carefully around `dev_seed_cruise_clock`.
- Development fixtures use `development-only/fixture-photo` — never accept that as a real player photo later.
- Unlisted Ingredient honor is **per-submission only** (no shared offering without `offering_id`).
