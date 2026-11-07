# Ranking → launch-candidate reconciliation

Organizer-approved ranking sources (unchanged files):
- `handoff/data/rankings/Cocktail-Bounty-Rankings-REVIEW-DRAFT.md`
- `handoff/data/rankings/Ingredient-Bounty-Rankings-Bar-First-REVIEW-DRAFT.md`

Approval manifest: `content/approvals/rankings-approval-v1.json`

Schedule cadence remains **72 Cocktail / 39 Ingredient** slots (current engine). Obsolete ranking slot projections are not restored.

| Kind | Source | Source tier/pts | Status | Price evidence | Loggable | Schedulable | Action |
|---|---|---|---|---|---|---|---|
| ingredient | Melon flavor (including liqueur) (`melon-flavor`) | elusive/100 → engine hard_to_find/75 | tier_remapped_to_master_rules_band | Category B | yes | yes | None — engine band wins for points/tier; ranking intent preserved via coverage. |
| ingredient | Mezcal (any style) (`mezcal`) | elusive/100 → engine hard_to_find/75 | tier_remapped_to_master_rules_band | Category B | yes | yes | None — engine band wins for points/tier; ranking intent preserved via coverage. |
| ingredient | Basil (`basil`) | hard_to_find/75 → engine hard_to_find/ | excluded_hidden_hunt_guardrail | Category B | yes | no | Keep out of Ingredient Bounty pool; drinks remain loggable. |
| ingredient | Jalapeño (`jalapeno`) | hard_to_find/75 → engine less_common/50 | tier_remapped_to_master_rules_band | Category B | yes | yes | None — engine band wins for points/tier; ranking intent preserved via coverage. |
| cocktail | Apples Delight (`apples-delight`) | adventurous/100 | good_spirits_pending_price | Category C unknown | yes | no | Onboard: photograph/price-check this drink. If ≤$15 with exact $, set Category A; do not invent $15. |
| cocktail | Azul Blanco (`azul-blanco`) | adventurous/100 | good_spirits_pending_price | Category C unknown | yes | no | Onboard: photograph/price-check this drink. If ≤$15 with exact $, set Category A; do not invent $15. |
| cocktail | Grappa Peach (`grappa-peach`) | adventurous/100 | good_spirits_pending_price | Category C unknown | yes | no | Onboard: photograph/price-check this drink. If ≤$15 with exact $, set Category A; do not invent $15. |
| cocktail | Sandia en Fuego (`sandia-en-fuego`) | adventurous/100 | good_spirits_pending_price | Category C unknown | yes | no | Onboard: photograph/price-check this drink. If ≤$15 with exact $, set Category A; do not invent $15. |
| cocktail | The Great Pumpkin (`the-great-pumpkin`) | adventurous/100 | good_spirits_pending_price | Category C unknown | yes | no | Onboard: photograph/price-check this drink. If ≤$15 with exact $, set Category A; do not invent $15. |
| cocktail | Bangkok Mule (`bangkok-mule`) | unusual/75 | good_spirits_pending_price | Category C unknown | yes | no | Onboard: photograph/price-check this drink. If ≤$15 with exact $, set Category A; do not invent $15. |
| cocktail | Coco-Café (`coco-cafe`) | unusual/75 | good_spirits_pending_price | Category C unknown | yes | no | Onboard: photograph/price-check this drink. If ≤$15 with exact $, set Category A; do not invent $15. |
| cocktail | The Cartagena Cool (`the-cartagena-cool`) | unusual/75 | good_spirits_pending_price | Category C unknown | yes | no | Onboard: photograph/price-check this drink. If ≤$15 with exact $, set Category A; do not invent $15. |
| cocktail | Vanilla Sky (`vanilla-sky`) | unusual/75 | good_spirits_pending_price | Category C unknown | yes | no | Onboard: photograph/price-check this drink. If ≤$15 with exact $, set Category A; do not invent $15. |
| cocktail | Gin & Tonic Ultima (`gin-and-tonic-ultima`) | interesting/50 | good_spirits_pending_price | Category C unknown | yes | no | Onboard: photograph/price-check this drink. If ≤$15 with exact $, set Category A; do not invent $15. |

## Summary counts

| | Ranking source | Launch-candidate eligible |
|---|---:|---:|
| Cocktail retained / eligible | 89 (incl. 10 GS pending) | 79 (+ 10 pending GS) |
| Ingredient objectives | 45 | 44 |
