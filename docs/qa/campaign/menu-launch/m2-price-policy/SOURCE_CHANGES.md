# Exact source files / migrations changed

## Client / schema

| File | Change |
|---|---|
| `content/schemas/catalog-import.schema.json` | Enum + `unpriced_menu_authorizations` |
| `src/lib/catalog/types.ts` | `PriceStatus`, `UnpricedMenuAuthorization`, source_notes |
| `src/lib/catalog/priceEvidenceApprovals.ts` | Category U eligibility + auth helpers |
| `src/lib/catalog/validateCatalog.ts` | Validation + corroboration with U |

## Database (additive)

| File | Change |
|---|---|
| `supabase/migrations/20261105011500_m2_unpriced_menu_price_status_enum.sql` | Enum value |
| `supabase/migrations/20261105011600_m2_unpriced_menu_price_policy.sql` | Errors, pools, collection gate |

## Tests / harness

| File | Change |
|---|---|
| `tests/unit/m2.unpricedMenuPricePolicy.spec.ts` | Unit matrix |
| `scripts/menu-launch/run-m2-price-policy-validation.mjs` | Disposable DB harness |

## Docs (this folder)

`docs/qa/campaign/menu-launch/m2-price-policy/*`

## Intentionally unchanged

- February `content/catalogs/launch-candidate-v1.json` (still Category B + GS Category C)
- Category B fingerprint set / approval id
- Organizer exception registry contract (still `unverified`)
- M1 historical evidence under `docs/qa/campaign/menu-launch/m1/`

## Price-gate trace (inspected)

| Layer | Location |
|---|---|
| Import JSON Schema | `content/schemas/catalog-import.schema.json` |
| TS types | `src/lib/catalog/types.ts` |
| Offering price statuses / eligibility | `priceEvidenceApprovals.ts` |
| Catalog business-rule validation | `validateCatalog.ts` |
| Category B approvals/fingerprints | `priceEvidenceApprovals.ts`, `filteredSourceOfferings*`, `content/approvals/*` |
| SQL payload price validation | `catalog_payload_price_evidence_errors` (084 → **116**) |
| SQL catalog import/publish pools | `catalog_payload_cocktail_pool`, `catalog_payload_ingredient_pool` |
| Enum | `price_verification_status` (+115) |
| Ingredient corroboration | TS `corroborateIngredientEvidence` + SQL ingredient pool |
| Cocktail candidate qualification | TS `isCocktailEligible` + SQL cocktail pool |
| Schedule init readiness | stage pool counts (≥72/≥39) |
| Player bounty acceptance | schedule offers from published eligible pools; claim path uses companions |
| Collection / gauntlet price gate | `achievement_offering_collection_price_ok` (**116**) |
| Admin catalog preview | existing Admin import UI; validation messages via issue codes |
| Organizer exceptions | `organizerAuthorizedExceptions.ts` |
