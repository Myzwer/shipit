# BLOCKED_INTEGRATION_TESTS — QA-3A Agent 2

These cases are required to **prove** Admin mutations, catalog activation transaction safety, and rollback.  
They were **not** executed because Agent 2 must not mutate organizer `:54321`, Agent 1 disposable `:55321`, or shared Docker, and no separately verified isolated Supabase was provisioned for this assignment.

| ID | Proof needed | Why blocked | Suggested isolated approach |
|---|---|---|---|
| QA3A-B001 | `admin_publish_catalog_import` flips `active_catalog_pointer` only on full success | Mutating | Fresh disposable stack + `development-only` cruise |
| QA3A-B002 | `admin_rollback_catalog` restores playable catalog; history intact | Mutating | Same; chain publish→rollback→publish |
| QA3A-B003 | `REMAINING_POOL_SHORTAGE` raises inside apply → full rollback including ledger | Mutating | Craft catalog that stages but fails apply mid-flight |
| QA3A-B004 | Concurrent stage/publish same `catalog_id` | Mutating / race | Parallel clients + advisory lock asserts |
| QA3A-B005 | Add Drink vs publish race (overlay on retired version) | Mutating / race | Interleaved RPCs under load |
| QA3A-B006 | Direct RPC bypass of TS-only validation via crafted `p_validation` | Mutating / authz | Authenticated admin JWT against disposable |
| QA3A-B007 | Mobile Order live `virtual_order_source` on Cocktail + Ingredient; Bar Bounty mismatch | Eligibility | Disposable with `10900`/`11000` applied |
| QA3A-B008 | `admin_list_bar_bounty_crews` permanently locks day crews | Mutating read | Disposable; open Admin Drink It! tab before/after roster change |
| QA3A-B009 | Roster Edge create/reset lease, Check Status during `in_progress` (ADM-001/002 live) | Auth mutating | Disposable Auth + Edge function |
| QA3A-B010 | Void / skip / pause reconcile under aborted HTTP | Mutating | Disposable + forced transport aborts |
| QA3A-B011 | Set Ship Time past finale latches irreversibly | Clock mutate | Coordinate — do **not** duplicate Agent 1 clock authority suite; UI guard only |
| QA3A-B012 | Production first bounty schedule without `dev_generate_bounty_schedule` | Missing prod path | Product/ops decision; may need new RPC |
| QA3A-B013 | Achievement progress across catalog replace | Mutating | Re-run `achievements.phaseA1.catalogReplace` on disposable |
| QA3A-B014 | Organizer production `cruise_config`, roster, teams, active catalog version | Organizer sacred | Read-only ops checklist after snapshot approval — not Agent 2 |

## Existing integration suites (not re-run here)

Present in repo for later disposable execution:

- `tests/integration/admin.phase6b2.catalog_publish.test.ts`
- `tests/integration/admin.phase6b2.manual_offering_safety.test.ts`
- `tests/integration/admin.phase6a.roster.test.ts` (and related)
- `tests/integration/admin.phase5b.void*.ts` / fingerprint
- `tests/integration/bounty.phase2db2_1.pause.test.ts`
- `tests/integration/bounty.phase3cb.admin_skip.test.ts`
- `tests/integration/drinkit.mobileOrder.test.ts`
- `tests/integration/achievements.phaseA1.catalogReplace.test.ts`

Safety: use `tests/helpers/devEnvironmentGuard.ts` / `assertDisposableDevEnvironment` before any mutating suite.
