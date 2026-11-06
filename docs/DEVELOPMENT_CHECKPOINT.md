# Agent handoff — Phase 6B1 complete

**STOP.** Do not start Phase 6B2, achievements, or production catalog publish until the Development Director authorizes it.

| | |
|---|---|
| Branch | `main` |
| Baseline feature | `cf60a43` — Phase **6A** |
| Baseline checkpoint | `2d77dca` |
| Baseline docs tip | `ed935d4` |
| This phase | Phase **6B1** — Auth reservation + Admin Add Drink + Export |

## Just shipped (6B1)

1. **Auth concurrency gate** — durable `in_progress` reservation in `admin_roster_auth_requests` before Auth Admin side effects; one owner; mismatch reject; complete cannot overwrite conflicting fingerprint; lease reclaim; v1 replay preserved; passwords never ledgered; unknown reset stays explicit
2. **Admin Add Drink overlay** — multi-bar named alcoholic drink + ingredients; stable concept/offering ids; never Cocktail rotation; deactivate future-only; audit/registry tables
3. **Admin UI** — Add Drink section (preview/save/remove) + Export Current Game Data download on `/admin`
4. **Export contract** — `admin_export_current_game_data` schema `1.0` (catalog, overlays, exposure/slots; no roster/secrets/photos)
5. **6B2 import compatibility** documented only (no publish/rollback)
6. **Menu source inventory** — `Star_Princess_Bar_Game_Menus(.md|(2).md)` **MISSING**; research dump present at `handoff/data/menus/Star-Princess-Beverage-Source-Unmodified.md`

Migrations: `065` Auth reservation · `066` Add Drink + export. Docs: `ADMIN_ADD_DRINK_AND_EXPORT.md`, updates to `CATALOG.md`, `ADMIN_ROSTER.md`.

## Verified

lint · typecheck · unit **135** · integration **282** / 36 files · E2E 6A **10/10** · E2E 6B1 **13/13** · build · Actions (fill URL after push)

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npx supabase functions serve admin-roster
npm run db:seed-bounty-now
npm run lint && npm run typecheck && npm test && npm run test:integration
npm run test:e2e:phase6a
npm run test:e2e:phase6b1
npm run build
```

## Out of scope until authorized

Full replacement JSON import/publish/rollback (6B2) · Automatic menu-photo interpretation · Automatic novelty/rarity ranking · Live production menu population · Real cruise player accounts · Achievements / Awards Mode · Production deployment · Visual fidelity cleanup

## Pitfalls

- Auth: only `reserved=true` may call Auth Admin; concurrent same UUID must wait/reconcile
- Password reset uncertain ⇒ new `client_request_id` (never claim success from silence)
- Add Drink never writes `cocktail_candidates`
- Export notes must not be mistaken for secrets scanners matching the word “password”
- Missing researched menu Markdown blocks Saturday production catalog prep — request original file
- Team reassignment after Ship It! history remains `TEAM_HISTORY_LOCKED`
