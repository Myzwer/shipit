# Verified instructions for Development Director (ChatGPT agent updates)

**Do not edit the two previously generated ChatGPT agent instruction files from here** — they live outside this repository. Use this document to update them.

## Superseded M1 pricing instructions

Replace any instruction that says:

> Price absent / Good Spirits → always Category C `unverified`

With the M2 rule set in `POLICY.md`. Keep all other M1 schema, fingerprint, ranking, and exception rules.

## What the primary ChatGPT (menu photo) agent must produce

1. For each physical bar menu photograph, classify price evidence:
   - Visible $ ≤15 → Category A (`verified_within_limit` + exact `price_usd`)
   - Visible $ >15 → Category D (`verified_over_limit`)
   - Complete menu clearly prints **no** drink prices → propose Category U **only** with a matching `source_notes.unpriced_menu_authorizations` entry for **that** bar (`completeness: complete_menu_no_printed_prices`, real `evidence_reference`)
   - Cropped / incomplete / obscured price area → Category C `unverified` + uncertainty flag (e.g. `PRICE_AREA_CROPPED`) — **never** Category U
   - Isolated missing price on a priced menu → Category C for that row — **never** whole-bar Category U
2. Never invent `price_usd: 15`.
3. Never copy Category B `approval_id` / fingerprints onto new drinks (including Good Spirits).
4. Good Spirits: use Category U only when the complete menu is genuinely price-free and authorized; otherwise keep Category C.
5. Retain organizer-authorized exceptions as `unverified` + tags; never Category A/B/U.
6. Emit uncertainty flags for incomplete evidence.

## What the independent auditor must verify

1. Every Category U offering has `price_usd: null` and a bar-level authorization.
2. No Category U bar also has Category A/D printed-price offerings.
3. No cropped/incomplete uncertainty flags coexist with Category U auth for the same bar.
4. Authorization for bar X does not appear to qualify offerings at bar Y.
5. Good Spirits Category U claims have complete-menu evidence; otherwise still Category C.
6. Category B allowlist/fingerprint set is untouched for new drinks.
7. Princess Ultimate Cooler / other exceptions remain non-bounty.
8. February fallback still validates (≥79/44) if used as recovery baseline.
9. Server-side stage rejects forged Category U (not TS-only).

## What the backend computes and enforces

- `catalog_payload_unpriced_menu_authorized_bars(payload)`
- `catalog_payload_price_evidence_errors` (Category U gates)
- `catalog_payload_cocktail_pool` / `catalog_payload_ingredient_pool` (A/B/U)
- `achievement_offering_collection_price_ok` includes Category U
- Client mirror: `src/lib/catalog/priceEvidenceApprovals.ts`, `validateCatalog.ts`, JSON Schema
