# Menu Reconstruction Agent contract (Phase 7B0 / 10B)

**Phase 10B product note:** This agent is a **contingency** for onboard menu deltas — not a required launch dependency. If onboard menus match the launch-candidate catalog, run that catalog for the whole cruise (Path A). If menus differ, produce a reviewed `full_snapshot` and Admin stage/preview/publish (Path B). No mandatory Saturday reset.

External agent + human review produce a **complete `full_snapshot` catalog JSON** for Admin Catalog Import. The app does **not** search the web, classify alcohol brands, or interpret menu photos.

## Inputs the agent receives

1. Current Game Data export (`admin_export_current_game_data`, `export_schema_version: "1.0"`)
2. New onboard menu photos (organizer-provided; outside this repo)
3. Previous menu research under `handoff/data/menus/`
4. Canonical tag vocabulary (`src/lib/catalog/classificationTags.ts` / schema `$defs`)
5. Import schema (`content/schemas/catalog-import.schema.json`)

## Output

1. A reviewed `full_snapshot` document (`schema_version: "1.1"` preferred when any `classification_tags` are present; `"1.0"` still accepted)
2. A concise **exception report** (see categories below)

## Four data layers (keep separate)

| Layer | Fields | Role |
|---|---|---|
| 1. Printed source text | `bar_offerings[].display_ingredients` | Exact menu wording |
| 2. Canonical identity | `ingredients[].key`, `ingredient_keys` | Stable scoring / exact_match keys |
| 3. Achievement classification | `classification_tags` on ingredients, drinks, offerings | Approved vocabulary only |
| 4. Display alias | `ingredients[].aliases` | Player-friendly labels — **not** scoring synonyms |

Brand knowledge belongs in curated metadata. If the menu says “Espolòn Reposado Tequila” and evidence supports it, tag `spirit-family-tequila` (and reposado-adjacent tags only when the vocabulary supports them). If the menu only says “Espolòn”, leave spirit family **unknown** — do not guess expression.

## Princess Plus ($15) — bounty eligibility categories

- **A** `verified_within_limit` + exact `price_usd` ≤ 15
- **B** `approved_filtered_within_limit` + allowlisted `price_evidence_approval_id` + `price_usd` null (organizer-approved filtered source only; never invent $15)
- **C** `unverified` — loggable, not bounty-eligible
- **D** `verified_over_limit` — loggable, never a featured Cocktail/Ingredient bounty
- Ingredient corroboration counts only A/B. Shortages block import — do not invent replacements.
- Do not silently change already exposed objectives or historical points when republishing.

## Exception categories

| Code | When to raise |
|---|---|
| `UNKNOWN_BRAND_OR_SPIRIT_FAMILY` | Brand/spirit cannot be classified from evidence |
| `INCOMPLETE_INGREDIENT_LIST` | Recipe lines missing or unreadable |
| `UNVERIFIED_15_ELIGIBILITY` | Cocktail candidate price unknown or disputed |
| `UNCERTAIN_BAR_AVAILABILITY` | Unclear whether a drink is offered at a bar |
| `UNSUPPORTED_FROZEN_OR_RECIPE_CLASS` | Frozen/margarita/mixed-spirits cannot be verified |
| `CONFLICTING_INGREDIENT_IDENTITY` | Old vs new catalog disagree on canonical key |
| `MISSING_ACHIEVEMENT_METADATA` | Achievement row needs a tag/key the snapshot omits |

Record these under `source_notes.uncertainty_flags` and/or the separate exception report. Omitted classification remains unknown; the app must never invent tags.

## App boundaries

- Manual Add Drink and player ingredient corrections **do not** invent `classification_tags`.
- Publication writes version-scoped tags from the snapshot; rollback republishes a prior manifest as a **new** version (historical logs keep their `catalog_version_id`).
- Server staging rejects unknown tags and forged `ready_for_scheduling` claims that fail pool/schema/tag checks.
