# Exact production catalog import schema

**Authoritative sources (do not invent keys):**

| Layer | Path |
|---|---|
| JSON Schema | `content/schemas/catalog-import.schema.json` |
| TS types | `src/lib/catalog/types.ts` |
| Validator | `src/lib/catalog/validateCatalog.ts` |
| Stage client | `src/lib/adminCatalogImport.ts` |
| UI | `src/features/admin/CatalogImportSection.vue` |
| Server stage/publish/rollback | `supabase/migrations/20261105006800_phase6b2_catalog_import_publish_rollback.sql` (+ `07400` for schema 1.1) |
| Category B allowlist | `src/lib/catalog/priceEvidenceApprovals.ts`, `content/approvals/filtered-source-offerings-v1.json` |
| Organizer exceptions | `content/catalogs/organizer-authorized-exceptions-v1.json` |

**Validation command (local, DB-blind):**

```bash
node --input-type=module <<'EOF'
import { createServer } from 'vite'
import { readFileSync } from 'fs'
import { join } from 'path'
const vite = await createServer({
  root: process.cwd(), configFile: false, logLevel: 'error', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  resolve: { alias: { '@': join(process.cwd(), 'src') } },
})
const { previewCatalogImport, isReadyToStage } = await vite.ssrLoadModule('/src/lib/catalog/index.ts')
const doc = JSON.parse(readFileSync(process.argv[1] || 'content/catalogs/launch-candidate-v1.json', 'utf8'))
const p = previewCatalogImport(doc)
console.log({ readiness: p.readiness, ready: isReadyToStage(p), counts: p.counts, shortages: p.shortages })
await vite.close()
EOF
```

Or run the M1 harness: `node scripts/menu-launch/run-m1-validation.mjs`.

**Verified synthetic example:** `fixtures/synthetic-schedule-ready-valid.json`
**February production fallback:** `fixtures/february-fallback-star-princess-launch-candidate-v1.json` (= `content/catalogs/launch-candidate-v1.json`)

---

## Top-level document

`additionalProperties: false`. Unknown top-level keys → `SCHEMA_INVALID`.

| Key | Type | Req | Origin | Notes |
|---|---|---|---|---|
| `schema_version` | `"1.0"` \| `"1.1"` | yes | agent / existing | Prefer `1.1` when any `classification_tags` present |
| `catalog_id` | string pattern `^[a-z0-9][a-z0-9._-]{0,127}$` | yes | agent | Must be **unique** vs prior `catalog_versions.catalog_id` or stage returns `catalog_exists` |
| `base_catalog_id` | string \| null | no | agent | Optional stale-base check on publish |
| `mode` | const `"full_snapshot"` | yes | agent | Only accepted mode |
| `source_notes` | object | yes | agent | See below |
| `bars` | array min 1 | yes | photo + existing | Physical bars only in snapshot |
| `ingredients` | array | yes | photo + existing | Canonical identities |
| `drinks` | array | yes | photo + existing | Concepts + `bar_offerings` |
| `cocktail_candidates` | array | yes | curated / rankings | One row per drink concept |
| `ingredient_candidates` | array | yes | curated / rankings | Declared coverage must match menu corroboration |

**Not accepted:** Export Current Game Data (`export_schema_version: "1.0"`) — different shape; documented in `docs/ADMIN_ADD_DRINK_AND_EXPORT.md`.

---

## `source_notes`

| Key | Type | Req | Origin |
|---|---|---|---|
| `verified_bar_keys` | canonicalKey[] unique | yes | photo-observed |
| `carried_forward_bar_keys` | canonicalKey[] unique | yes | existing / organizer |
| `uncertainty_flags` | `{code, message, bar_key?, drink_key?}[]` | yes | agent |
| `evidence_summary` | string ≤2000 | no | agent |
| `organizer_authorized_exceptions` | `{drink_key, bar_key, name?}[]` | no* | fixed registry merge |
| `price_evidence_approvals` | `{approval_id, offering_set_sha256?}[]` | no* | fixed approval id |

\*Required in practice for launch/reconstructed snapshots that opt into exception/Category B contracts. Validator fail-closes when `catalogRequiresOrganizerExceptions(doc)`.

---

## `bars[]`

| Key | Type | Req | Origin |
|---|---|---|---|
| `key` | canonicalKey | yes | existing stable ids |
| `name` | string ≤120 | yes | photo / existing |
| `deck` | string \| null ≤64 | no | photo / existing |
| `active` | boolean | yes | organizer / photo |

**Stable launch keys (February catalog):**
`good-spirits-at-sea`, `omalleys-irish-pub`, `princess-live`, `bellinis-cocktail-bar`, `wheelhouse-bar`, `crooners`, `wake-view-bar`, `promenade-bars`, `sea-view-bar`, `cascade-bar`, `lido-bar`, `the-mix`, `star-bar`.

**Mobile Order** is a **virtual** source (`mobile-order`) managed by migration `10900` — **not** a physical bar row in the import snapshot. Do not add it as a normal bounty bar.

Duplicate `key` → `DUPLICATE_BAR_KEY`.

---

## `ingredients[]`

| Key | Type | Req | Origin |
|---|---|---|---|
| `key` | canonicalKey | yes | existing preferred; new only when photo forces |
| `name` | string ≤120 | yes | photo / existing |
| `aliases` | string[] unique | no | display only — **never** scoring synonyms |
| `family` | string \| null | no | curated |
| `classification_tags` | approved enum[] | no | curated; omitted = unknown |

