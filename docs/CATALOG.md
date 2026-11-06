# Catalog contract & bounty data foundation (Phase 2C / 2C.1)

## Purpose

Validated, version-aware data foundation for **Cocktail** and **Ingredient** Bounty pools so a future scheduling engine can select real eligible candidates without trusting incomplete production content or inventing filler.

**Out of scope here:** rotation generation, player cards UI, scoring, publish/rollback UI, Saturday production import.

## Schema contract

- JSON Schema: [`content/schemas/catalog-import.schema.json`](../content/schemas/catalog-import.schema.json)
- `schema_version`: `"1.0"` or `"1.1"` (both accepted; **1.1 preferred** when shipping curated `classification_tags`)
- `mode`: `"full_snapshot"` only
- Required: `catalog_id`, `source_notes`, `bars`, `ingredients`, `drinks`, `cocktail_candidates`, `ingredient_candidates`
- Optional: `base_catalog_id` (for later stale-base rejection on publish)
- Optional classification (Phase **7B0**): `ingredients[].classification_tags`, `drinks[].classification_tags`, `bar_offerings[].classification_tags` — approved vocabulary only; omitted = unknown
- Layers: printed `display_ingredients` ≠ canonical `ingredient_keys` ≠ `classification_tags` ≠ display `aliases` (aliases are never scoring synonyms)

Illustrative snippets in the Technical Spec are **not** production data. Handoff ranking drafts under `handoff/data/rankings/` are **review drafts**, not approved pools — do not load them as the active catalog.

Menu Reconstruction Agent contract: [`docs/MENU_RECONSTRUCTION_AGENT.md`](./MENU_RECONSTRUCTION_AGENT.md).

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

Princess Plus **$15** policy (Phase **7B1**):
- Featured **Cocktail Bounty** candidates must be `verified_within_limit` (≤ $15) at the designated bar.
- **Ingredient Bounty** corroboration counts only active-bar named cocktails that are also `verified_within_limit` with price ≤ $15. Over-limit and unverified offerings do **not** count toward the bars/drinks required to make an Ingredient objective attainable within Princess Plus.
- Declared `known_bar_count` / `distinct_qualifying_drinks` must match that within-limit corroboration. Shortages after correction block import.
- Historical accepted claims and already exposed bounties are not rewritten by a catalog republish.

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

`scheduled` cards are future objectives and are **not** player-visible. Phase **2D-A** writes `current` cards from the slot ledger on authorized exposure. See `docs/BOUNTY_SCHEDULING.md`.

Curated `cocktail_candidates` and reverse `catalog_offering_ingredients` are **admin-only**. Players receive Cocktail details only via `get_my_current_cocktail_bounty` for the live slot.

## Validation & preview

TypeScript: `src/lib/catalog/` (`previewCatalogImport`, `corroborateIngredientEvidence`).

Readiness: `invalid` | `structurally_valid` | `valid_not_ready` | `ready_for_scheduling`  
Always `safeToPublish: false` in Phase 2C; preview never mutates the database.

Server gate: `admin_preview_catalog_import` — admin-only, read-only.  
The legacy single-argument `admin_publish_catalog_import(jsonb)` raises `CATALOG_PUBLISH_USE_CANDIDATE_FLOW`.

### Stage → preview → publish / rollback (Phase 6B2)

Import is `full_snapshot` schema 1.0 or 1.1 (not the Export Current Game Data shape). Client: `src/lib/adminCatalogImport.ts`.
Server staging rechecks schema/mode/ids/references/hash/pool **and** classification vocabulary; a client-forged `ready_for_scheduling` cannot bypass those checks.
Classification tags are written into `catalog_version_*_tags` on publish (and on rollback’s new revision) from the stored manifest — historical drink logs keep their `catalog_version_id`, so later catalogs do not rewrite prior achievement evidence.
Manual Add Drink and player corrections never invent classification tags.

| RPC | Purpose |
|---|---|
| `admin_stage_catalog_import(request_id, payload, validation)` | Rechecks schema/mode/ids/references/hash/pool; stores a `catalog_import_candidates` row |
| `admin_preview_catalog_publish(candidate_id)` | Read-only diff, overlay plan, blockers (`safe_to_publish`) |
| `admin_publish_catalog_import(request_id, candidate_id, expected_active_id, expected_hash)` | New catalog version + pointer flip; rebinds only scheduled never-shown slots; idempotent |
| `admin_rollback_catalog(request_id, target_version_id, expected_active_id)` | Publishes a retired version's manifest as a NEW `<id>-rollback-<8hex>` revision with the same checks |
| `admin_find_catalog_publish_request_by_id(request_id)` / `admin_list_catalog_versions()` | Reconcile / version list |

`payload_hash` = sha256 hex of `jsonb::text`; the TS client reproduces `jsonb::text` (`canonicalJsonbText`).
Live (current) and 15-minute grace objectives must still exist in the proposed catalog (`CURRENT_OFFER_MISSING`); exposed keys are never re-offered; remaining scheduled slots must be fillable from the unused eligible pool (`REMAINING_POOL_SHORTAGE`).
Manual Add Drink overlays carry forward unless the new snapshot already contains the same bar + drink (then they are deactivated as redundant).

