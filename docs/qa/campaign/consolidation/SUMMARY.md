# QA Consolidation — Executive Summary

**Generated:** 2026-11-14  
**Role:** Lead QA consolidation (planning only — no application repairs)  
**Goal:** One trustworthy repair plan covering every issue discovered across both QA agents.

## Verified worktree state

Verified with `git worktree list` and read-only inspection of both trees (not assumed from chat history).

| Worktree | Path | Branch | Tip | Role |
|---|---|---|---|---|
| Main | `Ship It` | `visual/drinkit-home-v1` | consolidation docs atop `fcb699f` | Repair home; QA-2B evidence tip = `fcb699f` |
| Agent 2 | `Ship-It-qa2-reliability` | `test/qa2-reliability` | `f4c1dce` | QA-2 / QA-3A / QA-3B / QA-4A evidence archive |
| Disposable (Agent 1) | `Ship-It-disposable-mo` | `test/disposable-mo-activity` | `544b703` | Not mutated this assignment |

Merge-base of main ↔ Agent 2: `5a95c98` (QA-0 foundation). Agent 2 tip has **no `src/` application diffs** vs merge-base — only diagnostic tests, probes, reports, and a small guard/config delta.

**Safety held:** No merges, cherry-picks, app edits, pushes, deploys, or Supabase mutations (`:54321` / `:55321` / `:56321`). Failing tests, reports, screenshots, and local fixtures preserved.

## Campaigns reviewed (evidence-based)

| Campaign | Location | Primary defect prefixes |
|---|---|---|
| QA-0 / QA-0.5 | Main `docs/qa/campaign/` baseline, safety, inventory, initial results | Config/safety (no product DEF IDs) |
| QA-1 | Main `QA1_*` + `qa1-results/` | `DEF-QA1-*`, harness |
| QA-2 | Agent 2 `agent-2-reliability/` | `REL-*` |
| QA-2A | Main `qa2a-browser-e2e/` | `E2E-*` |
| QA-2B | Main `qa2b-browser-stress/` | `E2B-*` |
| QA-3A | Agent 2 `agent-2-admin-catalog/` | `ADM-*`, `CAT-*` |
| QA-3B | Agent 2 `agent-2-achievements-wrapped/` | `ACH-*`, `WRP-*` |
| QA-4A | Agent 2 `agent-2-backend-integration/` | `INT-*` |

## Counts (authoritative)

| Metric | Count |
|---|---:|
| Original defect IDs reviewed (filed IDs across campaigns) | **54** |
| Unique confirmed repair groups (`REP-*`) | **24** |
| Must-repair-before-cruise groups | **10** |
| Should-repair-if-practical groups | **10** |
| Cosmetic / optional / decide groups | **4** |
| P0 groups (reassessed cruise-blocking) | **3** |
| P1 groups | **7** |
| P2 groups | **10** |
| P3 groups | **4** |
| Duplicate / live-confirmation aliases (disposition only) | **18** |
| Harness-only findings | **4** |
| Configuration / migration requirements | **10** |
| Unverified risks retained | **3** |
| Open verification gaps (blocked/not-run families) | **47+** |

Full tallies and dispositions: [`DEFECT_DISPOSITION.md`](./DEFECT_DISPOSITION.md), [`MASTER_DEFECT_REGISTER.md`](./MASTER_DEFECT_REGISTER.md).

## Highest cruise impact (must repair)

1. **Duplicate accepted drink logs on navigate-away** — `E2B-001` (disposable-authoritative). Can silently inflate scores on flaky Wi-Fi.
2. **No production first bounty-schedule path** — `INT-SCHED-001`. Catalog publish alone cannot bootstrap Day-1 automation.
3. **Catalog Admin UI lock after stage→preview failure** — `ADM-008` / `CAT-001` / `INT-CAT-001L`. Blocks menu activation without clearing site storage.
4. **Migration `11100` fixes Wrapped achievement counts but breaks ranks** — `INT-WRP-002`. Do not apply `11100` to organizer until rank fix ships.
5. **Gallery / Wrapped signed URLs never refresh** — `REL-008` / `E2E-030` / `E2B-L03` / `WRP-002`. Broken photos after ~1h / backgrounded tabs.
6. **Photo cancel / discard / remount retry failures** — `REL-003/004/005/007`. Orphans, unfinished aborts, empty-blob upload risk.
7. **Admin false-failed reconcile + self-lockout** — `ADM-001/002/007` (+ live). Operator can strand Auth ops or lock out of `/admin`.
8. **Achievement production release map incomplete** — `ACH-003` / `INT-ACH-003`. Activation would miss 37 FINAL defs.
9. **Frozen achievements unreachable on launch catalog** — `ACH-001` / `INT-ACH-001`. Content gap (engine OK when tags exist).

