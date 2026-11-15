# M2-P1 Summary — Unpriced menu eligibility

**Verdict:** Organizer-approved Category U (`approved_unpriced_menu_within_limit` + per-bar `unpriced_menu_authorizations`) is implemented end-to-end on disposable `:55321`. Category A/B/C/D preserved. February fallback still 79/44 and initializes 125. Changes uncommitted pending director review. No push/deploy. Protected stacks untouched.

## Representation

- Status: `approved_unpriced_menu_within_limit`
- `price_usd`: always `null` (never invent 15)
- Provenance: `source_notes.unpriced_menu_authorizations[]` with `completeness: complete_menu_no_printed_prices` + `evidence_reference`
- Admin publish of that catalog is the organizer authorization path

## Migrations

- `20261105011500_m2_unpriced_menu_price_status_enum.sql`
- `20261105011600_m2_unpriced_menu_price_policy.sql`

## Evidence

- Unit: `tests/unit/m2.unpricedMenuPricePolicy.spec.ts`
- DB: `scripts/menu-launch/run-m2-price-policy-validation.mjs` → `evidence/m2-validation-results.json` (**38/38 PASS**)

## M1 relationship

M1 remains the original tested baseline for import contract / February recovery. **M2 supersedes M1’s missing-price → always Category C rule** when a complete price-free menu is organizer-authorized. See `POLICY.md`.
