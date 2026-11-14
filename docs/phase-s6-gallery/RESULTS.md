# Phase S6 — Ship It! Gallery Visual Fidelity

Calibration viewport: **402 × 874** (also 360 / 390 / 430). Identity: Josh (dual-game).

## Side-by-side

| Viewport | Drink It! | Ship It! |
|---|---|---|
| 360 | `drinkit-top-360.png` | `shipit-top-360.png` |
| 390 | `drinkit-top-390.png` | `shipit-top-390.png` |
| 402 | `drinkit-top-402.png` / `drinkit-full-402.png` | `shipit-top-402.png` / `shipit-full-402.png` |
| 430 | `drinkit-top-430.png` | `shipit-top-430.png` |

## Ship It! after shots

| # | Shot |
|---|---|
| 2 | `02-shipit-photo-post.png` |
| 2b | `02b-shipit-reaction-float.png` |
| 3 | `03-shipit-achievement.png` (catalog `fas fa-layer-group` → `score.layer`) |
| 4 | `04-shipit-two-posts-dividers.png` |
| 5 | `05-shipit-achievements-on.png` |
| 6 | `06-shipit-achievements-off.png` |
| 7 | `07-shipit-my-team.png` |
| 8 | `08-shipit-photo-viewer.png` |
| 9 | `09-shipit-feed-bottom.png` |

Legacy before (Phase 10A Tuesday): `before/shipit-gallery-legacy.png`

## Geometry checks (all four viewports)

- Non-sticky gold header, no Ship Time row, no duplicate heading
- Filter size Δ = **0×0** vs Drink It!
- Polaroid radius/padding match; Ship It! cool surfaces use blue gradient
- Reaction float on select; Show Achievements hides awards only
- No horizontal overflow

## Components reused

`GalleryFeedView`, `GalleryPostCard` polaroid + award markup, `ReactionBar` pill + float, `FramedPhoto`, `formatShipWeekdayTime`, `resolveAchievementIconKey`, shared `.gallery-*` CSS tokens.

## Intentional game differences

- Header/nav gold-brown vs magenta; cool surfaces blue vs teal
- Filters: **My Team** vs **My Gallery**
- Achievement ownership prefers team name on Ship It!
- Drink It! may still show no-photo placeholder; Ship It! scavenger posts require photos
