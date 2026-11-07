# Agent handoff — Phase 9A complete

**STOP.** Do not begin Phase 9B, production population, or deployment until the Development Director authorizes the next phase.

| | |
|---|---|
| Branch | `main` |
| Feature tip | `4a6ad60` — Phase **9A** |
| Docs tip | `ac0ac14` — tip hashes (CI fill follows) |
| HEAD | `ac0ac14` |
| CI | green — run [42334914169](https://github.com/Myzwer/shipit/actions/runs/42334914169) |
| Baseline | Phase **8** feature `75bd4d0` / docs `9092c63` / CI `42331834841` |
| Closed phase | Phase **9A** — Core Player Visual Fidelity + Wrapped `test_only` guard |
| Local tests (Phase 9A report) | Unit **166** / Integration **350** / E2E login + Drink log + Ship challenges + Awards Mode |

## Read first (next agent)

1. This file
2. `docs/VISUAL_FIDELITY_AUDIT.md`
3. `docs/WRAPPED_AND_AWARDS.md` · `docs/SHIP_CLOCK.md`
4. Migration `079` `phase9a_wrapped_test_only_guard`
5. Theme: `src/styles/theme.css` + shared shell components

## Just shipped (Phase 9A)

1. **Gate 1:** `wrapped_compute_group_awards` filters `test_only` definitions unless `cruise_config.label = 'development-only'` (server-authoritative)
2. Shared shell/token polish: header, floating nav, cards, section bands, leaderboard members ` - `
3. Visual fidelity for Login, Game selection, Drink It! Home, Drink log wizard (incl. Review), Ship It! Home, Challenges
4. Audit + AFTER screenshots under `docs/phase9a-screenshots/`
5. E2E selector updates for current Gallery posts + Ship It! submit-ready challenges

Migrations: `079` `phase9a_wrapped_test_only_guard`  
Screenshots: `docs/phase9a-screenshots/`  
Audit: `docs/VISUAL_FIDELITY_AUDIT.md`

## Local bring-up (visual QA)

```bash
npx supabase db reset
LOCAL_TEST_PASSWORD='…' npm run db:provision
LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now
npm run dev
LOCAL_TEST_PASSWORD='…' npm run screenshots:phase9a
```

## Out of scope until authorized

- Phase **9B** (Wrapped / Achievements / Gallery / Admin visual passes)
- Final humorous Wrapped award / quip catalog
- Production achievement population (`test_only = false`)
- Real companion UUID maps / real cruise dates
- Vercel / Supabase production deployment

## Do not do next without a new brief

Do **not** start Phase 9B visual work.  
Do **not** invent final creative Wrapped awards.  
Do **not** publish the working achievement catalog to production.  
Do **not** start deployment.