## Content readiness

| State | Meaning |
|---|---|
| Structurally valid | Schema OK |
| Valid but not ready | Cross-refs OK but business/shortage/evidence failures |
| Ready for scheduling | ≥72 distinct eligible Cocktail concepts and ≥39 corroborated Ingredient objectives; still **not** published |

## Player ingredient corrections (Phase 3C-A)

Shared overlay table `ingredient_corrections` attaches a confirmed ingredient to a **specific** `bar_offerings` row. Eligibility uses catalog ingredients ∪ active corrections ∪ in-request confirm key. Corrections never change rarity, points, known-bar hints, Cocktail rotation, or prior claims.

### Full catalog snapshot replacement

When a Menu Reconstruction / `full_snapshot` publish replaces the active catalog:

1. Review active `ingredient_corrections` against the new snapshot’s `catalog_offering_ingredients` for the same `offering_id`.
2. If the new snapshot already lists the ingredient, deactivate the overlay (redundant).
3. If the offering was removed or the association is wrong, deactivate via `admin_deactivate_ingredient_correction` (audited).
4. Do **not** auto-merge corrections into import JSON; keep overlay as a cruise-time delta until an organizer explicitly rebuilds base evidence.

Unlisted honor confirms do **not** create offerings or corrections — they qualify only the current submission.

## Admin Add Drink overlay (Phase 6B1)

Cruise-time additions live in `admin_manual_offerings` (+ ingredient rows) and write version-scoped offering/concept rows. They are **not** a silent mutation of the immutable base import payload, and they **never** insert `cocktail_candidates`.

- Multi-bar add reuses the drink concept; each bar gets its own `bar_offerings` id.
- Deactivate affects future picker visibility only; historical claims stay.
- Known ingredients on a manual offering may qualify for the **current** Ingredient Bounty under ordinary player claim rules.
- Operator docs + export contract: [`docs/ADMIN_ADD_DRINK_AND_EXPORT.md`](./ADMIN_ADD_DRINK_AND_EXPORT.md).

### Export Current Game Data

Admin-only RPC `admin_export_current_game_data` (`export_schema_version: "1.0"`) dumps catalog + overlays + exposure/slot state for an external reconstruction agent. Excludes roster, credentials, Auth ids, photos, Gallery, and private scores.

### Manual offering safety (Phase 6B2 gate)

`admin_add_drink` never overwrites an existing version drink’s display name/kind, never registers an already-present base offering as a removable manual, and never silently reactivates a deactivated manual. Deactivate removes `catalog_version_offerings` only when `introduced_version_offering` is true.

### Active slots and prior catalog versions

On publish, only **scheduled, never-shown** Cocktail/Ingredient slots are reassigned from the new pool. Current / exposed / grace / missed_paused / skipped offers keep their prior `bounty_slot_offers.catalog_version_id` and `display_snapshot`. Slot rows may be re-stamped to the new version so Admin Skip draws reserves from the active catalog. Daily and Featured Bar assignments are never rewritten.

## Beverage research references

Under `handoff/data/menus/` (see that folder’s README):

| File | Role |
|---|---|
| `Star-Princess-Beverage-Source-Unmodified.md` | Source evidence (13 bars; Good Spirits unverified; shared pool menu) |
| `Star-Princess-Beverage-Display-Aliases.md` | Player-readable explanations only — not extra ingredients |
| `Ingredient-Display-Alias-Lexicon.json` | Optional display labels — **not** a scoring normalization map |

These are **not** an approved production import and must not be published via Catalog Import as the live cruise catalog.

## Remaining production catalog prerequisites

1. Build a reviewed `full_snapshot` JSON from onboard Saturday photos + research references (external agent + human review)
2. Confirm pool readiness (≥72 / ≥39) without inventing unverified Cocktail candidates
3. Publish via Admin Catalog Import after preview shows no blockers

## Migrations

| File | Role |
|---|---|
| `20261105001000_phase2c_zero_delta_request_id.sql` | Zero-adjustment Set Ship Time consumes request id |
| `20261105001100_phase2c_catalog_schema.sql` | Normalized catalog / candidates / version snapshots |
| `20261105001200_phase2c_catalog_rls_and_preview.sql` | Catalog RLS + read-only admin preview RPC |
| `20261105001300_phase2c1_catalog_read_contracts.sql` | Public Ingredient hint ledger + RPC; cocktail concept uniqueness |
| `20261105002700_phase3ca_corrections_and_recovery.sql` | `ingredient_corrections` overlay + evaluate/submit honor paths |
| `20261105006600_phase6b1_admin_add_drink_and_export.sql` | Manual offering overlay + export RPC + picker filter |
| `20261105006700_phase6b2_manual_offering_safety.sql` | Base offering preservation for Add Drink |
| `20261105006800_phase6b2_catalog_import_publish_rollback.sql` | Stage / preview / publish / rollback |
