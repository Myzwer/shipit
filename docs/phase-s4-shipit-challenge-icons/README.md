# Phase S4 — Ship It! Challenge Icon Assignment

Content/icon pass only. Approved card geometry, gradients, typography, and completed checkmark treatment are unchanged.

## Summary

| Metric | Value |
|---|---|
| Challenges assigned | **50 / 50** |
| Unique semantic icons | **45** |
| Icons reused more than twice | **0** |
| Schema / scoring / completion changes | None |

Icons were chosen from **what each challenge asks players to photograph or accomplish**, not from category alone. Mapping lives in `src/lib/shipit/challengeIcons.ts` keyed by stable `canonical_key`, with FA Pro definitions registered in `src/ui/icons.ts` under `shipit.*` (plus reuse of existing `score.*` / `theme.*` / `status.*` keys). Missing/unknown keys fall back to `theme.ship-it`.

Completed cards still render `status.completed` (circle-check), not the content icon.

## Intentional duplicates (exactly twice)

| Icon | Challenges | Why |
|---|---|---|
| `score.compass` | Carpet Compass, Nautical Rose | Both are compass / orientation motifs |
| `score.utensils` | Buffet Multi-Tasker, Main Dining Elegance | Both center on plated / table food |
| `shipit.concierge` | Guest Services, Room Service Delivery | Both are guest-service moments |
| `shipit.binoculars` | Ocean Lookout, Bridge Wing Peek | Both are spotting / lookout shots |
| `shipit.fitness` | Gym Buffs, Deck Dance Move | Both are active movement (treadmill / deck fitness) |

## Harder matches

| Challenge | Choice | Notes |
|---|---|---|
| Mid-Air Jump | `person-falling` | Closest recognizable mid-air figure in installed Pro sets |
| Shadow Art | `users` | Three distinct people/shadows; no dedicated shadow glyph |
| King of the World | `person-rays` | Arms-wide open-deck pose |

No challenge was left on a generic ship/camera/star filler.

## Screenshots

| File | Notes |
|---|---|
| `after-402-classic-icons.png` | Classic cards: stairs / film / dome + completed checkmarks |
| `after-402-food-icons.png` | Food filter: mug / pizza / ice cream / utensils + checkmarks |
| `after-402-quirky-icons.png` | Quirky category variety |
| `after-402-viewport-icons.png` | Full viewport |
| `after-402-fullpage-icons.png` | Full page scroll |
| `icon-audit.json` | Runtime FA `data-icon` audit |

Re-capture:

```bash
node scripts/capture-phase-s4-shipit-challenge-icons.mjs
```

## QA

- Unit: `tests/unit/shipitChallengeIcons.spec.ts`, `tests/unit/shipitChallengeList.spec.ts`
- `npm run typecheck` / `npm run build` — pass
- Tree-shaken individual FA Pro imports only (no full-library bundle)

## Mapping reference (no organizer approval required)

| canonical_key | Title | Semantic key | FA icon |
|---|---|---|---|
| the-piazza-grandeur | The Piazza Grandeur | shipit.stairs | stairs |
| movies-under-the-stars | Movies Under the Stars | shipit.film | film |
| under-the-dome | Under The Dome | shipit.dome | landmark-dome |
| miniature-masterpiece | Miniature Masterpiece | theme.ship-it | ship |
| lotus-spa-zen | Lotus Spa Zen | shipit.spa | spa |
| front-row-center | Front Row Center | shipit.theater | masks-theater |
| casino-neon | Casino Neon | shipit.dice | dice |
| art-critic | Art Critic | shipit.palette | palette |
| gym-buffs | Gym Buffs | shipit.fitness | person-running |
| guest-services | Guest Services | shipit.concierge | bell-concierge |
| international-cafe | International Café | score.coffee | mug-hot |
| omalleys-irish-pub | O'Malley's Irish Pub | score.beer | beer-mug |
| poolside-slice | Poolside Slice | shipit.pizza | pizza-slice |
| soft-serve-swirl | Soft Serve Swirl | shipit.ice-cream | ice-cream |
| buffet-multi-tasker | Buffet Multi-Tasker | score.utensils | utensils |
| tropical-paradise | Tropical Paradise | score.cocktail | martini-glass-citrus |
| main-dining-elegance | Main Dining Elegance | score.utensils | utensils |
| sweet-treat | Sweet Treat | shipit.cake | cake-candles |
| good-spirits-mixology | Good Spirits Mixology | score.whiskey | whiskey-glass |
| room-service-delivery | Room Service Delivery | shipit.concierge | bell-concierge |
| carpet-compass | Carpet Compass | score.compass | compass |
| stateroom-door-flair | Stateroom Door Flair | shipit.door | door-closed |
| elevator-map | Elevator Map | shipit.elevator | elevator |
| nautical-rose | Nautical Rose | score.compass | compass |
| safety-first | Safety First | shipit.life-ring | life-ring |
| deck-13-mystery | Deck 13 Mystery | shipit.mystery | circle-question |
| high-wind-warning | High Wind Warning | status.warning | triangle-exclamation |
| towel-zoo | Towel Zoo | shipit.paw | paw |
| lounge-spotlight | Lounge Spotlight | shipit.microphone | microphone |
| ocean-wake | Ocean Wake | shipit.water | water |
| the-cruise-guide | The Cruise Guide | shipit.clipboard | clipboard-list |
| crew-high-five | Crew High-Five | shipit.handshake | handshake |
| captains-portrait | Captain's Portrait | shipit.captain | user-tie |
| trivia-masters | Trivia Masters | shipit.brain | brain |
| live-music-backdrop | Live Music Backdrop | score.music | music |
| ocean-lookout | Ocean Lookout | shipit.binoculars | binoculars |
| deck-dance-move | Deck Dance Move | shipit.fitness | person-running |
| bingo-champion | Bingo Champion | shipit.ticket | ticket |
| souvenir-selection | Souvenir Selection | shipit.gift | gift |
| the-youth-club-entry | The Youth Club Entry | shipit.children | children |
| wind-tunnel | Wind Tunnel | shipit.wind | wind |
| sunset-silhouette | Sunset Silhouette | shipit.sunset | cloud-sun |
| king-of-the-world | King of the World | shipit.pose | person-rays |
| triple-match | Triple Match | shipit.shirt | shirt |
| mid-air-jump | Mid-Air Jump | shipit.jump | person-falling |
| chair-squeeze | Chair Squeeze | shipit.chair | chair |
| shadow-art | Shadow Art | score.friends | users |
| comically-lost | Comically Lost | shipit.map | map |
| bridge-wing-peek | Bridge Wing Peek | shipit.binoculars | binoculars |
| victory-dance | Victory Dance | score.leaderboard | trophy |
