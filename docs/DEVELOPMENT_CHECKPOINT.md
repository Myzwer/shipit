# Development checkpoint / agent handoff

**As of:** 2026-11-05  
**Branch:** `main`  
**Tip:** `ad69c8d` — Phase **5A** tip (feature `a7e4713`)  
**CI:** https://github.com/Myzwer/shipit/actions/runs/42155679792 — success  
**Prior tip:** `eb0b788` / feature `d04a5a2` — Phase **4B4** accepted  
**Do not start the next phase until the Development Director authorizes it.**

## What just shipped (Phase 5A)

| Item | Summary |
|---|---|
| Feed | Game-scoped keyset Gallery (`list_gallery_feed`) — Everyone / My Gallery / My Team |
| Photos | Same-game bound photo access + full viewer / download |
| Reactions | ❤️ 😂 🤙 one per player; optimistic UI |
| Freshness | ~25s poll, New Posts pill, no scroll jump |
| Unread | Delivered-event cursors; Everyone clears; games independent |

## Stack / how to work here

- Vue 3 + Pinia + Supabase (local Docker).
- Migrations under `supabase/migrations/` — **never edit applied ones**.
- Gallery docs: `docs/GALLERY.md`, `docs/MEDIA_PIPELINE.md`.

## Verified at tip

Local + CI: lint ✅ · typecheck ✅ · unit **115** · integration **253** / 28 files · E2E gallery **10/10** · build ✅ · Actions **success**

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test && npm run test:integration
npm run db:seed-bounty-now && npm run test:e2e:phase5a
npm run build
```

## Explicitly out of scope until authorized

- Achievement definitions / unlocks / Gallery award cards / achievement unread
- Admin Void; Awards Mode / Wrapped; media sweeper; deployment; visual polish

## Next agent: start here when Director says next phase

1. Achievements engine + Gallery announcements + achievement unread  
2. Abandoned staging TTL sweeper (never delete bound)  
3. Admin Void

## Pitfalls

- Bound photos: same-game members may read (Everyone visibility); staged remain private.
- Mark Gallery seen only after a successful Everyone load, using the delivered newest event — never `now()`.
- My Gallery / My Team must not clear Everyone unread.
- Storage helpers must stay security-definer (RLS on `photos` breaks direct EXISTS).
