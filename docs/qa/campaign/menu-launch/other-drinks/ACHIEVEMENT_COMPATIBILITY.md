# Achievement compatibility

## Intent

Other Drinks must support ordinary logs and intended named-drink achievements **without** inventing bounty eligibility, ingredient evidence, or Bar Gauntlet collection membership.

## Drinking with Davids (concept-keyed)

| Achievement | Concept key | Other Drinks option | Compatibility |
|---|---|---|---|
| Tampico Trauma | `tequila-shot` | Tequila Shot | `other_drinks_concept_key` → `drink_concept_id` on unlisted log |
| When the Volcano Blows | `fireball-shot` | Fireball Shot | same |
| Desperation Sambuca | `sambuca-shot` | Sambuca Shot | same |
| Jimmy Buffett Toast | `loaded-corona` | Loaded Corona | same |

`achievement_eval_same_log` matches `drink_concept_id` / `drink_concept_key`. Allowlist is server-side (`drinkit_other_drinks_concept_allowlist`). Concepts must exist in `drink_concepts` (true on current disposable / February lineage). If a future catalog drops the concept row entirely, the ordinary log still accepts; concept attachment becomes null until concepts exist.

## Princess Cooler

Player label: **Princess Cooler**. Historical identity: `princess-ultimate-cooler`. No DwD achievement requires the cooler; concept attach preserves identity for stats/history without bounty.

## Custom drinks / extra shots

Vodka Shot and *[Spirit]* — Custom Drink options have **no** concept key. Ordinary unlisted only. Do not fabricate ingredient variety from the custom base spirit label.

## Bounty / gauntlet safety

| Risk | Mitigation |
|---|---|
| Cocktail bounty by name match | Unlisted without `confirm_featured_cocktail`; preview proven non-eligible |
| Ingredient bounty from custom spirit | Empty ingredients; no honor key |
| Bar Bounty bypass | Unchanged companion/crew rules at physical bar |
| Bar Gauntlet via permanent entry | `offering_id` null → no collection coverage |
| Mobile Order physical credit | Other Drinks UI absent; concept attach refused |

## Named achievements not silently disabled

No achievement definitions were turned off. Compatibility is additive (optional concept_id on unlisted). Wine/Beer reuse existing generic modes.
