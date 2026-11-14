# Scoring and schedule input rules

Sources: `src/lib/catalog/types.ts`, `validateCatalog.ts`, `priceEvidenceApprovals.ts`, `docs/CATALOG.md`, migration `20261105011200_admin_initialize_bounty_schedule.sql`, `20261105009800_phase_c2_1_daily_challenge_final_copy.sql`, R5 `CATALOG_UPDATE_CONTRACT.md`.

## What ChatGPT / import must supply

| Input | Rule |
|---|---|
| Physical bars + active flags | Stable keys; inactive bars cannot host eligible cocktail candidates |
| Drink concepts + per-bar offerings | Recipes, printed ingredients, prices/status |
| Canonical ingredients + keys on offerings | No inventing bounty ingredients solely to fill pools |
| `cocktail_candidates` tier + points + designated bar | Curated; points must match tier enum |
| `ingredient_candidates` tier + points + declared coverage | Curated; coverage must match corroborated A/B offerings |
| Category A exact `$` or Category B allowlisted fingerprint | Never invent `$15` as a printed price |
| Organizer-authorized exceptions | Merge registry; loggable only; not bounty candidates |
| `source_notes` uncertainty | Honest flags for obstructed/missing evidence |

## What backend calculates / enforces

| Output | Where |
|---|---|
| Schema/cross-ref/business validation | `previewCatalogImport` + server stage recheck |
| Cocktail eligibility (A/B, active bar, kind) | `isCocktailEligible` |
| Ingredient corroboration counts | `corroborateIngredientEvidence` |
| Pool sufficiency (≥72 / ≥39) | readiness + shortage warnings |
| `payload_hash` | sha256 of Postgres `jsonb::text` (`hashPayload`) |
| Catalog version + active pointer | `admin_publish_catalog_import` |
| 72 cocktail + 39 ingredient slot ledger | `admin_initialize_bounty_schedule` |
| 7 Bar Bounties + 7 Daily Challenges | Fixed key sequences inside init SQL (not from import rankings) |
| Publish rebind of future `scheduled` slots | Existing 6B2 publish path |
| Ordinary vs bounty logging | Separate player RPCs; unlisted logging does not create catalog rows |

## What must not be inferred safely

- Exact prices at Good Spirits (Category C → `unverified`)
- Category B for new drinks by copying `approval_id` without fingerprint set membership
- Spirit-family / frozen tags without menu evidence
- Ingredient rarity auto-derived from “looks rare”
- Filler cocktail/ingredient candidates to hit 72/39
- Mobile Order as a physical featured bar
- That Export Current Game Data can be re-uploaded as import JSON

## Cocktail oddity tiers (schema)

| Schema tier | Points | Informal labels (UI/copy may differ) |
|---|---:|---|
| `familiar` | 25 | often described as “boring” / easy |
| `interesting` | 50 | interesting |
| `unusual` | 75 | often described as “exciting” |
| `adventurous` | 100 | adventurous |

**Import must use schema enums**, not informal names.

## Ingredient rarity

Determined by **declared** `known_bar_count` within Master Rules bands, corroborated by eligible physical-bar offering counts (Category A/B named cocktails only). One-bar-only → excluded. Declared ≠ corroborated → error.

## Ordinary-loggable vs bounty-eligible

| Offering | Ordinary log | Cocktail/Ingredient bounty |
|---|---|---|
| Category A ≤$15 | yes | yes (if candidate) |
| Category B approved | yes | yes (if candidate) |
| Category C unverified | yes | no |
| Category D >$15 | yes | no |
| Organizer exception | yes (collection-excluded) | no |
| Unlisted drink | yes (honor path) | no catalog bounty without honor evidence |

## Schedule: 125 entries

| Kind | Count | Catalog-driven? |
|---|---:|---|
| Cocktail slots | 72 | Yes — from eligible cocktail candidates |
| Ingredient slots | 39 | Yes — from eligible ingredient candidates |
| Bar Bounties | 7 | **Fixed** keys: wake-view-bar, good-spirits-at-sea, sea-view-bar, crooners, omalleys-irish-pub, lido-bar, promenade-bars |
| Daily Challenges | 7 | **Fixed** titles/locations/keys in SQL (lido, sea-view, omalleys, crooners, good-spirits, bellinis, cascade) |

Init refuses atomically on pool shortage or missing bar keys (`BAR_KEY_MISSING` / daily key missing). Incomplete generation rolls back.

**Catalog publish does not create the first schedule.** Init is a separate Admin action. After init succeeds, duplicate init → `SCHEDULE_ALREADY_INITIALIZED`.

## Insufficient pools

- Client: `valid_not_ready` + `COCKTAIL_POOL_SHORTAGE` / `INGREDIENT_POOL_SHORTAGE` warnings
- Stage: refused
- Init (if somehow underfilled active catalog): refuses; leaves zero slots when cleared (proven Gate A / M1)

## February observed pool (M1)

`star-princess-launch-candidate-v1`: **79** eligible cocktails, **44** eligible ingredients → shortages 0/0 → `ready_for_scheduling`.
