# Gallery (Phase 5A)

Game-specific chronological activity feed with reactions, photo viewer, and unread dots.

## Scope

| Game | Filters | Post kinds |
|---|---|---|
| Drink It! | Everyone / My Gallery | `drink_log`, `daily` (+ future achievements) |
| Ship It! | Everyone / My Team | `scavenger` (+ future achievements) |

No cross-game feed. No bounty-claim spoiler announcements. Achievement cards are supported by schema but not fabricated until the achievements phase.

## Secure read contract

`list_gallery_feed(p_game, p_filter, p_limit, p_before_created_at, p_before_id)`

- Membership derived server-side (`has_game`)
- Keyset cursor: `(created_at_utc DESC, id DESC)` — page size ~5
- Returns immutable `display` snapshots, caption, bound `photo_id`, reaction counts, `my_reaction`
- Inactive / non-accepted submissions excluded

## Reactions

`set_gallery_reaction(p_event_id, p_emoji)`

- Emojis: `heart` ❤️ · `laugh` 😂 · `hang_loose` 🤙
- One per player per event; tap toggles / replaces
- No scoring impact; no unread dots; allowed after finale

## Photos

- Bound photos readable by **same-game members** (Everyone visibility)
- Storage policies + signed URL RPCs enforce access (not Vue-only)
- Staged / abandoned / fixture / cross-game remain private
- Square thumbs are presentation crops; viewer shows uncropped optimized original + Download

## Unread dots

`get_gallery_unread` / `mark_gallery_seen`

- Dot = activity from **another player** newer than last delivered Everyone cursor
- Own posts and reactions never set the dot
- Loading **Everyone** successfully marks the newest delivered event (not `now()`)
- My Gallery / My Team does not clear Everyone unread
- Drink It! and Ship It! cursors are independent
- Failed reads must not advance the cursor

## Freshness

While Gallery is visible: poll ~25s, revalidate on foreground, pause when tab hidden, no overlapping requests. “N New Posts” pill when scrolled; tap loads and returns to top.

## Local verify

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run test:integration
npm run db:seed-bounty-now
npm run test:e2e:phase5a
```
