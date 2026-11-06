# Development checkpoint / agent handoff

**As of:** 2026-11-05  
**Branch:** `main`  
**Tip:** `026adc4` — Phase **5C** feature  
**CI:** https://github.com/Myzwer/shipit/actions/runs/42162758510 — success  
**Prior tip:** `af7b775` / checkpoint `75ca67b` — Phase **5B** accepted (CI `42158690935`)  
**Do not start the next phase until the Development Director authorizes it.**

## What just shipped (Phase 5C)

| Item | Summary |
|---|---|
| Void fingerprint v2 | Reason in request identity; legacy v1 replay when stored reason matches |
| Correction provenance | `ingredient_correction_sources`; void keeps overlay if other valid support remains |
| Admin suppress vs auto | `inactive_cause` `admin` never auto-reactivates; `no_valid_sources` may |
| Photo cleanup runner | Service-role claim/complete/fail + `ops:photo-cleanup` (TTL 72h); schedule at deploy |

## Stack / how to work here

- Vue 3 + Pinia + Supabase (local Docker).
- Migrations under `supabase/migrations/` — **never edit applied ones**.
- Gallery: `docs/GALLERY.md`. Scoring: `docs/DRINKIT_SCORING.md`. Media: `docs/MEDIA_PIPELINE.md`.

## Verified at tip

Local + CI: lint ✅ · typecheck ✅ · unit **117** · integration **266** / 32 files · E2E 5A **10/10** · E2E 5B **6/6** · build ✅ · Actions **success**

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test && npm run test:integration
npm run db:seed-bounty-now && npm run test:e2e:phase5a && npm run test:e2e:phase5b
npm run build
# Optional local sweeper smoke (service role):
# PHOTO_CLEANUP_TTL_HOURS=72 npm run ops:photo-cleanup
```

## Explicitly out of scope until authorized

- Achievement catalog / unlocks / Gallery award cards / achievement unread
- Awards Mode / Wrapped; deployment; visual polish
- Account/roster management; Admin Add Drink; Catalog Publish/Rollback
- Production cron credentials for photo cleanup (runner exists; schedule not claimed)

## Next agent: start here when Director says next phase

1. Achievements engine + Gallery announcements + achievement unread  
   — **must complete `achievement_on_void_submission` before launch**
2. Configure production schedule for `ops:photo-cleanup` when deploying

## Pitfalls

- Historical Gallery time uses offset-at-event-UTC; do not use `toLocaleTimeString` labeled as Ship Time.
- Near-top refresh must merge, not replace, loaded pages.
- Void is soft-state only; never hard-delete submissions/photos.
- Previously issued signed URLs may live until expiry after void.
- Ingredient corrections: multi-source provenance; Admin `inactive_cause=admin` is permanent suppression.
- Daily submission kind is `daily_completion` (not `daily`).
- Photo cleanup never deletes bound/voided-bound/staged; Storage API only.
