# Primary ChatGPT menu photo agent — construction contract

**Do not implement the agent in this gate.** This file is the handoff for a later ChatGPT session.

## Mission

Convert onboard Star Princess bar-menu photographs into:

1. One complete importer-compatible `full_snapshot` `.json` (`schema_version` `1.1` preferred)
2. Human-readable evidence + uncertainty manifest (sidecar; not necessarily inside schema)
3. Validation + schedule-feasibility report (`ready_for_scheduling`, 72/39 pools)
4. Explicit unresolved organizer decisions
5. Optional: copy of February fallback JSON retained unchanged

Never fabricate ingredients, prices, qualifying bars, fingerprints, or points to pad pools.

## Attachments required for the ChatGPT session

| Artifact | Why |
|---|---|
| This file + `EXACT_IMPORT_SCHEMA.md` + `SCORING_AND_SCHEDULE_INPUT_RULES.md` | Contract |
| `content/schemas/catalog-import.schema.json` | Machine schema |
| `content/catalogs/launch-candidate-v1.json` (February) | Baseline identities / rankings |
| `content/catalogs/organizer-authorized-exceptions-v1.json` | Must merge |
| `content/catalogs/printed-ingredient-map-v1.json` | Printed→canonical map |
| `content/approvals/rankings-approval-v1.json` | Ranking authority |
| `content/approvals/price-evidence-approval-v1.json` + `filtered-source-offerings-v1.json` | Category B set |
| `docs/MENU_RECONSTRUCTION_AGENT.md` | Prior agent boundaries |
| `docs/CATALOG.md` | Product rules |
| `handoff/data/menus/Star-Princess-Beverage-Source-Unmodified.md` | Research evidence |
| Organizer photo pack (external) | Ground truth |
| `fixtures/synthetic-schedule-ready-valid.json` | Shape example only (not production content) |

## Photo grouping / labeling

1. Group by **physical bar key** (use February keys; do not invent parallel ids).
2. Within bar: order pages (`barKey/page-01.jpg` …). Note obstructed/glare/cropped pages.
3. Shared pool menus (Promenade / Lido / MIX / Star): document as shared evidence; do not pretend four independent PDFs if photos show one menu family.
4. Mobile Order screens: treat as **virtual source notes only** — do not add `mobile-order` as a catalog bar.

## Extraction rules

| Step | Rule |
|---|---|
| Drink name | Transcribe printed name; map to existing `drink.key` when clearly same concept |
| Multi-bar same name | One drink concept; separate `bar_offerings` |
| Ingredients | `display_ingredients` = exact printed tokens; `ingredient_keys` via map / existing keys only |
| Missing recipe lines | Flag `INCOMPLETE_INGREDIENT_LIST`; do not invent |
| Price visible ≤15 | Category A: `verified_within_limit` + exact `price_usd` |
| Price visible >15 | Category D: `verified_over_limit` |
| Price absent / Good Spirits | Category C: `unverified`, `price_usd: null` |
| Price absent but offering already in filtered-source set | Category B only if fingerprint+approval match; else C |
| New drink not in Category B set | Cannot use Category B by copying approval id |
| Aliases / duplicates | Prefer February keys; record conflicts for organizer |
| Classification tags | Only approved vocabulary; omit when unsure |
| Cocktail/ingredient candidates | Start from February rankings; adjust eligibility/designated bar only with evidence; **do not invent new bounty rows to hit quotas** |

## When photo may override February

| May override | Must not override lightly |
|---|---|
| Printed price / availability at a photographed bar | Stable `drink.key` / `ingredient.key` used by achievements |
| New offerings clearly on menu | Category B fingerprints / approval ids |
| Removing offerings absent from all photos **after organizer confirms** | Organizer-authorized exceptions (always merge back) |
| Designated bounty bar if February bar no longer serves drink | Fixed Bar Bounty / Daily Challenge bar keys (still must exist as bars) |

## Fields agent supplies vs backend

See `EXACT_IMPORT_SCHEMA.md` origin column. Backend computes eligibility, corroboration, hash, publish, schedule. Agent must still **declare** correct tier/points/coverage that will survive corroboration.

## Pre-delivery checklist

1. `node scripts/prepare-reconstructed-catalog.mjs <snapshot.json>` (merges exceptions; fails if missing)
2. `previewCatalogImport` → `ready_for_scheduling` with cocktailEligible≥72 and ingredientEligible≥39
3. No fabricated Category A/B
4. Evidence manifest lists every uncertainty flag + photo references
5. Organizer decision list non-empty when any Category C bounty candidate remains needed for pools
6. If pools insufficient **without fabrication** → **reject Plan A**; deliver February fallback recommendation

## Required outputs naming

```
star-princess-onboard-menu-YYYYMMDD.json
star-princess-onboard-menu-YYYYMMDD.evidence.md
star-princess-onboard-menu-YYYYMMDD.validation.md
star-princess-onboard-menu-YYYYMMDD.decisions.md
```
