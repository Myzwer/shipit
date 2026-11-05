# Design token notes (Phase 0)

Tokens are defined in `theme.css` under `@theme` and applied via `.theme-drink` / `.theme-ship`.

Approximate mapping from mockups (not a license to invent new screens):

## Drink It!

- Header / nav: deep magenta (`--color-drink-header`, `--color-drink-nav`)
- Primary actions: teal (`--color-drink-primary`)
- Points chips: magenta accent (`--color-drink-accent`)
- Bounty cards: pale aqua surface (`--color-drink-surface`)
- Leaderboard band: light aqua page alt + cream cards

## Ship It!

- Header / nav: gold / ochre (`--color-ship-header`, `--color-ship-nav`)
- Progress / primary: navy blue (`--color-ship-primary`)
- Surfaces: cream / yellow (`--color-ship-surface`, `--color-ship-page`)
- Leaderboard band: pale blue (`--color-ship-page-alt`) with cream cards
- Team member names under team titles: required by `handoff/design/latest-available-updates/01-Ship-It-Home-Team-Leaderboard-Names.png`

## Typography

- Display: Bricolage Grotesque
- Body: Figtree

Loaded from Google Fonts in `index.html` for Phase 0 convenience.
