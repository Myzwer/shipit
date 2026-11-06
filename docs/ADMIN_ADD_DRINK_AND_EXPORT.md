# Admin Add Drink & Export Current Game Data (Phase 6B1 + 6B2 gate)

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

### Safety (Phase 6B2 gate)

- Never overwrite an existing catalog drink’s display name or kind (`DRINK_KIND_CONFLICT` if kinds disagree).
- Never register an already-present base offering as a removable manual (`BASE_OFFERING_EXISTS`).
- Never silently reactivate a deactivated manual (`MANUAL_OFFERING_INACTIVE`).
- `introduced_version_offering` marks overlays that created the version association; only those lose their `catalog_version_offerings` row on deactivate.

### Data model

| Table | Role |
|---|---|
| `admin_manual_offerings` | Overlay registry for admin-added offerings (active flag, audit, kind, `introduced_version_offering`) |
| `admin_manual_offering_ingredients` | Ingredient keys attached at add time |
| `drink_concepts` / `bar_offerings` / `catalog_version_*` | Stable identities + version rows |

Manual additions **never** insert `cocktail_candidates`.

## Export Current Game Data

`admin_export_current_game_data` returns a versioned JSON document (`export_schema_version: "1.0"`) for an **external** menu-reconstruction agent.

**Export is not a `full_snapshot` import file.** Catalog Import requires schema `1.0` + `mode: full_snapshot` per [`content/schemas/catalog-import.schema.json`](../content/schemas/catalog-import.schema.json). See [`docs/CATALOG.md`](./CATALOG.md) for publish/rollback.

### Never includes

- Player names or full roster
- Passwords, tokens, Auth user ids
- Private photo objects or signed URLs
- Personal Gallery content
- Private scoring history

## Overlay reconciliation on publish

When a `full_snapshot` is published:

1. **Admin-added offerings** — Reconcile by stable ids / `(bar_key, drink_key)`. Snapshot already contains the offering ⇒ deactivate manual as redundant. Otherwise carry forward onto the new catalog version.
2. **Player ingredient corrections** — Keep as overlays. Snapshot already lists the association ⇒ deactivate as redundant (`no_valid_sources` / catalog superseded note). Admin-suppressed corrections remain suppressed.
3. **Canonical identifiers** — Preserve across versions.
4. **Exposed objectives** — Stay consumed.
5. **Active offers** — Protected; incompatible current/grace objectives block publish.
6. **Historical submissions** — Untouched.

## Beverage research references

See `handoff/data/menus/README.md`. Source-Unmodified is evidence; Display-Aliases are display-only; the lexicon is not a scoring map. Do not publish these files as the production cruise catalog.

## Local verification

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npx supabase functions serve admin-roster
npm run db:seed-bounty-now
npm run lint && npm run typecheck && npm test && npm run test:integration
LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase6b1
LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase6b2
npm run build
```

Migrations: `065` Auth reservation · `066` Add Drink + export · `067` manual safety · `068` catalog import/publish/rollback.
