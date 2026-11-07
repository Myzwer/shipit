# Visual fidelity audit — Phase 9A (core player)

Authority order: latest organizer decisions → newer replacement PNGs → original JPG exports → established theme.

Mockup sample data is **not** gameplay content. Placeholder point values (e.g. 25/50 on Challenge List) are superseded by the approved 100–500 bands. Approved copy in `handoff/04-UI-Content-and-Icons.md` supersedes obsolete mockup labels (`Tap to claim`, `Log It`, `Social Feed`).

## Screen inventory

| Screen | Authoritative reference | Current route / component | Mismatch classes addressed in 9A |
|---|---|---|---|
| Login / Welcome Aboard | Established theme (no dedicated JPG) | `/login` `LoginView` | Spacing, form card radius, touch targets |
| Game selection | `1. Game Selection.jpg` | `/` `GameSelectionView` | Icon/title scale, Launch button proportions |
| Drink It! Home | `2. Drink It - Home.jpg` | `/drinkit` `DrinkItHomeView` + `BountyCarousel` | Carousel peeks, tier/timer type, section bands, leaderboard cards, nav |
| Drink It! Log wizard | `2. Drink It - Log*.jpg` + Review PNG | `/drinkit/log` wizard steps | Review selected/available contrast; ingredient link; points pills |
| Ship It! Home | `2. Ship It - Home.jpg` + leaderboard PNG | `/shipit` `ShipItHomeView` | Progress type, leaderboard band, member separator ` - ` |
| Ship It! Challenges | `Ship-It-Challenge-List.png` | `/shipit/challenges` | Active aqua cards, completed sage, category badges, filter layout |
| Shared shell | All mockups’ header/nav | `SectionHeaderBar`, `FloatingBottomNav`, `GameShell`, tokens | Header tracking/height, nav pill, card radius/shadow tokens |

## Shared theme / component changes

- `src/styles/theme.css` — card radius/shadow tokens, Ship complete surface, `ui-card` / `ui-primary-btn` / `ui-section-band`
- `SectionHeaderBar` — taller safe-area header, wider letter-spacing
- `FloatingBottomNav` — larger touch targets, stronger pill shadow, active/inactive icon treatments
- `LeaderboardList` — points + metric stacked on the right; Ship It! member separator
- `ShipTimeIndicator` — quieter band under header
- `BountyCarousel` — card radius/shadow tokens, timer hierarchy, Claim It via `ui-primary-btn`
- `ReviewStep` — selected magenta accent rail + checkbox, available outline, accent points pills (approved copy retained)

## Before / after screenshots

| Set | Path |
|---|---|
| After (Phase 9A) | `docs/phase9a-screenshots/` |

Capture: `LOCAL_TEST_PASSWORD='…' npm run screenshots:phase9a` (Vite + provisioned identities; auto-reseeds mid-cruise clock).

### Reference → implementation comparison

| Screen | File | Changed components | Main improvements | Remaining mismatches | Auth reference? | A11y deviation |
|---|---|---|---|---|---|---|
| Login | `01-login.png` | `LoginView` | Form card radius/shadow, min-height CTA | No dedicated mockup JPG | No | Kept ≥44px CTA |
| Game selection | `02-game-selection.png` | `GameSelectionView` | Larger icons/titles, Launch sizing | Divider hairline vs mock soft edge | Yes — JPG | — |
| Drink It! Home | `03-drinkit-home.png` | `DrinkItHomeView`, `BountyCarousel`, shell | Section band, carousel peeks, timer type, nav | No header points chip (not in product); fixture names ≠ mock drinks | Yes — JPG | Did not shrink type for long names |
| Log · Bar→Photo | `04`–`07-*.png` | Wizard steps (shell polish) | Shared header/nav/safe-area | Step chrome less ornate than JPGs | Partial JPGs | — |
| Log · Review | `08-drinkit-log-review.png` | `ReviewStep` | Selected/available contrast, accent pills, mismatch link | Mock “Tap to claim” / “Log It” rejected by copy spec | Yes — newer PNG | High-contrast selected rail |
| Ship It! Home | `09-shipit-home.png` | `ShipItHomeView`, `LeaderboardList` | Leaderboard band; members `Name - Name` | Fixture zero scores; tied ranks | Yes — PNG | — |
| Challenges | `10-shipit-challenges.png` | `ChallengeListView` | Aqua active / sage complete; filter stack; point badges | Mock 25/50 pts ignored (100–500 real) | Yes — extra PNG | Touch targets ≥ mock |
| Responsive | `responsive-*-{360,390,430,desktop}.png` | Shared shell | No clipped CTAs; safe-bottom | Desktop is phone layout centered | — | — |

## Known remaining mismatches (defer)

| Item | Why deferred |
|---|---|
| Wrapped / Achievements / Gallery visual pass | Phase **9B** |
| Admin visual overhaul | Out of scope |
| Exact mockup magenta hex micro-tweaks on every secondary screen | Prefer shared tokens; avoid one-off restyles |
| Challenge List mockup 25/50 points | Placeholder; real 100–500 retained |
| Drink It! Home “points chip” in header | Not in live product; score lives on leaderboard |
| Wizard step chrome ornamentation | Prefer shared shell; no redesign |

## Accessibility-driven deviations

- Did not shrink body type to force short mockup names onto one line.
- Kept minimum ~44px touch targets on nav and primary actions even when mockups look tighter.
- Reduced-motion preferences remain honored on Wrapped (unchanged this phase).
- Review selected state uses accent rail + label (not color alone).

## Unresolved design references

- No dedicated Welcome Aboard / Login mockup export.
- Full re-rendered Final Mockups ZIP still not supplied (see `handoff/design/README.md`).
- Daily Claim standalone polish deferred unless covered via Home Claim It → wizard.

## Phase 9B remaining screens

- Cruise Wrapped intro + results (both games)
- Achievements (My / All) + unlock popup
- Gallery feed + photo viewer + reactions
- Daily claim standalone visual polish (if not already covered via Home)
- Any Admin surfaces requested later
