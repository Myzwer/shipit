# Development checkpoint / agent handoff

**As of:** 2026-11-05  
**Branch:** `main`  
**Tip:** Phase **4B1** — shared photo capture + private staging (see git log after merge)  
**Prior tip:** `ae17767` / feature `719534f` — Phase **4A** accepted  
**Do not start Phase 4B2 (photo-required scoring / Gallery) until the Development Director authorizes it.**

## What just shipped (Phase 4B1)

| Item | Summary |
|---|---|
| Skip gate | Unexposed preallocated offers are `NOT_EXPOSED` — not skippable merely because the window opened (paused-across-opening) |
| Shared UI | `PhotoCapture` — Take Photo (rear `capture`) + Upload Photo; preview / retake / replace / remove |
| Optimize | Client JPEG resize ≤2000px long edge, ~4MB target; EXIF orientation when supported; HEIC best-effort |
| Storage | Private `game-photos` bucket + `photos` ledger; begin → upload → confirm; ownership RLS |
| Drink It! | Photo step uses shared component; optional no-photo log unchanged; staged photo **not** bound to `submit_drink` yet |
| Contracts | Optional drink_log / required daily / required scavenger ready for later submit RPCs |
| Docs | `docs/MEDIA_PIPELINE.md` |

## Stack / how to work here

- Vue 3 + Pinia + Supabase (local Docker). Auth via provisioned demo identities.
- Migrations are ordered under `supabase/migrations/` — **never edit applied ones**; add a new file.
- Photo staging: `begin_photo_upload` → Storage → `confirm_photo_upload`; future submits use `verify_staged_photo_for_submit`.
- Scoring/logging authority remains server-side RPCs.
- Product override: **HONOR > ADDED FRICTION**.

Key docs: `docs/MEDIA_PIPELINE.md`, `docs/SHIPIT_CHALLENGES.md`, `docs/DRINKIT_SCORING.md`, `docs/DRINKIT_LOGGING.md`, `docs/BOUNTY_SCHEDULING.md`, `docs/HOME_BOUNTIES.md`, `docs/SHIP_CLOCK.md`, `handoff/01–04`.

## Verified at tip

- Unit **105**, integration **221**, E2E phase4b1 **15/15** (plus phase3b 8/8, phase4a 12/12)
- lint / typecheck / build pass
- CI: update after push

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test && npm run test:integration
npm run db:seed-bounty-now
npm run db:seed-skip-reserves
npm run test:e2e:phase3b && npm run test:e2e:phase3ca && npm run test:e2e:phase3cb
npm run test:e2e:phase4a && npm run test:e2e:phase4b1
npm run build
```

## Explicitly out of scope until authorized

- **Phase 4B2+:** `submit_scavenger` / `submit_daily` scoring; bind photo on `submit_drink`
- Full Gallery browsing / reactions
- Achievement evaluation; photo moderation
- Production deployment; full visual fidelity pass

## Next agent: start here when Director says 4B2

1. Wire `verify_staged_photo_for_submit` into submit RPCs; bind `photos.status=bound`.
2. Atomic `submit_scavenger` (request UUID, team-once, finale gate).
3. Daily Challenge Claim It with required photo.
4. Optional: attach staged photo on ordinary `submit_drink`.
5. Abandoned staging TTL cleanup job (never delete bound).

## Pitfalls worth knowing

- Skip of unexposed preallocated = `NOT_EXPOSED` (migration `20261105003200_…`).
- Player-provided storage path is **not** proof — confirm + verify require a real object.
- Development fixtures use `development-only/fixture-photo` — rejected as player evidence.
- HEIC / rear-camera behavior needs real-device confirmation; Playwright file injection is not a camera proof.
- Unlisted Ingredient honor is **per-submission only**.
