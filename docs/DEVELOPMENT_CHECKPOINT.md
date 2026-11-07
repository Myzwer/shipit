# Agent handoff — Phase 8 complete

**STOP.** Do not begin Phase 9, production population, visual fidelity, or deployment until the Development Director authorizes the next phase.

| | |
|---|---|
| Branch | `main` (clean, synced with `origin/main`) |
| Feature tip | `75bd4d0` — Phase **8** |
| Docs tip | *(this commit)* — checkpoint tip + CI URL |
| HEAD | *(this commit)* |
| CI | green — run [42331834841](https://github.com/Myzwer/shipit/actions/runs/42331834841) |
| Baseline | Phase **7B2** feature `3181eb7` / docs `55c7ae5` / CI `42270765927` |
| Closed phase | Phase **8** — Awards Mode & Cruise Wrapped |
| Local tests (Phase 8 report) | Unit **166** / Integration **348** / E2E Phase 8 **10** |

## Read first (next agent)

1. This file
2. `docs/WRAPPED_AND_AWARDS.md`
3. `docs/SHIP_CLOCK.md` · `docs/ACHIEVEMENTS.md` · `docs/GALLERY.md`
4. `docs/WORKING_ACHIEVEMENT_CATALOG.md` (unchanged: still development-only)
5. Migration `078` `phase8_wrapped_awards`
6. Frontend: `src/features/wrapped/`, `src/stores/awardsMode.ts`, Awards Mode nav in `FloatingBottomNav.vue`

## Just shipped (Phase 8)

1. Automatic Friday 6 PM Awards Mode (reuse `finale_at_utc` / `ensure_finale_latched`; lifecycle helpers aligned to that cutoff)
2. Three-tab nav: Wrapped · Gallery · Achievements; Wrapped is Home
3. One-time Wrapped Start (`wrapped_reveals` per player × game — not team-wide)
4. Canonical Drink It! / Ship It! Wrapped stats + TEST/PROVISIONAL group awards
5. Final leaderboards with shared ranks **1, 1, 3**; Drink It! Home uses live standings RPC
6. Achievement finale reveal (existing contract) + Gallery reactions remain open
7. Mid-form cutoff → “View Wrapped”; no silent discard
8. Seven-day simulation via timed RPCs (`tests/integration/wrapped.phase8.test.ts`) + Playwright e2e

Migrations: `078` `phase8_wrapped_awards`  
Screenshots: `docs/phase8-screenshots/`

## Local bring-up (Wrapped)

```bash
npx supabase db reset
LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run db:seed-bounty-now
# optional achievements: npm run db:load-working-achievements
# Advance Ship Clock to Day 7 6 PM via Admin (or test timed RPCs)
npm run dev
LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase8
```

## Remaining creative Wrapped content

Organizer still owes final humorous award titles, quips, personal named-result jokes, and whether any zero-stat awards are intentionally meaningful. Seeded `[TEST]` / `[PROVISIONAL]` definitions are for layout validation only.

## Out of scope until authorized

- Final humorous Wrapped award / quip catalog
- Production achievement population (`test_only = false`)
- Unresolved D-082 / D-083 / D-085
- Real companion UUID maps
- Visual fidelity mockup pass
- Vercel / Supabase production deployment
- Cruise-date activation

## Do not do next without a new brief

Do **not** invent final creative Wrapped awards.  
Do **not** publish the working achievement catalog to production.  
Do **not** start deployment or Phase 9.