## Proposed repair batches (priority order)

| Order | Batch | Theme | Cruise class |
|---|---|---|---|
| 1 | **R1** | Submission integrity (dup accepts + in-flight guards) | Must |
| 2 | **R2** | Media pipeline (abandon, AbortSignal, empty-blob) | Must |
| 3 | **R3** | Signed-URL refresh (Gallery + Wrapped) | Must |
| 4 | **R4** | Admin pending / error classification / lockout / catalog pending | Must |
| 5 | **R5** | Production first schedule + catalog publish guards | Must |
| 6 | **R6** | Wrapped `11100` rank fix (+ MO venue exclusion) | Must before organizer `11100` |
| 7 | **R7** | Achievements release map + frozen tags / eligibility content | Must for full FINAL set |
| 8 | **R8** | Lower-priority polish (preview reason, GIF MIME, JWT residual, crew mutate UX, E2B-002 triage) | Should / optional |

Details: [`REPAIR_PRIORITY_AND_BATCHES.md`](./REPAIR_PRIORITY_AND_BATCHES.md), blockers: [`LAUNCH_BLOCKERS.md`](./LAUNCH_BLOCKERS.md).

## Parallelism recommendation

Two worktrees can run **R3 ∥ R4** or **R6 ∥ R7** after diagnostic tests are integrated, because ownership is genuinely disjoint (signed-URL Vue vs Admin libs; SQL migration vs content JSON).

**Do not parallel R1 with R2** (shared submit/photo Vue). **Do not parallel R4 with R5** (catalog pending + publish/schedule).

## Worktree integration (executed)

Path-scoped import of Agent 2 commits `bc43834…f4c1dce` **tests + reports + probes only** onto `visual/drinkit-home-v1`. Probes relocated to `scripts/qa2a/probe/`; `devEnvironmentGuard` hand-merged (organizer protections preserved + `:56321` allowed). See [`WORKTREE_INTEGRATION_PLAN.md`](./WORKTREE_INTEGRATION_PLAN.md), [`KNOWN_FAILURE_MANIFEST.md`](./KNOWN_FAILURE_MANIFEST.md), [`REPAIR_EXECUTION_MATRIX.md`](./REPAIR_EXECUTION_MATRIX.md).

## Important unresolved decisions

1. **ACH-002:** Mobile Order gauntlet leak **not reproduced** live (QA-4A). Static contract still expects `bar_id` / `is_virtual` guards — retain as **unverified wrong-physical-bar risk**, not an open MO scoring defect.
2. **DEF-QA1-001:** Product short-circuit vs stricter companion-reason contract — needs product decision (P3).
3. **E2B-002:** Stress “success without `claimed_categories`” may be fixture exhaustion — triage after isolated bounty fixtures, not speculative rewrite.
4. **Organizer migrations `10900/11000/11100`:** Apply only after snapshot + R6 rank fix for `11100`.
5. **Production schedule RPC design:** New admin/prod path vs controlled ops service_role run — product/ops choice for `INT-SCHED-001`.

## Deliverables in this folder

1. `SUMMARY.md` (this file)
2. `MASTER_DEFECT_REGISTER.md`
3. `MASTER_DEFECT_REGISTER.json`
4. `DEFECT_DISPOSITION.md`
5. `REPAIR_PRIORITY_AND_BATCHES.md`
6. `REMAINING_TEST_COVERAGE.md`
7. `WORKTREE_INTEGRATION_PLAN.md`
8. `LAUNCH_BLOCKERS.md`
9. `KNOWN_FAILURE_MANIFEST.md`
10. `REPAIR_EXECUTION_MATRIX.md`
