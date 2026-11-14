# Master test registry (QA-0 seed + QA-1 results)

Status values: `not_run` | `passed` | `failed` | `blocked` | `partial`  
Method: `unit` | `integration` | `e2e` | `simulated_lifecycle` | `manual_device`  
Risk: `critical` | `high` | `medium` | `low`

Machine-readable twin: [master-test-registry.json](./master-test-registry.json)  
QA-1 index: [QA1_EXECUTION_SUMMARY.md](./QA1_EXECUTION_SUMMARY.md) · defects: [QA1_DEFECTS.md](./QA1_DEFECTS.md)

## Lifecycle & clock

| ID | Feature | Expected | Method | Fixture/env | Risk | Status | Evidence |
|---|---|---|---|---|---|---|---|
| QA-LC-001 | Pre-cruise blocks gameplay | Claims/routes blocked before open | integration | disposable | critical | **passed** | `clock.precruise_opening.test.ts` (+ router unit partial) |
| QA-LC-002 | Shared 00:00 Day1 open | Both games unlock together | integration | disposable | critical | **passed** | precruise opening |
| QA-LC-003 | Active accepts submissions | Acceptance ok in window | integration | disposable | critical | **passed** | scoring + bounty + clock |
| QA-LC-004 | Friday 6PM inclusive cutoff | Finale; no claims | integration | disposable | critical | **passed** | phase2da Friday / clock finale |
| QA-LC-005 | Pause blocks Cocktail/Ingredient exposure | Unexposed while paused | integration | disposable | high | **passed** | `bounty.phase2db2_1.pause` |
| QA-LC-006 | Manual clock correction reconcile | Idempotent request_id; fingerprint | integration | disposable | high | **passed** | clock phase2a/2b1 |
| QA-LC-007 | Stale client after finale | Cannot submit after latch | e2e | disposable | high | **not_run** | backend latch passed; browser E2E deferred |
| QA-LC-008 | Voyage progresses with zero browsers | Server clock alone sufficient | simulated_lifecycle | disposable | critical | **passed** | RPC-driven suites (see lifecycle results) |

## Grace period (cocktail/ingredient)

| ID | Feature | Method | Status | Evidence |
|---|---|---|---|---|
| QA-GR-001 | Grace category scope | unit | **passed** | `bountyGraceContract.spec.ts` |
| QA-GR-002 | Half-open +0 / +14:59 / +15:00 | unit + integration | **passed** | unit + phase2da |
| QA-GR-003 | Grace never on Home public payload | integration | **passed** | phase2da |
| QA-GR-004 | Friday overrides grace | integration | **passed** | phase2da |
| QA-GR-005 | Bar/Daily have no grace | integration | **passed** | crew/daily + schedule closeout |

## Drink It! scoring / bounties / daily

| ID | Feature | Risk | Status | Evidence / notes |
|---|---|---|---|---|
| QA-DI-001 | Solo ordinary log 0 pts | high | **passed** | scoring.phase3a |
| QA-DI-002 | Cocktail claim + companion | critical | **passed** | scoring + bounty |
| QA-DI-003 | Ingredient 2h rotation | high | **passed** | bounty schedule |
| QA-DI-004 | One claim/category/day | critical | **passed** | scoring / B2 |
| QA-DI-005 | Cross-category overlap | high | **passed** | scoring |
| QA-DI-006 | Bar crew 20/30/40 lock | critical | **passed** | B2/B4 (`batch-f-b2b4-fixed`) |
| QA-DI-007 | Bar requires crewmate present | critical | **passed** | B2/B4 |
| QA-DI-008 | Daily All Hands attest required | critical | **passed** | `drinkit.pc1.dailyAttest` |
| QA-DI-009 | Daily late upload after meetup | high | **passed** | daily C1 / attest |
| QA-DI-010 | Bring a Friend companion rule | high | **passed** | buddyAndSchedule |
| QA-DI-011 | Idempotent drink submit | critical | **passed** | scoring / MO / B2 |
| QA-DI-012 | Interrupted/retry recovery | high | **partial** | RPC idempotency passed; browser lost-ack E2E deferred |
| QA-DI-013 | Bar preview reason when cocktail≠featured | medium | **failed** | **DEF-QA1-001** — `not_featured_bar` vs companion reason |

## Ship It!

| ID | Feature | Risk | Status | Evidence |
|---|---|---|---|---|
| QA-SI-001 | Challenges photo-required / catalog | high | **partial** | phase4a/4b2 — not all 50 individually submitted |
| QA-SI-002 | One score per team/challenge | critical | **passed** | phase4b2 |
| QA-SI-003 | First-to-reach-score tiebreak | critical | **passed** | `shipit.pc1.scoreReachedRanking` |
| QA-SI-004 | Submitter-in-photo honor copy | medium | **not_run** | UI E2E |
| QA-SI-005 | Void recomputes ranking | high | **passed** | `admin.phase5b.void` |

## Auth / roster / Admin

| ID | Feature | Risk | Status | Notes |
|---|---|---|---|---|
| QA-AD-001 | Non-admin denied Admin RPCs | critical | **partial** | clock security + void auth paths; full Admin matrix later |
| QA-AD-002 | Roster create/reset via Edge | high | **not_run** | QA-2+ |
| QA-AD-003 | Self-lockout prevention | high | **not_run** | |
| QA-AD-004 | Void preview + apply | critical | **passed** | phase5b |
| QA-AD-005 | Bounty skip reserve exhaustion | medium | **not_run** | |
| QA-AD-006 | Catalog publish/rollback | high | **not_run** | |
| QA-AD-007 | Daily announcement CRUD | medium | **not_run** | |

## Media / Gallery / Achievements / Wrapped

| ID | Feature | Risk | Status | Notes |
|---|---|---|---|---|
| QA-ME-001 | Crop pinch/drag end-to-end | high | **not_run** | Director open item |
| QA-ME-002 | Signed URL gallery load | high | **not_run** | |
| QA-ME-003 | Reactions | medium | **not_run** | |
| QA-ACH-001 | 174 enabled definitions | high | **not_run** | |
| QA-ACH-002 | Secret reveal only when earned | high | **not_run** | |
| QA-ACH-003 | Gauntlet + Good Spirits price gate | high | **not_run** | |
| QA-WR-001 | 80 All Stats provenance | critical | **not_run** | QA-3 |
| QA-WR-002 | Featured eligibility thresholds | high | **not_run** | |
| QA-WR-003 | Post-finale footer Admin/Logout | medium | **not_run** | |
| QA-WR-004 | Migration 11100 LB achievements field | low | **blocked** | not applied on disposable/organizer |

## Mobile Order / activity day

| ID | Feature | Status | Evidence |
|---|---|---|---|
| QA-MO-001 | Virtual source last; no venue/bounty credit | **passed** | `drinkit.mobileOrder.test.ts` on disposable |
| QA-ADAY-001 | 05:00 reporting boundary | **passed** | `activityDay.reporting.test.ts` |

## Harness / safety

| ID | Feature | Status | Evidence |
|---|---|---|---|
| QA-SAFE-001 | QA scenario confirm-env hard block | **passed** | `qaScenarioSafety.spec.ts` |
| QA-SAFE-002 | Refuse non-local hosts | **passed** | same |
| QA-SAFE-003 | Refuse final fixture mutation | **passed** | `devEnvironmentGuard` |
| QA-SAFE-004 | Refuse :54321 without override | **passed** | guard; organizer remains final post-QA-1 |
