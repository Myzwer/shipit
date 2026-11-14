# Phase V6 — Gallery Companion Attribution

## Inspection

Companions are selected in the Drink It! logging wizard and stored on accept in `drink_log_companions` (player UUIDs). `display_snapshot_json.companions` also stores those UUIDs — **not** display names.

`list_gallery_feed` previously returned no companion identities/names. The Gallery must not resolve UUIDs client-side or invent companions from co-located posts / Bar Bounty crew.

## Contract change (minimal)

`list_gallery_feed` events now include:

```json
"companion_names": ["Aaron", "Cindy", "David F."]
```

- Drink-log only; other kinds return `[]`
- Resolved server-side from `drink_log_companions` → `players.display_name`
- Author excluded; blanks / unresolved names skipped; alphabetical by display name
- Display names only — no player IDs in this field

Migration: `supabase/migrations/20261105010200_phase_v6_gallery_companion_names.sql`

## UI

On ordinary Drink It! `drink_log` posts, below the author byline and above the caption:

> 👥 With Aaron, Cindy, and David F.

Omitted entirely when `companion_names` is empty. Not shown on achievements, dailies, or Ship It! posts.

## QA

| Case | Result |
|---|---|
| No companions | Line omitted (`after-solo-402.png`) |
| One companion | `With Aaron` |
| Three companions | `With Aaron, Cindy, and David F.` |
| Long list | Wraps; David B. / David F. preserved; no horizontal overflow |
| Older / empty companion data | Line omitted |
| My Gallery + Everyone | Attribution present at 360 / 402 / 430 |
| Ship It! Gallery | 0 companion lines |
| Achievement posts | 0 companion lines |
| Reactions | Remain attached to the correct post |

Unit: `formatCompanionNames.spec.ts`  
Integration: `gallery.phase5a.feed.test.ts` — companion_names from recorded companions only

## Screenshots

- `before/mine-top-402.png` — companions visually suppressed for comparison
- `after-solo-402.png` / `after-one-402.png` / `after-three-402.png` / `after-long-402.png`
- `mine-top-{360,402,430}.png` / `everyone-top-{360,402,430}.png`
- `shipit-preserved-402.png`
