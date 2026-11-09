# Frozen Tropical readiness (Stage A3)

Status: **content incomplete — do not enable definitions yet.**

## What already exists

| Primitive | Status | Fit |
|---|---|---|
| Drink/offering tag vocabulary (`frozen`, fruit/tropical ingredient tags) | Approved in catalog schema | Needed for eligibility |
| `tag_match` condition | Live | Single-log “logged a frozen cocktail” (see D-033) |
| `offering_collection` (A1) | Live | Bar-scoped menus only — **not** a cross-bar frozen set |
| `distinct_count` | Live | Count distinct concepts; not tag-filtered by itself |
| Curated frozen drink list + milestone thresholds | **Missing** | Organizer content decision |

Launch-candidate currently has **zero** drinks tagged `frozen`. Tropical fruit tags exist on ingredients, not as a Frozen Tropical collection set.

## Recommendation

1. Organizer supplies: eligible drink concept keys (or confirms `frozen` tagging rules) and milestone thresholds (e.g. 3 / 6 / all).
2. Prefer extending collection config with an optional `drink_tag` (or explicit `drink_concept_keys`) **without** hardcoding counts in Vue — mirror A1 version-aware denominators.
3. Until then: keep Frozen Tropical achievements **uncreated or disabled**; D-033 remains the only frozen-adjacent enabled row.
4. No David companion requirement for this collection.

Do not rebuild the achievement engine or UI for this content gap.
