# M1 test results

**Command:** `node scripts/menu-launch/run-m1-validation.mjs`
**Evidence:** `evidence/m1-validation-results.json`, `evidence/m1-validation-run.txt`
**Totals:** PASS 44 · FAIL 0 · INFO 3 · BLOCKED 0

**Database:** disposable `:55321` only. Organizer/Agent2 unchanged.

## Evidence class legend

| Tag | Meaning |
|---|---|
| `BE` | Real backend RPC/SQL on disposable |
| `TS` | Pure TypeScript validator (source-backed) |
| `SRC` | Source inspection |
| `BR` | Playwright browser automation |
| `SIM` | Simulated mobile viewport (not physical iPhone) |
| `INFO` | Context only |

## Required cases

| # | Case | ID(s) | Result | Class |
|---|---|---|---|---|
| 1 | Minimal valid catalog | `TS-MINIMAL-VALID`, `BE-SYN-*` | PASS | TS + BE |
| 2 | Duplicate id/name | `TS-DUP-DRINK`, `TS-DUP-COCKTAIL-CONCEPT` | PASS | TS |
| 3 | Dangling refs | `TS-DANGLING-REFS` | PASS | TS |
| 4 | Wrong types / unknown props | `TS-WRONG-TYPE`, `TS-UNKNOWN-PROPS` | PASS | TS |
| 5 | Missing/conflicting prices | `TS-MISSING-PRICE-A`, `TS-PRICE-CONFLICT` | PASS | TS |
| 6 | Unverified Good Spirits | `TS-UNVERIFIED-GS` | PASS | TS |
| 7 | Insufficient pools | `TS-POOL-SHORTAGE` | PASS | TS |
| 8 | Candidate diversity 72/39 | `TS-DIVERSITY-FEB`, `TS-DIVERSITY-SYN` | PASS | TS |
| 9 | Ingredient rarity corroboration | `TS-ING-RARITY-MISMATCH` | PASS | TS |
| 10 | Synthetic → Admin import → 125 | `BE-SYN-STAGE/PUBLISH/POINTER/INIT-125` | PASS | BE |
| 11 | Failed import → February → 125 | `BE-PHOTO-FAIL-RETAIN`, `BE-FEB-FALLBACK-INIT-125` | PASS | BE |
| 12 | Mobile-width file + offline | `BR-FILE-*`, `BR-OFFLINE-STAGE` | PASS | BR+SIM |
| 13 | Upload type/size rules | `SRC-FILE-ACCEPT`, `SRC-NO-SIZE-CAP` | PASS | SRC |

## Additional proven

| ID | Result | Notes |
|---|---|---|
| `FEB-READY` / `FEB-OFFLINE-COPY` | PASS | February file ready + offline SHA match |
| `BE-FAIL-STAGE-NO-POINTER` | PASS | Invalid stage does not flip pointer |
| `BE-RESTORE-FEB-THEN-INIT` | PASS | Republish February over alternate pre-init |
| `BR-IPHONE-GAP` | INFO | Explicit non-claim for physical Files |

## Synthetic / fixture paths

- `fixtures/synthetic-schedule-ready-valid.json`
- `fixtures/february-fallback-star-princess-launch-candidate-v1.json`
- `fixtures/browser-ready-mini.json` / `browser-invalid.json` (harness scratch)

## Not re-run

Full seven-day voyage simulation (already 54/54 in Gate A fixed-catalog follow-up).
