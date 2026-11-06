# Development checkpoint / agent handoff

**As of:** 2026-11-05  
**Branch:** `main`  
**Tip:** `fdcbc54` — Phase **4B4** tip (feature `d04a5a2`)  
**CI:** https://github.com/Myzwer/shipit/actions/runs/42151537566 — success  
**Prior tip:** `ddb402d` / checkpoint `0a9c6f8` — Phase **4B3** accepted  
**Do not start the next phase until the Development Director authorizes it.**

## What just shipped (Phase 4B4)

| Item | Summary |
|---|---|
| Gate | Daily pending recovery independent of today's assignment (pause / close / next day) |
| `submit_drink` | Optional nullable `photo_id`; atomic bind with claims + ingredient corrections |
| Compatibility | Legacy no-photo fingerprints unchanged; `photo_storage_key` forged paths rejected |
| Wizard | PhotoCapture optional step; Review preview; Gallery stub signed photo |
| Tests | Integration photo suite + Daily recovery / drink-photo E2E |

## Stack / how to work here

- Vue 3 + Pinia + Supabase (local Docker).
- Migrations under `supabase/migrations/` — **never edit applied ones**.
- Photo: begin → Storage → confirm → bind on submit (`drink_log` / `daily` / `scavenger`).
- Product: **HONOR > ADDED FRICTION**.

Key docs: `docs/MEDIA_PIPELINE.md`, `docs/DRINKIT_LOGGING.md`, `docs/DRINKIT_SCORING.md`, `handoff/01–04`.

## Verified at tip

Local + CI: lint ✅ · typecheck ✅ · unit **114** · integration **247** / 27 files · E2E daily recovery **9/9** · E2E drink photo **11/11** · build ✅ · Actions **success**

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test && npm run test:integration
npm run db:seed-bounty-now
npm run test:e2e:phase4b4:daily-recovery && npm run test:e2e:phase4b4
npm run build
```

## Explicitly out of scope until authorized

- Full Gallery / reactions / achievements
- Admin Void; production Daily content; media sweeper; deployment

## Next agent: start here when Director says next phase

1. Full Gallery browse/pagination/reactions  
2. Achievements  
3. Abandoned staging TTL sweeper (never delete bound)

## Pitfalls

- Bound photos use `ON DELETE RESTRICT`; local `dev_seed_cruise_clock` clears them before cruise cascade.
- Omit `photo_id` on no-photo submits so pre-4B4 request hashes still match.
- Unknown pending locks photo edits — never silently drop `photo_id` while reusing the UUID.
- Storage teammate policy must use a security-definer helper — direct EXISTS against `photos` fails RLS.
- Playwright file injection ≠ real rear camera.
