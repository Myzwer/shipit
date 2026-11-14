# Known Failure Manifest — Pre-Repair Baseline

**Purpose:** Explicit expected-red product-defect tests after Agent 2 diagnostic integration.  
**Rule:** Do **not** skip, delete, weaken, or reclassify these to make the suite green.  
**Unexpected failures** (not listed here) are integration regressions and must be investigated separately.

Generated during worktree integration on `visual/drinkit-home-v1`.

### Repair progress

| REP-* | Status | Notes |
|---|---|---|
| **REP-SUB-001** | **Repaired (R1)** | REL-001/002 contract assertions now pass; E2B-S07 / remint race verified on disposable `:55321`. See `docs/qa/campaign/repairs/R1-submission-integrity/`. Media assertions in the same `submitGuards` file remain expected-red for R2. |

## Expected red — unit / contract (non-mutating)

### QA-2 reliability → repair groups

| Test file | Assertion theme | Defect IDs | REP-* | Status |
|---|---|---|---|---|
| `tests/unit/qa2-reliability/submitGuards.contract.spec.ts` | Scavenger/Daily in-flight early return | REL-001, REL-002 | REP-SUB-001 | **Repaired (R1)** — must stay green |
| `tests/unit/qa2-reliability/submitGuards.contract.spec.ts` | Discard/reset abandons staged photo | REL-003, REL-004 | REP-MEDIA-001 | Expected red |
| `tests/unit/qa2-reliability/stagePhoto.network.spec.ts` | AbortSignal reaches storage.upload | REL-005 | REP-MEDIA-001 | Expected red |
| `tests/unit/qa2-reliability/PhotoCapture.restore.spec.ts` | No empty-blob auto-stage on restore | REL-007 | REP-MEDIA-001 | Expected red |
| `tests/unit/qa2-reliability/processImage.qa2.spec.ts` | Empty MIME + `.gif` rejected | REL-006 | REP-MIME-001 | Expected red |
| `tests/unit/qa2-reliability/gallerySignedUrl.contract.spec.ts` | GalleryPostCard refresh / `@error` | REL-008 | REP-SIGNED-001 | Expected red |

Campaign baseline: **9 failed / 60 passed / 69 total** (`agent-2-reliability/vitest-qa2-results.json`).  
Post-R1: REL-001/002 green; remaining QA-2 reds are non-R1 groups.

### QA-3A admin/catalog → repair groups

| Test file | Assertion theme | Defect IDs | REP-* |
|---|---|---|---|
| `adminAccess.contract.spec.ts` | Empty enabledGames must not lock `/admin` | ADM-007 | REP-ADM-LOCK-001 |
| `adminClock.rejection.spec.ts` | `confirmManual` has catch | ADM-005 | REP-ADM-LOCK-001 |
| `adminRoster.reconcile.spec.ts` | `in_progress` / 409 → unknown | ADM-001, ADM-002 | REP-ADM-ERR-001 |
| `adminBountySkip.errors.spec.ts` | Gateway → unknown | ADM-003 | REP-ADM-ERR-001 |
| `adminVoid.errors.spec.ts` | Deterministic codes → failed | ADM-004 | REP-ADM-ERR-001 |
| `adminCatalogPending.contract.spec.ts` | Preview failure clear/Discard; publish refuses pending | ADM-008, ADM-009 | REP-CAT-LOCK-001, REP-CAT-PUB-001 |
| `catalogActivation.contract.spec.ts` | Preview-failure clears pending / discard UX | ADM-008 / CAT-001 | REP-CAT-LOCK-001 |
| `adminPendingKeys.contract.spec.ts` | signOut clears admin pending modules | ADM-006 | REP-ADM-SESS-001 |

Campaign baseline: **18 failed / 209 passed / 227 total** (`agent-2-admin-catalog/vitest-qa3a-results.json`).

### QA-3B achievements/Wrapped → repair groups

