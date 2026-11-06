# Development checkpoint / agent handoff

**As of:** 2026-11-05  
**Branch:** `main`  
**Tip:** *(pending Phase 5B commit)*  
**Prior tip:** `87b30af` / feature `a7e4713` — Phase **5A** accepted (CI `42155679792`)  
**Do not start the next phase until the Development Director authorizes it.**

## What just shipped (Phase 5B)

| Item | Summary |
|---|---|
| Gallery Ship Time | Server `created_ship_local` via historical `clock_offset_at` (not device local) |
| Feed races | Merge prepend; generation-scoped filter; undercount-safe New Posts pill |
| Admin Void | Soft-void schema + preview + idempotent `admin_void_submission` before Fri 6 PM |
| Scoring reverse | Drink claims / Daily 50 / Ship completions; reopen eligibility |
| Privacy | Voided Gallery + bound photo denied to members; audit retained |
| Achievements | Integration boundary stub only — catalog not invented |

## Stack / how to work here

- Vue 3 + Pinia + Supabase (local Docker).
- Migrations under `supabase/migrations/` — **never edit applied ones**.
- Gallery: `docs/GALLERY.md`. Scoring: `docs/DRINKIT_SCORING.md`, `docs/SHIPIT_CHALLENGES.md`.

## Verified at tip

*(fill after local + CI)*

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test && npm run test:integration
npm run db:seed-bounty-now && npm run test:e2e:phase5a && npm run test:e2e:phase5b
npm run build
```

## Explicitly out of scope until authorized

- Achievement catalog / unlocks / Gallery award cards / achievement unread
- Awards Mode / Wrapped; media sweeper; deployment; visual polish
- Account/roster management; Admin Add Drink; Catalog Publish/Rollback

## Next agent: start here when Director says next phase

1. Achievements engine + Gallery announcements + achievement unread  
   — **must complete `achievement_on_void_submission` before launch**
2. Abandoned staging TTL sweeper (never delete bound)

## Pitfalls

- Historical Gallery time uses offset-at-event-UTC; do not use `toLocaleTimeString` labeled as Ship Time.
- Near-top refresh must merge, not replace, loaded pages.
- Void is soft-state only; never hard-delete submissions/photos.
- Previously issued signed URLs may live until expiry after void.
- Ingredient corrections have a single `source_submission_id` (document limitation).
