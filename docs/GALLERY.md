# Gallery (Phase 5B)

Game-specific chronological activity feed with reactions, photo viewer, unread dots, historical Ship Time, and void-aware privacy.

## Scope

| Game | Filters | Post kinds |
|---|---|---|
| Drink It! | Everyone / My Gallery | `drink_log`, `daily`, `achievement` |
| Ship It! | Everyone / My Team | `scavenger`, `achievement` |

No cross-game feed. No bounty-claim spoiler announcements. Achievement cards are compact announcements for earned awards (secret titles masked pre-finale). See [`docs/ACHIEVEMENTS.md`](./ACHIEVEMENTS.md).

## Secure read contract

`list_gallery_feed(p_game, p_filter, p_limit, p_before_created_at, p_before_id)`

- Membership derived server-side (`has_game`)
- Keyset cursor: `(created_at_utc DESC, id DESC)` — page size ~5
- Returns immutable `display` snapshots, caption, bound `photo_id`, reaction counts, `my_reaction`
- **`created_ship_local`**: ship-local wall time from `clock_offset_at` at the event’s absolute UTC (not the visitor’s device timezone). Later clock corrections with a later effective time do not rewrite older labels.
- Inactive / non-accepted / voided submissions excluded

## Freshness / pagination (Phase 5B)

- Poll ~25s while visible; pause when hidden; no overlapping in-flight loads
- Near-top refresh **merges** new posts into already-loaded pages (no dropping older pages)
- Filter changes bump a request generation so stale responses cannot overwrite a newer selection
- Scrolled “New Posts” pill: exact count when the prior top is found in the polled page; otherwise **“New Posts”** (never an undercounted exact burst)
- Failed refresh preserves existing content

## Reactions

`set_gallery_reaction(p_event_id, p_emoji)`

- Emojis: `heart` ❤️ · `laugh` 😂 · `hang_loose` 🤙
- One per player per event; tap toggles / replaces
- Inactive / voided events reject mutation; counts are not public once suppressed

## Photos after void

- Bound photos remain on disk for audit
- Same-game signed URL + Storage read require **accepted** submission **and** **active** gallery event
- Knowing a storage path is not enough after void
- **Limitation:** previously issued short-lived signed URLs may remain usable until expiry (no immediate CDN revoke)

## Unread dots

`get_gallery_unread` / `mark_gallery_seen`

- Only active events with accepted submissions
- Voided activity does not create or retain unread

## Admin Void (see also scoring docs)

Organizer soft-void before Friday 6 PM Ship Time suppresses Gallery rows (`active=false`) without deleting history. See `docs/DRINKIT_SCORING.md` and `docs/SHIPIT_CHALLENGES.md`.

## Local verify

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run test:integration
npm run db:seed-bounty-now
npm run test:e2e:phase5a
npm run test:e2e:phase5b
```
