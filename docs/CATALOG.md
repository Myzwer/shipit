# Catalog contract & bounty data foundation (Phase 2C / 2C.1)

## Purpose

Validated, version-aware data foundation for **Cocktail** and **Ingredient** Bounty pools so a future scheduling engine can select real eligible candidates without trusting incomplete production content or inventing filler.

**Out of scope here:** rotation generation, player cards UI, scoring, publish/rollback UI, Saturday production import.

## Schema contract

- JSON Schema: [`content/schemas/catalog-import.schema.json`](../content/schemas/catalog-import.schema.json)
- `schema_version`: `"1.0"`
- `mode`: `"full_snapshot"` only
- Required: `catalog_id`, `source_notes`, `bars`, `ingredients`, `drinks`, `cocktail_candidates`, `ingredient_candidates`
- Optional: `base_catalog_id` (for later stale-base rejection on publish)

Illustrative snippets in the Technical Spec are **not** production data. Handoff ranking drafts under `handoff/data/rankings/` are **review drafts**, not approved pools — do not load them as the active catalog.

## Cocktail concept versus offering identity

| Layer | Identity | Rule |
|---|---|---|
| Drink concept | `drink_concepts.canonical_key` (e.g. `mai-tai`) | Stable across catalog revisions |
| Bar offering | `bar_offerings (bar_id, drink_concept_id)` | **Distinct** when the same named drink is sold at two bars (different recipes/prices allowed) |
| Cocktail Bounty candidate | One row per **drink concept** per catalog version | Master Rules: no repeat of the same named Cocktail Bounty during the cruise, even if offered at multiple bars |

Validation **rejects** (does not silently dedupe) multiple `cocktail_candidates` sharing the same `drink_key`. Scheduling readiness counts **distinct eligible concepts**, not offering rows. DB unique index: `(catalog_version_id, drink_concept_id)` on `cocktail_candidates`.

Inactive bars cannot supply eligible Cocktail candidates even when price/offering fields otherwise validate.

## Ingredient scheduling qualification

Source classification (tier / points / declared coverage) remains authoritative — the app does **not** auto-rerank rarity.

An Ingredient candidate counts toward the **39**-slot pool only when:

1. Tier/points pair is valid and declared `known_bar_count` fits the Master Rules band for that tier.
2. Catalog menu evidence corroborates the claim:
   - Qualifying offerings are `named_cocktail` at **active** bars listing the ingredient.
   - Corroborated distinct bar count ≥ 2 (one-bar-only excluded).
   - Corroborated distinct drink-concept count ≥ 1.
3. Declared `known_bar_count` and `distinct_qualifying_drinks` **exactly match** corroborated totals (fabricated coverage fails readiness).

Zero matching offerings → ineligible. Mismatches are reported as business-rule errors; validators never invent qualifying drinks.

Princess Plus **$15** exclusions apply to Cocktail Bounty candidates; Ingredient evidence may still use higher-priced named cocktails when present on an active bar menu.

## Source-reported vs corroborated coverage

| Field | Meaning |
|---|---|
| `known_bar_count` / `distinct_qualifying_drinks` | Externally curated claims (must match tier bands) |
| Corroborated counts | Derived only from bar-specific offering ↔ ingredient associations in the import |

Preview surfaces `INGREDIENT_COVERAGE_UNCORROBORATED` / `INGREDIENT_DRINKS_UNCORROBORATED` / `INGREDIENT_CANDIDATE_NO_MENU_EVIDENCE` when claims are unsupported.

## Player-safe read contract

**Do not** grant players SELECT on `ingredient_candidates` (admin-only). The Phase 2C `player_ingredient_bounty_hints` security_invoker view was broken against that policy and has been removed.

| Surface | Who | What |
|---|---|---|
| `ingredient_candidates` | Admin only | Full curated pool + notes (may mention bars/drinks) |
| `ingredient_bounty_public_cards` | Drink It! members: **`exposure_status = 'current'` only** | Snapshot: name, tier, points, known_bar_count — **no** qualifying bars/drinks |
| `get_my_ingredient_bounty_hint()` | Drink It! / admin | Same current snapshot as JSON; `null` until scheduling exposes one |
| Ship It!-only / anon | Denied | RPC raises; table selects empty |

`scheduled` cards are future objectives and are **not** player-visible. Phase **2D** owns writing `current` / rotating exposures from the slot ledger. Until then the RPC correctly returns `null` when nothing is exposed.

## Validation & preview

TypeScript: `src/lib/catalog/` (`previewCatalogImport`, `corroborateIngredientEvidence`).

Readiness: `invalid` | `structurally_valid` | `valid_not_ready` | `ready_for_scheduling`  
Always `safeToPublish: false` in Phase 2C; preview never mutates the database.

Server gate: `admin_preview_catalog_import` — admin-only, read-only.  
Publish stub still raises `CATALOG_PUBLISH_NOT_IMPLEMENTED`.

## Content readiness

| State | Meaning |
|---|---|
| Structurally valid | Schema OK |
| Valid but not ready | Cross-refs OK but business/shortage/evidence failures |
| Ready for scheduling | ≥72 distinct eligible Cocktail concepts and ≥39 corroborated Ingredient objectives; still **not** published |

## Remaining Phase 2D dependencies

1. Slot ledger that draws nonrepeating Cocktail concepts / Ingredient keys and writes `ingredient_bounty_public_cards` (`scheduled` → `current` → `retired`)
2. Cocktail player card exposure parallel to the Ingredient hint contract
3. Publish/activate catalog version workflow
4. Production Saturday catalog (not handoff ranking drafts)
5. Scoring / submit RPCs, Admin skip, featured Bar / Daily Challenge content

## Migrations

| File | Role |
|---|---|
| `20261105001000_phase2c_zero_delta_request_id.sql` | Zero-adjustment Set Ship Time consumes request id |
| `20261105001100_phase2c_catalog_schema.sql` | Normalized catalog / candidates / version snapshots |
| `20261105001200_phase2c_catalog_rls_and_preview.sql` | Catalog RLS + read-only admin preview RPC |
| `20261105001300_phase2c1_catalog_read_contracts.sql` | Public Ingredient hint ledger + RPC; cocktail concept uniqueness |
