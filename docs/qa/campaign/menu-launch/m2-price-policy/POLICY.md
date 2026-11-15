# M2-P1 — Unpriced menu eligibility policy

**Supersedes M1 missing-price behavior:** M1 treated absent/unknown prices (including Good Spirits) as Category C `unverified` — loggable, not bounty-eligible. M2 adds an explicit organizer-authorized path for **complete** price-free physical bar menus. M1 evidence remains the original tested baseline; do not rewrite M1 artifacts.

## Final organizer rule

| Situation | Ordinary log | Bounty eligible |
|---|---|---|
| Visibly priced ≤ $15 (Category A) | yes | yes (if candidate rules pass) |
| Visibly priced > $15 (Category D) | yes | **no** |
| Complete physical bar menu prints **no** drink prices, organizer-authorized (Category U) | yes | yes (assumption within Princess Plus $15; **not** an exact `$15`) |
| Cropped / obscured / incomplete price area | yes | **no** (stay Category C) |
| Isolated missing price on an otherwise priced menu | yes | **no** (stay Category C) |
| Ordinary `unverified` without Category U auth | yes | **no** |
| Explicit known over-$15 | yes | **no** (always overrides Category U) |
| Good Spirits + complete price-free menu + Category U auth | yes | yes |
| Good Spirits without Category U | yes | **no** (strict Category C as before) |
| Organizer log-only exceptions (e.g. Princess Ultimate Cooler) | yes | **no** |

Assumption is **per physical bar/menu**, never global.

## What this does / does not change

- Changes **only** price eligibility evidence.
- Ingredient, candidate, rarity, oddity, venue, and game-scoring rules are unchanged except that Category U offerings now corroborate rarity the same way Category A/B do.
- No new Admin drink editor, player friction, or speculative pricing UI.
- Never insert invented `price_usd: 15`.
