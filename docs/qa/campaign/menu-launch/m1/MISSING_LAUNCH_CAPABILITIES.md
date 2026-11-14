# Missing launch capabilities (M1)

## P0 — launch blockers if unmitigated

| ID | Issue | Mitigation / status |
|---|---|---|
| M1-P0-01 | Organizer boards **without** offline February JSON and without a prior published retired February version | **Mitigation exists:** ship `fixtures/february-fallback-*.json` to Files **before** cruise. Export cannot reconstruct import. **Not a code defect** if ops copies the file. |
| M1-P0-02 | Re-publish requires **unique** `catalog_id`; uploading unmodified `star-princess-launch-candidate-v1` after it was already published fails `catalog_exists` | **Ops procedure:** rename `catalog_id` (and clear/set `base_catalog_id`) or use Admin Rollback on retired version. Documented in FEBRUARY doc. Consider P1 UX later — not silent M1 repair. |

No new silent source defect requiring unauthorized implementation sprint was found that blocks the documented Plan A/B path on disposable.

## P1 — important gaps

| ID | Issue | Notes |
|---|---|---|
| M1-P1-01 | No explicit Admin upload size cap / progress UI for very large JSON | February ~286KB fine; huge photo-derived files untested |
| M1-P1-02 | Informal oddity names (Boring/Exciting) ≠ schema enums | Agent must emit `familiar`/`unusual` |
| M1-P1-03 | Category B cannot cover newly photographed drinks absent from fingerprint set | Expect Category A exact $ or organizer approval process — out of M1 scope to expand set |
| M1-P1-04 | After schedule init, cannot “re-init”; recovery is publish/rebind or out-of-scope mid-cruise replace | Aligns with Gate A fixed-catalog rule |

## Physical iPhone gaps (called out separately)

| Gap | Status |
|---|---|
| Files app → Safari file input interchange | **Awaiting physical iPhone confirmation** |
| Ship Wi‑Fi / captive portal Admin publish | Untested here |
| ChatGPT app photo upload quality vs glare | Operational |

Chrome Playwright `isMobile` **does not** prove iPhone Files interchange.

## Explicit non-blockers (already handled)

- Failed stage flipping active catalog — disproven
- February pool too small for 125 — disproven (79/44)
- Missing discard-pending control — exists in Admin UI
- Schema 1.1 rollback — live function uses `catalog_schema_version_ok`
