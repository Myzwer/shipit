# Catalog independence

## Rule

The 16 Other Drinks choices are owned by `src/lib/drinkLog/otherDrinks.ts`. They are **not** required in:

- `cocktail_candidates`
- `ingredient_candidates`
- Bar-specific menu coverage calculations
- Price verification / Category U authorizations
- New Category B approvals
- Importer required menu data

They must not inflate catalog readiness counts or ingredient rarity.

## Organizer exception retention (revised)

**Before:** Full snapshots (launch / reconstructed) failed closed if registry exception drinks@bars were missing.

**After:** New photographed catalogs may omit permanent Other Drinks / historical exception rows. When legacy exception offerings **are** present (February fallback, older snapshots):

- Must keep `collection-excluded` + `organizer-authorized-exception`
- Must remain `unverified` with `price_usd: null`
- Must not carry Category A/B fingerprints or Category U
- Must not invent `ingredient_keys` or enter `cocktail_candidates`

Client: `findMissingOrganizerAuthorizedExceptions` in `organizerAuthorizedExceptions.ts`  
SQL import: no separate retention requirement found beyond existing price/candidate gates (reviewed).

## Duplicate display

Physical-bar drink lists hide concept keys that Other Drinks covers (`OTHER_DRINKS_MENU_HIDE_CONCEPT_KEYS`), so legacy embedded exception rows do not appear twice in the photographed menu list.

## February fallback

`content/catalogs/launch-candidate-v1.json` (and M1 February fixture twin) still validates with embedded exceptions. Unit tests cover stage-readiness and integrity.