| Test file | Assertion theme | Defect IDs | REP-* |
|---|---|---|---|
| `achievementDefinitionAudit.spec.ts` | Frozen tags on launch catalog | ACH-001 | REP-ACH-FROZEN-001 |
| `achievementDefinitionAudit.spec.ts` | productionReleaseMapping covers FINAL 174 | ACH-003 | REP-ACH-MAP-001 |
| `gauntletLocationContract.spec.ts` | Gauntlet requires bar_id / excludes virtual | ACH-002 | REP-ACH-GAUNT-001 (unverified live) |
| `awardingAndCrossSystem.contract.spec.ts` | WrappedPhotoCard signed URL refresh | WRP-002 | REP-SIGNED-001 |
| `wrappedMetricsAndCarousel.spec.ts` | Achievements LB fields (11100 contract) | WRP-001 | REP-WRP-RANK-001 (config/migration) |

Campaign baseline: **5 failed / 26 passed / 31 total** (`agent-2-achievements-wrapped/vitest-qa3b-results.json`).

## Expected red — browser E2E / stress

| Suite | Key cases | REP-* | Status |
|---|---|---|---|
| QA-2A `scripts/qa2a/` | E2E-030, E2E-031 | REP-SIGNED-001, REP-MEDIA-001 | Expected red |
| QA-2A `scripts/qa2a/` | E2E-032 | REP-SUB-001 | **Covered by R1** (REL-001 guard + scavenger latch) |
| QA-2B `scripts/qa2b/` | E2B-S07 / E2B-001 | REP-SUB-001 | **Repaired (R1)** — focused repro + remint race on `:55321` |
| QA-2B `scripts/qa2b/` | E2B-L03, E2B-002 | REP-SIGNED-001, REP-CLAIM-001 | Expected red |

Requires disposable `:55321` + Playwright for full suite re-runs.

## Expected red — QA-4A live probes (not run in this assignment)

| Probe | Key defect repros | REP-* |
|---|---|---|
| `scripts/qa2a/probe/admin-catalog.mjs` | INT-CAT-001L, INT-ADM-*, INT-SCHED-001 | REP-CAT-LOCK-001, REP-ADM-ERR-001, REP-SCHED-001 |
| `scripts/qa2a/probe/achievements.mjs` | INT-ACH-001, INT-ACH-003 | REP-ACH-FROZEN-001, REP-ACH-MAP-001 |
| `scripts/qa2a/probe/wrapped-aggregation.mjs` | INT-WRP-002 (+ MO venue) | REP-WRP-RANK-001, REP-WRP-MO-001 |

Requires Agent 2 disposable `:56321`. Mutating — deferred.

## Expected red — QA-1 product (pre-existing)

| Case | Evidence | REP-* |
|---|---|---|
| DEF-QA1-001 bar preview reason | `QA1_DEFECTS.md` | REP-PREVIEW-001 |

## Previously passing baseline (must stay green)

- `npm run typecheck`
- `npm run build`
- `npm test` excluding intentional qa2/qa3a/qa3b defect contracts (or: legacy `tests/unit/*.spec.ts` outside those folders)
- `tests/unit/devEnvironmentGuard.spec.ts` (merged ports)
- `tests/unit/qaScenarioSafety.spec.ts`

## Requires disposable databases

| Work | Port | Notes |
|---|---|---|
| Integration / clock / scoring suites | `:55321` | Agent 1 disposable-mo |
| QA-2A / QA-2B browser | `:55321` | Prefer Agent 1 continuity |
| QA-4A probes | `:56321` | Agent 2 qa2-backend archive |

## Requires browser execution

QA-2A, QA-2B, historical phase e2e scripts under `scripts/e2e-*.mjs`.

## Remaining manual / device

Physical HEIC, pinch crop, Safari bfcache, ship-Wi-Fi soak, organizer config (dates/roster/teams) — see `REMAINING_TEST_COVERAGE.md`.
