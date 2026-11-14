# R8 — Defect disposition

Disposition classes match consolidation tracker.

| Original ID | REP-* | Disposition | Notes |
|---|---|---|---|
| REL-006 | REP-MIME-001 | **Fixed and verified** | Empty/generic MIME + unsupported extension denylist |
| E2B-002 | REP-CLAIM-001 | **Disproved / harness-only** | Object-shaped categories + deselect click; product awards correctly |
| DEF-QA1-001 | REP-PREVIEW-001 | **Fixed and verified** | Contract accepts `not_featured_bar` as correct short-circuit |
| INT-CRW-001 | REP-CRW-001 | **Fixed and verified** | No auto-ensure on Admin mount; confirm before generate |
| RISK-ADM-B | REP-CRW-001 | **Fixed and verified** | Same as INT-CRW-001 |
| INT-CLK-001 | REP-CLK-001 | **Fixed and verified** | Extra finale acknowledgement in Ship Clock confirm UI |
| RISK-ADM-A | REP-CLK-001 | **Fixed and verified** | Same as INT-CLK-001 (UI guard; backend latch unchanged by design) |
| INT-CAT-007 | REP-CAT-ERR-001 | **Fixed and verified** | Client maps scalar Postgres errors → failed invalid_payload |
| INT-AUTH-001 | REP-AUTH-001 | **Deferred with justified impact** | Access JWT residual until expiry is standard Auth behavior; global signOut + shared-device hygiene documented |

## Classification checklist (mission §2)

### Confirmed functional defects (repaired)

- REL-006 MIME gate
- INT-CRW-001 accidental crew lock on open
- INT-CLK-001 missing finale-latch confirmation
- INT-CAT-007 ambiguous stage errors for malformed scalars
- DEF-QA1-001 misleading contract expectation (product priority kept)

### Unverified suspected defects

- None newly elevated during R8. Prior RISK-* items outside R8 scope unchanged.

### Already repaired (R1–R7)

- REP-SUB/MEDIA/SIGNED/ADM/CAT-LOCK/SCHED/WRP/ACH groups per `KNOWN_FAILURE_MANIFEST.md`

### Test-harness issues

- E2B-002 / E2B-S14 assertion + selected-row click
- Prior harness IDs (E2E-011/012, HARNESS-QA1-*) unchanged

### Configuration requirements

- See `OPEN_ITEMS.md` (catalog republish, roster, organizer migrations, companion map, Good Spirits)

### Physical-device verification requirements

- HEIC real device, pinch crop, Safari bfcache, ship-Wi-Fi soak

### Truly optional / deferred cosmetic

- REP-AUTH-001 JWT residual (documented; not a stuck-button defect)
- Server-side catalog scalar coercion (client mapping sufficient for Admin UX; TS validator still primary gate)

## P0 / P1 remaining?

**No** R8-associated P0/P1 remains open. Launch blockers that remain are **configuration / content / physical-device**, not unrepaired confirmed code defects from this batch.
