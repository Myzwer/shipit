# ADMIN INTEGRATION — previously blocked QA-3A cases

**Migration state:** qa2 with 10900+11000+11100.  
**Evidence:** `evidence/probe-admin-catalog-integration-results.json`, `ADMIN_CATALOG_INTEGRATION_MATRIX.json`, vitest void/skip logs.

## QA3A-B001 … B014 outcomes

| ID | Result | Notes |
|---|---|---|
| B001 | **PASS** | `admin_publish_catalog_import` flips `active_catalog_pointer` only on full success; failure paths leave DB untouched |
| B002 | **PASS** (primary) / FAIL (blocked-live edge) | Rollback restores prior playable catalog as audited revision; one live-objective absence edge failed expectation |
| B003 | **PASS** | Apply-time shortage is fully atomic; evaluate pre-flight also blocks |
| B004 | **PASS** | Concurrent stage/publish + advisory lock proof |
| B005 | **PASS** | Add-drink vs publish interleave completes without corrupting active version |
| B006 | **BLOCKED** | Probe aborted mid-phase on SQL uuid `'undefined'` harness bug — not a product proof |
| B007 | **FAIL / defect** | Mobile Order eligibility + CAT-002 server path issues — see INT-CAT-006 |
| B008 | **PASS** (design) + **FAIL** (ops) | Crew day lock after first ensure is intentional; opening Admin list **mutates** and locks — INT-CRW-001 |
| B009 | **FAIL** (ADM live) | ADM-001 / ADM-002 reproduced against real Edge + ledger — INT-ADM-001L / INT-ADM-002L |
| B010 | **PASS** | Aborted HTTP: server applied 8/8; retries never double-applied |
| B011 | **FAIL / documented** | Set Ship Time past finale latches irreversibly; backend has no confirmation gate — INT-CLK-001 (UI-guard-only product risk) |
| B012 | **FAIL / gap** | No production/admin first-schedule generator — INT-SCHED-001 |
| B013 | **PASS** | Achievement progress + awards survive catalog replace publish |
| B014 | **BLOCKED** | Organizer sacred — cruise id read-only check only |

## ADM-001 … ADM-009 live consequences

| ID | Backend state impact | Frontend / client impact | Live ID |
|---|---|---|---|
| ADM-001 | Ledger correctly `in_progress` | `reconcileAuthRequest` → `failed`, clears pending | INT-ADM-001L |
| ADM-002 | Edge 409 while in progress | Mapped to `failed` | INT-ADM-002L |
| ADM-003 | Skip **applied** then forged 502 | Client reports `failed` | INT-ADM-003L |
| ADM-004 | Narrowed: FINALE/NOT_FOUND OK; malformed UUID → unknown lock | INT-ADM-004L |
| ADM-005 | Backend clock idempotent | Frontend-only catch gap (INFO) | — |
| ADM-006 | Backend tokens fine | Frontend pending survives sign-out (INFO) | — |
| ADM-007 | Backend still authorizes zero-game admin | Router locks out `/admin` | INT-ADM-007L |
| ADM-008 / CAT-001 | Candidate staged; backend recoverable | Pending publish stuck on stage request id | INT-CAT-001L |
| ADM-009 | Second publish can succeed server-side | UI shows failure; loses reconcile handle | INT-ADM-009L |

## Vitest

- Catalog publish suite: **22/23** passed (1 fail: manual overlay `admin_added` flag).
- Roster suite: **3 fails** under demo-only Auth because migration `10100` excludes Demo aliases from `admin_list_roster` / Demo teams from `admin_list_teams` — expected with synthetic Demo fixtures; Edge create of non-demo guests restores visibility.
- Void + admin skip: **15 passed** after clock reset.
- Pause suite: skipped when prior suite latched finale in same vitest process; abort/reconcile covered by B010 probe.
