# Phase S6B — Gallery Reaction Bug

## Root cause

Organizer iPhone Safari (`localhost:5173`) at 2026-11-11 04:03:28Z:

- `POST /rpc/set_gallery_reaction` → **401** / Postgres `NOT_AUTHENTICATED`
- `list_gallery_feed` polls also → **401**
- `get_ship_clock_state` still → **200** (JWT role `authenticated`, no player lookup)

`gallery_require_game` → `current_player_id()` returned null: valid JWT whose `auth.uid()` no longer maps to an active `players` row (typical after local demo seed/reset while the SPA still shows a cached Gallery feed).

Not an RLS weakening issue; not a Ship-It-specific reaction RPC bug. Authenticated players with a linked profile save reactions successfully.

## Fixes

1. **Layout** — reaction error copy moved beneath `.gallery-react-row` (pills stay equal width: 118→118 on failure).
2. **Auth recovery** — `NOT_AUTHENTICATED` / 401 on reaction or gallery feed forces sign-out → `/login?reason=expired`.
3. Guard empty `eventId` in `setGalleryReaction`.

## Screenshots

- `s6b-reaction-error-layout.png` — failure copy under intact three-column pills
- `s6b-shipit-reactions-ok.png` — selected Heart persisted
- `s6b-shipit-gallery-402.png` / `s6b-shipit-top-360.png` / `s6b-shipit-top-430.png`
- `s6b-shipit-achievement.png` — catalog icon + reactions
- `s6b-drinkit-gallery-402.png` — Drink It! regression check
