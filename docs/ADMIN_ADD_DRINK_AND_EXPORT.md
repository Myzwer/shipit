# Admin Add Drink & Export Current Game Data (Phase 6B1)

Organizer-only tools on `/admin`. Narrow scope: add a named on-menu alcoholic drink to existing bars, deactivate a mistaken manual addition, and download a reconstruction-safe JSON export. No menu CMS, no Cocktail rotation editor, no rarity/points controls.

## Add Drink (manual overlay)

### Behavior

1. Admin enters a drink name, selects one or more **existing** bars, and optionally attaches known ingredients (existing keys or a new normalized key).
2. Preview shows bars, ingredient create-vs-reuse, and an explicit note that the drink **does not enter Cocktail Bounty rotation**.
3. Save is idempotent on `client_request_id` + fingerprint. Same request replays; conflicting fingerprints reject.
4. The drink concept and each bar-specific offering get stable UUIDs. Adding the same name at a second bar creates a **new offering** under the same concept.
5. Ingredients are normalized with existing catalog conventions and written as version-scoped associations.
6. New offerings appear in `list_drinkit_bar_drinks` for the chosen bars and may qualify for the **current** Ingredient Bounty via normal claim rules (`drinkit_offering_has_ingredient`).
7. Deactivate (`admin_deactivate_manual_offering`) hides the offering from future pickers only. Historical submissions, scores, corrections, and Gallery rows stay intact.

### Data model

| Table | Role |
|---|---|
| `admin_manual_offerings` | Overlay registry for admin-added offerings (active flag, audit, kind) |
| `admin_manual_offering_ingredients` | Ingredient keys attached at add time |
| `drink_concepts` / `bar_offerings` / `catalog_version_*` | Stable identities + version rows (not a silent rewrite of an immutable base import blob) |

Manual additions **never** insert `cocktail_candidates`. They do not recompute rarity/hint counts or change Cocktail/Ingredient rotation identities or point tiers.

Pending client state (`pendingAdminAddDrink`) stores request id + form fields only — never passwords or Auth tokens.

### RPCs

| RPC | Who | Purpose |
|---|---|---|
| `admin_preview_add_drink` | Admin | Dry-run normalize / validate |
| `admin_add_drink` | Admin | Apply overlay + version rows |
| `admin_deactivate_manual_offering` | Admin | Soft-remove for future use |
| `admin_list_manual_offerings` | Admin | Active/inactive list for UI |
| `admin_find_add_drink_request_by_id` | Admin | Lost-response reconcile |

Players are denied all of the above.

## Export Current Game Data

`admin_export_current_game_data` returns a versioned JSON document (`export_schema_version: "1.0"`) for an **external** menu-reconstruction agent.

### Includes

- Active catalog version identifiers, source notes, manifest
- Bars and offerings (with known ingredients + `admin_added` flag)
- Cocktail / Ingredient candidate definitions
- Admin manual offerings + player ingredient correction overlays
- Already-exposed Cocktail concept keys and Ingredient keys
- Current / remaining Cocktail & Ingredient slot state
- Featured Bar / Daily day tables (non-rotation categories)
- Compatibility notes for a later full-snapshot importer

### Never includes

- Player names or full roster
- Passwords, tokens, Auth user ids
- Private photo objects or signed URLs
- Personal Gallery content
- Private scoring history

The Admin UI downloads `star-princess-game-data-YYYYMMDD.json` on the organizer’s phone. Ordinary players cannot call the RPC or see the Export section.

## Future import compatibility (Phase 6B2 contracts only)

Full publish/rollback is **out of scope** for 6B1. When a later `full_snapshot` import lands:

1. **Admin-added offerings** — Reconcile by stable `offering_id` / `(bar_key, drink_key)`. If the new snapshot already contains the offering, mark the manual overlay redundant and deactivate. If not, either carry the overlay forward onto the new catalog version or require an explicit organizer decision — never silently drop identities that still have historical submissions.
2. **Player ingredient corrections** — Keep as overlays. If the new snapshot already lists the association, deactivate as redundant. Admin-suppressed corrections (`inactive_cause = admin`) remain suppressed.
3. **Canonical identifiers** — Preserve `drink_concepts`, `bar_offerings`, and ingredient keys across versions. Do not mint new UUIDs for the same bar+drink evidence.
4. **Exposed objectives** — `bounty_objective_exposures` keys stay consumed; do not re-offer already-shown Cocktail/Ingredient keys.
5. **Active offers** — Protect current slot offers; replacement catalogs must not orphan an in-flight claim.
6. **Historical submissions** — Accepted claims, points, voids, and Gallery bindings remain untouched.

See also [`docs/CATALOG.md`](./CATALOG.md) and [`content/schemas/catalog-import.schema.json`](../content/schemas/catalog-import.schema.json).

## Researched menu source inventory

| Expected filename | Status |
|---|---|
| `Star_Princess_Bar_Game_Menus.md` | **MISSING** in repository |
| `Star_Princess_Bar_Game_Menus(2).md` | **MISSING** (cited by ranking drafts under `handoff/data/rankings/`) |
| `handoff/data/menus/Star-Princess-Beverage-Source-Unmodified.md` | Present — research beverage dump; **not** an approved production import |

Source cautions that must survive into production catalog prep: 13 game bars; Princess Plus **$15** eligibility; Good Spirits pricing unverified; shared pool menu reused across several bars; printed ingredients may be incomplete; same drink name at different bars may be different offerings; exclusions stay excluded. Do not promote unverified drinks to Cocktail candidates merely to fill pool size.

**Action for organizer:** supply the original `Star_Princess_Bar_Game_Menus(.md|(2).md)` evidence file before Saturday production catalog work.

## Local verification

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npx supabase functions serve admin-roster
npm run db:seed-bounty-now   # active catalog for Add Drink / picker
npm run lint && npm run typecheck && npm test && npm run test:integration
LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase6b1
npm run build
```

Migrations: `065` Auth reservation · `066` Add Drink overlay + export.
