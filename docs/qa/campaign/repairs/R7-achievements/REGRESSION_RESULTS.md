# R7 — Regression results

## Before (baseline `cae8cfe`, expected red)

| Test | Result |
|---|---|
| `achievementDefinitionAudit` ACH-001 frozen tags | **FAIL** |
| `achievementDefinitionAudit` ACH-003 map 174 | **FAIL** |
| `gauntletLocationContract` ACH-002 (read 08600/09200) | **FAIL** |

## After repairs

### Unit / build

| Suite | Result |
|---|---|
| `tests/unit/qa3b-achievements-wrapped/achievementDefinitionAudit.spec.ts` | **PASS** (7) |
| `tests/unit/qa3b-achievements-wrapped/gauntletLocationContract.spec.ts` | **PASS** (4) |
| `awardingAndCrossSystem.contract.spec.ts` | PASS (WRP-002 signed URL from R3) |
| `wrappedMetricsAndCarousel.spec.ts` WRP-001 | **FAIL** — organizer/Agent1 lack migration 11100 (**R6**, out of scope) |
| `achievementConditions`, `composeAchievementsView`, `finalAchievementCatalog`, `stageA3.workingAchievements`, `galleryAchievementVisibility` | **28/28 PASS** |
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |

### QA-4A achievements probe (`:56321`)

Evidence: `probe-achievements-run.txt`, `probe-achievements-results.json`

| ID | Status | Notes |
|---|---|---|
| ACH-DEFS-174 | PASS | 126 + 48 enabled after qa2 reload |
| INT-ACH-01 | FAIL | Expected d001+d080; also awarded d076 Come Sail Away (cruise **day 1** clock) — probe strictness, not map/frozen regression |
| INT-ACH-02..06 (+ gallery, void, restore, double-void, idempotent) | PASS | |
| ACH-001-ACTIVE-CATALOG | FAIL | Active DB catalog = schedule fixture without frozen drink/tags |
| ACH-001-WHATIF | BLOCKED | No tropical candidates on fixture |
| ACH-002-* (physical, MO, wrong bar, virtual) | **PASS** | |
| ACH-003-PRODUCTION-MAP | **PASS** | 164 reachable / 10 blocked / **0 missing** |
| ACH-003-ENGINE-REACHABILITY | FAIL | Fixture catalog missing most classification tags vs launch JSON |
| ORGANIZER-CRUISE-UNCHANGED | PASS | `48fa40c6-…` |

### Earned-award coverage claim

**Not** claiming 174 earned-award proofs. This run executed award proofs for the probe sequence (~16 real working keys) plus gauntlet physical completion. Definition/map consistency is separately validated for all 174.

### R1–R5 touchpoints

- Submission finalize → achievement eval path exercised via INT-ACH-* accepts/voids.
- No R6 Wrapped SQL touched.
- Migration **11400** applied **only** to `supabase_db_star-princess-qa2-backend`. **11300** unused (reserved R6). Combined R6/R7 migration testing deferred.
