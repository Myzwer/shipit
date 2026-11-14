# SUMMARY — QA-3A Agent 2 → Development / QA Director

**Mission:** Exhaustive diagnostic testing of Admin controls and catalog import/activation reliability before cruise.  
**Worktree / branch:** `Ship-It-qa2-reliability` / `test/qa2-reliability`  
**QA-2 checkpoint commit:** `bc43834` (`:white_check_mark: Checkpoint QA-2 reliability artifacts`) — preserved; failed REL tests not weakened.  
**Isolation held:** No mutations to `:54321` or `:55321`. No Docker changes. No app source repairs. No push/merge.

## Counts

| Metric | Value |
|---|---|
| Meaningful cases (executed + blocked) | **241** |
| Executed | **227** |
| Passed | **209** |
| Failed | **18** (map to confirmed `ADM-*` / `CAT-*`) |
| Blocked integration | **14** |
| Confirmed P0 | **0** |
| Confirmed P1 | **7 themes** (ADM-001, 002, 003, 004, 005, 007, 008/CAT-001) |
| Confirmed P2 | **3** (ADM-006, ADM-009, CAT-002) |
| Confirmed P3 | **0** |

## Top cruise-ops risks

1. **Catalog import can lock the Admin UI** (ADM-008 / CAT-001) after stage succeeds and server preview fails — Stage/file/paste disabled; Check Status looks up a publish id that was never written. Blocks activating the real onboard menu without clearing site storage.
2. **Roster Check Status lies during in-flight Auth** (ADM-001 / ADM-002) — `in_progress` / 409 mapped to `failed`, clearing pending while create/reset may still complete.
3. **Admin can self-lock out of `/admin`** (ADM-007) by removing all game enrollments; empty-games redirect runs before `requiresAdmin`.
4. **Ship Clock confirm has no catch** (ADM-005) after pending write — contingency time fixes can brick the clock panel.
5. **Skip/Void error classification** (ADM-003 / ADM-004) — gateway vs deterministic errors mishandled → wrong pending clear or stuck Retry under ship Wi-Fi / finale.

## Executed vs mocked vs inspected

| Kind | What |
|---|---|
| Real production code | `previewCatalogImport`, readiness gates, launch-candidate JSON, Admin Vue/lib source contracts |
| Mocked | Supabase RPC / Edge invoke for roster, void, bounty skip, clock apply characterization |
| Inspected | Migrations (publish/rollback/crews/Mobile Order), Edge `admin-roster`, finale latch design |
| Not claimed | Live transactional publish, rollback, Auth provisioning, organizer config verification |

## Catalog readiness (diagnostic)

- Client validation is **strong** against hostile/invalid JSON (105+ hostile cases green).
- `launch-candidate-v1.json` is **client-ready to stage**.
- Activation **does not require a website redeploy** (DB pointer) — by design.
- **First bounty schedule has no production Admin generator** (dev-only RPC) — autonomy blocker.
- Mobile Order exclusion is **DB-enforced**; catalog JSON can still name `mobile-order` (CAT-002).

## Configuration (see CONFIGURATION_AUDIT.md)

Still missing organizer inputs: production voyage dates/offset, production roster Auth, Ship It! team rows/labels, meetup free-text, optional Mobile Order menu table.  
Class-5 autonomy blockers: `cruise_config`, teams, first schedule path, admin self-lockout.

## Application source modified?

**No.** Only new tests under `tests/unit/qa3a-admin-catalog/` and reports under `docs/qa/campaign/agent-2-admin-catalog/`.

## QA-2 private data review

Scanned prior artifacts before checkpoint: no passwords, JWTs, service_role keys, or `.env` contents. `.env` remains gitignored. Nothing excluded for privacy.

## Deliverables

- `ADMIN_REPORT.md`
- `CATALOG_REPORT.md`
- `CONFIGURATION_AUDIT.md`
- `DEFECTS.md`
- `TEST_REGISTRY.json`
- `BLOCKED_INTEGRATION_TESTS.md`
- `SUMMARY.md`
- `vitest-qa3a-run.txt` / `vitest-qa3a-results.json`

## Recommended fix order (later — not done here)

1. CAT-001 / ADM-008 catalog pending clear + Discard  
2. ADM-001 / ADM-002 roster in_progress / 409 → unknown  
3. ADM-007 admin route exemption for empty games  
4. ADM-005 ShipClock `catch` + recovery UI  
5. ADM-003 / ADM-004 skip/void error classification  
6. ADM-006 sign-out clears admin pending  
7. ADM-009 publish pending guard; CAT-002 reject `mobile-order` in import  

**Do not begin repairs, merge, or deploy from this assignment.**
