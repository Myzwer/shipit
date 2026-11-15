# Exact new schema / status / provenance

## New `price_status`

| Value | Category | `price_usd` | Bounty eligible? |
|---|---|---|---|
| `approved_unpriced_menu_within_limit` | **U** | **must be null** | yes, if bar has valid `source_notes.unpriced_menu_authorizations` entry |

Existing statuses unchanged: `verified_within_limit` (A), `approved_filtered_within_limit` (B), `unverified` (C), `verified_over_limit` (D), `not_applicable`.

Category U must **not** set:

- `price_evidence_approval_id` (Category B only)
- `price_evidence_recipe_fingerprint` (Category B only)

## New `source_notes.unpriced_menu_authorizations[]`

Required fields per authorized physical bar:

| Field | Type | Rule |
|---|---|---|
| `bar_key` | canonicalKey | Must exist in `bars[]`; unique in the array |
| `completeness` | const `complete_menu_no_printed_prices` | Only complete menus qualify |
| `evidence_reference` | non-empty string ≤256 | Audit pointer to complete menu photo/packet |
| `notes` | optional string | Organizer/agent annotation |

Authorization for bar A never enables bar B.

## Rejection gates (client + SQL)

| Code | Meaning |
|---|---|
| `APPROVED_UNPRICED_BAR_NOT_AUTHORIZED` | Status U without matching bar authorization |
| `APPROVED_UNPRICED_INVENTS_PRICE` | Status U with non-null `price_usd` |
| `APPROVED_UNPRICED_CATEGORY_B_FIELDS` | Status U carrying Category B approval/fingerprint |
| `UNPRICED_MENU_AUTH_INVALID` | Missing completeness/evidence_reference |
| `UNPRICED_MENU_UNKNOWN_BAR` | Auth bar not in snapshot |
| `UNPRICED_MENU_DUPLICATE_BAR` | Duplicate auth for same bar |
| `UNPRICED_MENU_BAR_HAS_PRINTED_PRICES` | Bar also has Category A/D offerings |
| `UNPRICED_MENU_EVIDENCE_INCOMPLETE` | Blocking uncertainty codes for that bar |
| `ORGANIZER_EXCEPTION_FORGED_CATEGORY_U` | Log-only exception must not use U |

Blocking uncertainty codes: `PRICE_AREA_CROPPED`, `PRICE_AREA_INCOMPLETE`, `PRICE_AREA_OBSCURED`, `MENU_PRICE_EVIDENCE_INCOMPLETE`, `PARTIAL_MENU_PHOTO`, `ISOLATED_MISSING_PRICE`.

## Migrations (forward-only, additive)

1. `supabase/migrations/20261105011500_m2_unpriced_menu_price_status_enum.sql` — enum value
2. `supabase/migrations/20261105011600_m2_unpriced_menu_price_policy.sql` — auth helper, payload errors, cocktail/ingredient pools, collection price gate

## Organizer authorization path

Administrator approval of a well-evidenced complete price-free menu is represented by **publishing** a catalog import that declares `unpriced_menu_authorizations` and Category U offerings. No onboard SQL or Cursor operation is required.