Printed text stays in offering `display_ingredients`. Canonical keys via `ingredient_keys` (+ `content/catalogs/printed-ingredient-map-v1.json` for research mapping). Alias conflicts → `ALIAS_CONFLICT` / `ALIAS_COLLIDES_WITH_KEY` / `INGREDIENT_NAME_CONFLICT`.

---

## `drinks[]` + `bar_offerings[]`

### Drink

| Key | Type | Req | Origin |
|---|---|---|---|
| `key` | canonicalKey | yes | stable concept id |
| `name` | string ≤160 | yes | photo |
| `kind` | enum | yes | photo | `named_cocktail` \| `beer` \| `wine` \| `other_alcoholic` \| `nonalcoholic` |
| `classification_tags` | `frozen` \| `margarita` \| `mixed-spirits` | no | curated |
| `bar_offerings` | array min 1 | yes | photo per bar |

Same drink name at multiple bars = **one concept**, multiple offerings. Cocktail bounty non-repetition is by **concept**, not offering.

### Offering

| Key | Type | Req | Origin |
|---|---|---|---|
| `bar_key` | canonicalKey | yes | photo |
| `ingredient_keys` | canonicalKey[] unique | yes | mapped from printed |
| `display_ingredients` | string[] | yes | **exact printed** text |
| `price_usd` | number\|null 0–500 | no* | photo exact $ |
| `price_status` | enum | yes | photo + rules |
| `price_evidence_approval_id` | string\|null | Category B | fixed allowlist only |
| `price_evidence_recipe_fingerprint` | 64-hex\|null | Category B | must match approved set |
| `evidence_reference` | string\|null | no | audit pointer |
| `seasonal` | boolean | no | photo |
| `availability` | `standard`\|`seasonal`\|`limited` | no | photo |
| `classification_tags` | offering tags | no | curated / exceptions |

**`price_status` enum:**

| Value | Category | Bounty eligible? | `price_usd` |
|---|---|---|---|
| `verified_within_limit` | A | yes if ≤15 | **required** exact ≤15 |
| `approved_filtered_within_limit` | B | yes if allowlisted id+fingerprint+bar | **must be null** |
| `unverified` | C | no | null |
| `verified_over_limit` | D | no | optional |
| `not_applicable` | — | n/a | for non-priced kinds |

Forged Category B without allowlisted identity → `APPROVED_FILTERED_*` errors. Sole approval id in code: `star-princess-filtered-source-2026-11-07`. **Good Spirits is excluded** from Category B bars.

---

## `cocktail_candidates[]`

| Key | Type | Req | Origin |
|---|---|---|---|
| `drink_key` | canonicalKey | yes | curated |
| `designated_bar_key` | canonicalKey | yes | curated (must have offering) |
| `tier` | enum | yes | curated | **`familiar` \| `interesting` \| `unusual` \| `adventurous`** |
| `points` | 25\|50\|75\|100 | yes | must match tier table |
| `eligible` | boolean | no | default treat as eligible unless `false` |
| `notes` | string ≤500 | no | agent |

**Surprise:** Player-facing “Boring / Exciting” labels are **not** schema enums. Schema uses `familiar` / `unusual` (not Boring / Exciting).

Points table (`src/lib/catalog/types.ts`): familiar=25, interesting=50, unusual=75, adventurous=100.

Duplicate concept → `DUPLICATE_COCKTAIL_CONCEPT` (no silent dedupe). Organizer exceptions must **not** appear here.

Backend eligibility also requires: `named_cocktail`, active designated bar, offering present, Category A/B price gate.

---

## `ingredient_candidates[]`

| Key | Type | Req | Origin |
|---|---|---|---|
| `ingredient_key` | canonicalKey | yes | curated |
| `known_bar_count` | int 0–30 | yes | curated claim — must **exactly** equal corroborated A/B active-bar count |
| `distinct_qualifying_drinks` | int 0–500 | yes | curated — must **exactly** equal corroborated drink concepts |
| `tier` | enum | yes | `easy_to_find` \| `less_common` \| `hard_to_find` \| `elusive` |
| `points` | 25\|50\|75\|100 | yes | match tier |
| `eligible` | boolean | no | |
| `notes` | string | no | |

Bar coverage bands (Master Rules / engine): easy 11–13, less_common 7–10, hard 4–6, elusive 2–3.
Corroboration: `named_cocktail` @ **active** bars with Category A/B only; ≥2 bars required.

**App does not auto-rerank rarity from photos.** Declared tier/points/coverage remain authoritative and must match evidence.

---

## Readiness outcomes

| `readiness` | Meaning |
|---|---|
| `invalid` | Schema / fatal cross-ref failure |
| `structurally_valid` | (intermediate; rare in practice) |
| `valid_not_ready` | Shape OK but business/shortage/evidence errors |
| `ready_for_scheduling` | ≥72 eligible cocktails **and** ≥39 eligible ingredients |

Client `safeToPublish` is always `false` in pure TS preview; server `admin_preview_catalog_publish` sets `safe_to_publish`.

Stage requires client `ready_for_scheduling` **and** server recheck. Forged readiness cannot bypass pool/schema/tag gates.

---

## Provenance labels (for agent + evidence manifest)

Use these on every field decision (store in separate evidence manifest when not in schema):

1. **Photo-observed**
2. **Existing verified catalog** (February / prior published)
3. **Fixed application configuration** (bar bounty keys, daily challenges, approval ids, exception registry)
4. **Deterministically calculated** by validator/SQL (eligibility, corroboration, payload hash, schedule slots)
5. **Unknown — organizer review required**

Schema cannot store arbitrary provenance; put photo file ids, uncertainty, and override rationale in the **evidence manifest** (see agent contracts).
