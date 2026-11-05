# Catalog contract & bounty data foundation (Phase 2C)

## Purpose

Validated, version-aware data foundation for **Cocktail** and **Ingredient** Bounty pools so a future scheduling engine can select real eligible candidates without trusting incomplete production content or inventing filler.

**Out of scope here:** rotation generation, player cards, scoring, publish/rollback UI, Saturday production import.

## Schema contract

- JSON Schema: [`content/schemas/catalog-import.schema.json`](../content/schemas/catalog-import.schema.json)
- `schema_version`: `"1.0"`
- `mode`: `"full_snapshot"` only
- Required: `catalog_id`, `source_notes`, `bars`, `ingredients`, `drinks`, `cocktail_candidates`, `ingredient_candidates`
- Optional: `base_catalog_id` (for later stale-base rejection on publish)

Illustrative snippets in the Technical Spec are **not** production data. Handoff ranking drafts under `handoff/data/rankings/` are **review drafts**, not approved pools — do not load them as the active catalog.

## Stable identities

| Entity | Identity rule |
|---|---|
| Bar | `canonical_key` → durable `bars.id` |
| Drink concept | `canonical_key` → durable `drink_concepts.id` (e.g. `mai-tai`) |
| Bar offering | Unique `(bar_id, drink_concept_id)` → `bar_offerings.id`. Same named drink at two bars = **two offerings** |
| Ingredient | `canonical_key` → durable `ingredients.id`; aliases scoped per catalog version |

Version-scoped display/price/candidate rows hang off `catalog_versions`. Prior versions remain for historical submissions and slot references.

## Point / tier rules (imported, never auto-calculated)

**Cocktail:** familiar 25 · interesting 50 · unusual 75 · adventurous 100  

**Ingredient** (Master Game Rules coverage): easy_to_find 25 (11–13 bars) · less_common 50 (7–10) · hard_to_find 75 (4–6) · elusive 100 (2–3). One-bar-only ingredients are excluded.

Novelty/rarity/tiers come from the external catalog-preparation process.

## Validation & preview

TypeScript service: `src/lib/catalog/` (`previewCatalogImport`).

Returns:

- Schema + cross-reference + business-rule errors/warnings
- Catalog/version metadata and entity counts
- Price/verification warnings; unverified & carried-forward bars
- Shortages vs **72** Cocktail and **39** Ingredient slots
- Readiness: `invalid` | `structurally_valid` | `valid_not_ready` | `ready_for_scheduling`
- `safeToPublish: false` in Phase 2C; `mutatedDatabase: false` always for preview

Server gate: `admin_preview_catalog_import(jsonb)` — **admin-only**, **read-only**, no table writes.  
Publish stub: `admin_publish_catalog_import` raises `CATALOG_PUBLISH_NOT_IMPLEMENTED`.

## Security

- No authenticated INSERT/UPDATE/DELETE on catalog tables (RLS, no write policies)
- Drink It! members may read active public catalog surfaces needed for logging
- `ingredient_candidates` select is **admin-only** (qualifying bars/drinks stay hidden)
- Player view `player_ingredient_bounty_hints` exposes name, tier, points, **known_bar_count only**
- No service-role keys in Vue

## Content readiness

| State | Meaning |
|---|---|
| Structurally valid | Schema + cross-refs OK |
| Valid but not ready | Errors/warnings or eligible pool short of 72/39 |
| Ready for scheduling | Enough distinct eligible candidates; still **not** published in 2C |

Shortages are reported explicitly. Validators never invent candidates.

## What remains for Phase 2D+

1. Bounty slot schedule generation (nonrepeating draws from eligible pools)
2. Player-visible rotating cards + hidden Ingredient grace
3. Admin import Publish / Rollback workflow and Edge Function packaging of the TS validator
4. Production Saturday catalog (after onboard menu audit) — not handoff ranking drafts
5. Scoring / submit RPCs, Admin skip, featured Bar / Daily Challenge content

## Migrations

| File | Role |
|---|---|
| `20261105001000_phase2c_zero_delta_request_id.sql` | Zero-adjustment Set Ship Time consumes request id |
| `20261105001100_phase2c_catalog_schema.sql` | Normalized catalog tables + player-safe views |
| `20261105001200_phase2c_catalog_rls_and_preview.sql` | RLS + read-only preview RPC |
