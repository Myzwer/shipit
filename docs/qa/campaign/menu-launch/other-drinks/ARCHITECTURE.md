# Other Drinks architecture

## Separation of concerns

| Concern | Owner |
|---|---|
| Photographed / imported menu | Catalog JSON → offerings at bars |
| Permanent ordinary-log choices | **Application code** (`src/lib/drinkLog/otherDrinks.ts`) |

Publishing a new catalog, restoring February fallback, or replacing imported offerings must not alter the 16 Other Drinks options.

## Player flow (physical bars)

1. Bar selector (unchanged).
2. Drink selector shows imported menu items (legacy organizer-exception concept keys hidden to avoid duplicates).
3. Permanent last row: **Other Drinks** → `OtherDrinksStep.vue`.
4. Selecting any of the 16 options advances immediately to **Who's drinking with you?**
5. Photo / caption / review / submit reuse existing wizard + idempotent `submit_drink`.

Mobile Order keeps generic rows + **My drink isn't listed** unlisted form. No Other Drinks screen.

## Selection → payload

| Option | Client mode | Notes |
|---|---|---|
| Wine / Beer | `generic_wine` / `generic_beer` | Existing generic scoring |
| Named permanent shots / cooler / Loaded Corona | `unlisted_named` + `other_drinks_key` + optional `other_drinks_concept_key` | Display label preserved (e.g. Princess Cooler) |
| *[Spirit]* — Custom Drink | `unlisted_named` | Caption may describe “7 and 7”, etc. |

Server (`drinkit_resolve_drink_input`, migration `11700`):

- Allowlisted `other_drinks_concept_key` may attach `drink_concept_id` for achievement identity.
- `offering_id` stays null; ingredients stay empty.
- Mobile Order rejects Other Drinks concept attachment (`OTHER_DRINKS_NOT_ON_MOBILE_ORDER`).
- `drink_logs_mode_check` relaxed so unlisted may carry optional `drink_concept_id` without an offering.

## Key files

| File | Role |
|---|---|
| `src/lib/drinkLog/otherDrinks.ts` | Fixed 15-option list |
| `src/features/drinkit/log/OtherDrinksStep.vue` | Secondary list UI |
| `src/features/drinkit/log/DrinkStep.vue` | Other Drinks entry vs Mobile Order unlisted |
| `src/stores/drinkLogWizard.ts` | Navigation + selection |
| `src/lib/drinkLog/api.ts` | Payload fields |
| `src/lib/catalog/organizerAuthorizedExceptions.ts` | Retention no longer requires embedding |
| `supabase/migrations/20261105011700_other_drinks_concept_compat.sql` | Concept compat + constraint |

## What was not added

- No catalog JSON injection of the 16 options
- No cocktail/ingredient candidate rows
- No new Mobile Order catalog
- No production fake-time override
- No nested Other Drinks submenus / name input step
