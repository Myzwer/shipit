# R8 — Regression results

## Before (R1–R7 checkpoint `c9346e9`)

| Suite | Result |
|---|---|
| QA-2 reliability | 85 PASS / **1 FAIL** (REL-006 expected red) |
| Combined R1–R7 unit slice | 345 PASS / 1 FAIL (REL-006) |

## After R8

| Suite | Result |
|---|---|
| `tests/unit/qa2-reliability` (incl. processImage REL-006) | **PASS** |
| `tests/unit/qa3a-admin-catalog` | **PASS** (R4 contracts stay green) |
| `tests/unit/qa3b-achievements-wrapped` | **PASS** (R3/R6/R7 contracts stay green) |
| ShipClock / BarCrews / shipClockFormat / adminCatalogImport / processImage | **PASS** |
| Combined slice above | **393 passed / 38 files / 0 failed** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

## Cross-repair interaction checks

| Prior batch | Concern | Result |
|---|---|---|
| R1 | Submit idempotency / in-flight guards | Untouched; qa2 submitGuards remain in green suite |
| R2 | Photo abandon / empty-blob / abort | Untouched; MIME gate is additive only |
| R3 | Signed URL refresh | Untouched; qa3b WRP-002 still green |
| R4 | Admin error classification / pending / clock catch | Clock confirm enhanced; catch path preserved; qa3a green |
| R5 | Schedule init | Untouched |
| R6 | Wrapped ranks / MO venue | Untouched; qa3b green |
| R7 | Achievement map / gauntlet | Untouched; qa3b green |

## Real backend proof (`:55321`)

| Case | Result |
|---|---|
| E2B-002 with cocktail selected | `ACCEPTED`, points > 0, `claimed_categories` includes cocktail object |
| E2B-002 with empty selected_claims | `ACCEPTED`, `claimed_categories: []`, points 0 (ordinary log) |
| Evidence | `evidence/e2b-002-triage.json` |

## Remaining expected-red unit contracts

**None.** REL-006 is green.

## Not re-run in this batch (optional / protected)

- Full Playwright QA-2A / QA-2B browser matrix (harness fixes landed; disposable clock was reseeded for triage)
- Full QA-4A probe matrix on Agent 2 `:56321` (protected)
- Organizer migration apply
