# R1–R7 Integration — Regression Results

## Typecheck / build

| Command | Result |
|---|---|
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

## Achievement definition & QA-3B contracts

| Suite | Result |
|---|---|
| `tests/unit/qa3b-achievements-wrapped/` (35 tests) | **35/35 PASS** |
| — ACH-001 frozen tag audit | **PASS** |
| — ACH-002 gauntlet location / covered_count | **PASS** |
| — ACH-003 production map 174 | **PASS** |
| — WRP-001 / WRP-002 / awarding contracts | **PASS** |
| `finalAchievementCatalog`, `achievementConditions`, `composeAchievementsView`, `catalogClassification` | **PASS** |

### Earned-award execution evidence vs definition verification

| Coverage class | Count | Notes |
|---|---:|---|
| Definition / parameter / map verification | **174** | Compose + authority + release map + unit audits |
| Direct live earned-award execution (R7 QA-4A probe on `:56321`) | **~16 working keys** in probe sequence + physical gauntlet completion | See R7 `probe-achievements-results.json` / `INT-ACH-EXEC-PROOF-KEYS` |
| **Not claimed** | — | All 174 live unlock proofs |

Integration re-validated definition contracts on main; did **not** re-mutate `:56321` for a second full probe run (Agent 2 stack protected). R7 probe evidence remains the live award proof baseline.

## Cross-repair unit suites (this run)

| Area | Result |
|---|---|
| QA-3A admin/catalog (`tests/unit/qa3a-admin-catalog`) | **PASS** (full folder in combined run) |
| QA-2 reliability | **85 PASS / 1 FAIL** — only REL-006 empty-MIME GIF (**expected red R8**) |
| R1 `submissionIntegrity.r1.spec.ts` + submitGuards | **PASS** |
| R2 stagePhoto / PhotoCapture restore / abandon contracts | **PASS** |
| R3 `signedPhotoLifecycle.r3.spec.ts` + gallerySignedUrl | **PASS** |
| R5 `scheduleInit.contract.spec.ts` | **PASS** |
| `devEnvironmentGuard` / `qaScenarioSafety` | **PASS** |

Combined vitest slice: **345 passed / 1 failed (REL-006) / 346 total**.

## Live disposable `:55321` proofs

| Proof | Result |
|---|---|
| R6 `repro-r6-wrapped-ranking.mjs` after `11400` | **7/7 PASS** |
| Migration upgrade + fresh-path apply | **PASS** (see `MIGRATION_COMPATIBILITY.md`) |
| Award row integrity across `11400` | **324 → 324** |

## R7 original QA-4A probe (evidence retained; not re-run against `:56321`)

| ID | Status | Integration note |
|---|---|---|
| ACH-DEFS-174 / ACH-003-PRODUCTION-MAP | PASS | Confirmed via unit ACH-003 on integrated tree |
| ACH-002-* physical / MO / wrong-bar / virtual | PASS | Unit covered_count now matches; live evidence from R7 |
| INT-ACH-02…06 (thresholds, multi-unlock, idempotent, void, gallery) | PASS | R1 path still covered by unit + prior probe |
| INT-ACH-01 | FAIL | Day-1 also awards `d076` Come Sail Away — probe strictness |
| ACH-001-ACTIVE-CATALOG | FAIL | Active pointer was schedule fixture without frozen tags |
| ACH-001-WHATIF | BLOCKED | No tropical pool without inventing |
| ACH-003-ENGINE-REACHABILITY | FAIL | Fixture catalog vs launch JSON tags |

## Preserved expected red (do not weaken)

| ID | Suite | Batch |
|---|---|---|
| REL-006 | `processImage.qa2.spec.ts` empty MIME GIF | **R8** |
| E2B-002 | Claim-race stress | R8 / REP-CLAIM-001 |
| DEF-QA1-001 | Bar preview reason | pre-existing |

## Not re-executed this assignment

- Full Playwright QA-2A/2B browser matrix
- R2 browser Storage abandon (`repro-r2-media-abandon.mjs`) — unit contracts green
- R3 real-expiry on `:56321` (`repro-r3-signed-url.mjs`) — would touch Agent 2
- Full QA-4A achievements probe re-run on `:56321`
- Physical-device HEIC / Safari bfcache / ship-Wi-Fi soak
