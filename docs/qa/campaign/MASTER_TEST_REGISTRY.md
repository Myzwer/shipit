# Master test registry (Assignment 1 seed)

Status values: `not_run` | `passed` | `failed` | `blocked`  
Method: `unit` | `integration` | `e2e` | `simulated_lifecycle` | `manual_device`  
Risk: `critical` | `high` | `medium` | `low`

Machine-readable twin: [master-test-registry.json](./master-test-registry.json)

## Lifecycle & clock

| ID | Feature | Expected | Preconditions | Method | Fixture/env | Risk | Status | Evidence |
|---|---|---|---|---|---|---|---|---|
| QA-LC-001 | Pre-cruise blocks gameplay routes | Deep links to home/log/gallery redirect while `pre_cruise` | Auth + pre_cruise clock | integration + unit router | disposable | critical | not_run | `tests/unit/router.spec.ts` (partial); needs disposable lifecycle |
| QA-LC-002 | Shared 00:00 Day1 open | Both games unlock together at Day1 00:00 ship-local | Disposable clock seed | integration | disposable | critical | **passed** | `clock.precruise_opening.test.ts` on disposable |
| QA-LC-003 | Active accepts submissions | `evaluate_submission_acceptance` ok in window | active lifecycle | integration | disposable | critical | not_run | clock/bounty suites |
| QA-LC-004 | Friday 6PM inclusive cutoff | At finale instant → finale; no claims | Day7 18:00 | integration | disposable | critical | **passed** | phase2da Friday override on disposable |
| QA-LC-005 | Pause blocks Cocktail/Ingredient exposure | Pause before open leaves unexposed | Admin pause | integration | disposable | high | not_run | bounty pause suites |
| QA-LC-006 | Manual clock correction reconcile | Idempotent request_id; fingerprint | Admin | integration | disposable | high | not_run | `test:clock` |
| QA-LC-007 | Stale client after finale | Client cannot submit after latch | final | e2e | disposable wrapped seed | high | not_run | |

\*blocked on organizer; executable on disposable.

## Grace period (cocktail/ingredient)

| ID | Feature | Expected | Method | Status | Evidence |
|---|---|---|---|---|---|
| QA-GR-001 | Grace category scope | Only cocktail+ingredient | unit | **passed** | `tests/unit/bountyGraceContract.spec.ts` |
| QA-GR-002 | Half-open +0 / +14:59 / +15:00 | Eligible, eligible, ineligible | unit + integration | **passed** | unit + disposable `bounty.phase2da.schedule.test.ts` |
| QA-GR-003 | Grace never on Home public payload | No `grace_previous` in player get_my_* | integration | **passed** | disposable phase2da |
| QA-GR-004 | Friday overrides grace | At 18:00 Day7 no grace | integration | **passed** | disposable phase2da |
| QA-GR-005 | Bar/Daily have no grace | Claims reject after public end | integration | not_run | |

## Drink It! scoring

| ID | Feature | Risk | Status | Evidence / gap |
|---|---|---|---|---|
| QA-DI-001 | Solo ordinary log 0 pts | high | not_run | `scoring.phase3a.submit.test.ts` |
| QA-DI-002 | Cocktail claim + companion | critical | not_run | |
| QA-DI-003 | Ingredient 2h rotation | high | not_run | |
| QA-DI-004 | One claim/category/day | critical | not_run | |
| QA-DI-005 | Overlap choose one | high | not_run | |
| QA-DI-006 | Bar crew 20/30/40 lock | critical | not_run | crew phase B2/B4 |
| QA-DI-007 | Bar requires crewmate present | critical | not_run | |
| QA-DI-008 | Daily All Hands attest required | critical | not_run | `drinkit.pc1.dailyAttest.test.ts` |
| QA-DI-009 | Daily late upload after meetup allowed | high | not_run | honor rule |
| QA-DI-010 | Bring a Friend companion rule | high | not_run | |
| QA-DI-011 | Idempotent drink submit | critical | not_run | |
| QA-DI-012 | Interrupted/retry recovery | high | not_run | pending helpers + e2e |

## Ship It!

| ID | Feature | Risk | Status | Evidence |
|---|---|---|---|---|
| QA-SI-001 | 50 challenges photo-required | high | not_run | phase4a/4b |
| QA-SI-002 | One score per team/challenge | critical | not_run | |
| QA-SI-003 | First-to-reach-score tiebreak | critical | not_run | `shipit.pc1.scoreReachedRanking.test.ts` |
| QA-SI-004 | Submitter-in-photo honor copy | medium | not_run | UI |
| QA-SI-005 | Void recomputes ranking | high | not_run | |

## Auth / roster / Admin

| ID | Feature | Risk | Status |
|---|---|---|---|
| QA-AD-001 | Non-admin denied Admin RPCs | critical | not_run |
| QA-AD-002 | Roster create/reset via Edge | high | not_run |
| QA-AD-003 | Self-lockout prevention | high | not_run |
| QA-AD-004 | Void preview + apply | critical | not_run |
| QA-AD-005 | Bounty skip reserve exhaustion | medium | not_run |
| QA-AD-006 | Catalog publish/rollback | high | not_run |
| QA-AD-007 | Daily announcement CRUD | medium | not_run |

## Media / Gallery / Achievements / Wrapped

| ID | Feature | Risk | Status | Notes |
|---|---|---|---|---|
| QA-ME-001 | Crop pinch/drag end-to-end | high | not_run | Director open item |
| QA-ME-002 | Signed URL gallery load | high | not_run | |
| QA-ME-003 | Reactions | medium | not_run | |
| QA-ACH-001 | 174 enabled definitions | high | not_run | catalog unit partial |
| QA-ACH-002 | Secret reveal only when earned (Gallery) | high | not_run | |
| QA-ACH-003 | Gauntlet + Good Spirits price gate | high | not_run | **C** pricing evidence |
| QA-WR-001 | 80 All Stats provenance | critical | not_run | QA-3 |
| QA-WR-002 | Featured eligibility thresholds | high | not_run | full fixture vs Scenario C |
| QA-WR-003 | Post-finale footer Admin/Logout | medium | not_run | |

## Mobile Order / activity day (pending organizer)

| ID | Feature | Status | Notes |
|---|---|---|---|
| QA-MO-001 | Virtual source last; no venue credit | blocked on organizer; disposable ready | `10900` |
| QA-ADAY-001 | 05:00 reporting boundary | blocked on organizer; disposable ready | `11000` |

## Harness / safety

| ID | Feature | Status | Evidence |
|---|---|---|---|
| QA-SAFE-001 | QA scenario confirm-env hard block | **passed** | `qaScenarioSafety.spec.ts` |
| QA-SAFE-002 | Refuse non-local hosts | **passed** | same |
| QA-SAFE-003 | Refuse final fixture mutation | **passed** (unit helpers) | `devEnvironmentGuard.spec.ts` + guard code |
| QA-SAFE-004 | Refuse :54321 without override | **passed** (code path) | guard; integration attempt from main should throw |
