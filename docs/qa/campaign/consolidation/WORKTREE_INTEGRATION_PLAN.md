# Worktree Integration Plan

**Status:** Executed on `visual/drinkit-home-v1` (path-scoped diagnostics import). Agent 2 archive worktree left at `f4c1dce` undisturbed.

## Verified topology

| Role | Path | Branch | Tip |
|---|---|---|---|
| Repair home | `…/Ship It` | `visual/drinkit-home-v1` | consolidation docs on top of QA-2B `fcb699f` |
| Diagnostic source | `…/Ship-It-qa2-reliability` | `test/qa2-reliability` | `f4c1dce` (QA-4A) |
| Agent 1 disposable | `…/Ship-It-disposable-mo` | `test/disposable-mo-activity` | `544b703` |

```
5a95c98  QA-0 foundation (merge-base)
   ├─ main: 94fa2e5 QA-1 → 5027089 QA-2A → fcb699f QA-2B → (consolidation docs only)
   └─ agent2: bc43834 QA-2 REL → 410a9f8 QA-3A → 2572d0b QA-3B → f4c1dce QA-4A
```

Integrate diagnostics from `f4c1dce` onto a branch cut from the **QA-2B evidence tip** `fcb699f` (or current main after consolidation docs), not by merging the full Agent 2 branch blindly.

Agent 2 tip contains **no `src/` application diffs** vs merge-base. Safe to treat as **tests + docs + probes (+ minor guard/config)**.

## What to bring onto the repair branch

### Include (diagnostic value)

From Agent 2 commits `bc43834` … `f4c1dce`:

| Path pattern | Purpose |
|---|---|
| `docs/qa/campaign/agent-2-*/**` | Full Agent 2 campaign evidence |
| `tests/unit/qa2-reliability/**` | REL contracts |
| `tests/unit/qa3a-admin-catalog/**` | ADM/CAT contracts |
| `tests/unit/qa3b-achievements-wrapped/**` | ACH/WRP contracts |
| `scripts/qa2a/probe-*.mjs` | Live integration probes |
| `scripts/qa2a/lib.mjs` | Probe shared lib (**name conflict — see below**) |
| `scripts/qa2a/probe-roster-and-mo.mjs` | Roster/MO helper |

### Review carefully before include

| Path | Risk |
|---|---|
| `tests/helpers/devEnvironmentGuard.ts` | **Both branches edited** — merge manually; keep main’s organizer protections + Agent 2 disposable/qa2 port allowances |
| `tests/unit/devEnvironmentGuard.spec.ts` | Same |
| `supabase/config.toml` | Agent 2 may encode `:56321` stack — **do not overwrite organizer ports**; prefer docs-only note of qa2 ports |

### Exclude / do not overwrite

| Path | Reason |
|---|---|
| Main `docs/qa/campaign/qa1-*`, `qa2a-*`, `qa2b-*` | Authoritative Agent 1 evidence |
| Main `scripts/qa2a/lib/browser.mjs`, `suites/*`, `run.mjs` | Browser E2E harness — keep |
| Any `src/**` | None expected; refuse if present |
| Evidence binaries / secrets | Keep gitignored; never commit JWTs/passwords |

## Conflict: `scripts/qa2a/`

Main already owns Playwright E2E under `scripts/qa2a/` (`lib/`, `suites/`, `run.mjs`).  
Agent 2 added probe runners as `scripts/qa2a/probe-*.mjs` and `scripts/qa2a/lib.mjs`.

**Recommended layout after integration:**

```
scripts/qa2a/           # existing browser E2E (unchanged)
scripts/qa2a/probe/     # move Agent 2 probes here
  lib.mjs
  achievements.mjs
  admin-catalog.mjs
  roster-and-mo.mjs
  wrapped-aggregation.mjs
```

Update probe import paths / npm scripts accordingly. Avoid replacing `scripts/qa2a/lib/` directory with Agent 2’s flat `lib.mjs`.

## Safe incorporation strategy (when approved)

1. **Freeze secondary worktree** — leave `test/qa2-reliability` at `f4c1dce` as evidence archive.  
2. On main, create integration branch e.g. `chore/integrate-agent2-qa-diagnostics` from `fcb699f`.  
3. Path-scoped checkout or cherry-pick with conflict resolution:
   - Prefer `git checkout f4c1dce -- docs/qa/campaign/agent-2-reliability docs/qa/campaign/agent-2-admin-catalog docs/qa/campaign/agent-2-achievements-wrapped docs/qa/campaign/agent-2-backend-integration tests/unit/qa2-reliability tests/unit/qa3a-admin-catalog tests/unit/qa3b-achievements-wrapped`
   - Manually place probes under `scripts/qa2a/probe/`
   - Hand-merge `devEnvironmentGuard.ts`
4. Run non-mutating unit suites; do **not** point probes at `:54321` / `:55321` without intent.  
5. Commit diagnostics-only; then start repair batches on `visual/drinkit-home-v1` (merge integration branch first).

**Alternative:** Keep Agent 2 worktree read-only for green/red contracts during Admin repairs; periodically copy test files. Slightly higher drift risk — path checkout is cleaner once.

## Parallel repair worktree use

| Worktree | Suggested ownership |
|---|---|
| Main `Ship It` | R1 → R2 → R3 (player); R6 SQL; R7 content; consolidation docs |
| `Ship-It-qa2-reliability` **or** new branch worktree from main | R4 → R5 (Admin/catalog) **after** diagnostic tests land on that branch |

Only parallelize when file ownership is disjoint:

| Parallel pair | OK? |
|---|---|
| R3 ∥ R4 | Yes (Gallery/Wrapped vs Admin libs) |
| R6 ∥ R7 | Yes (SQL vs content JSON) |
| R1 ∥ R2 | **No** |
| R4 ∥ R5 | **No** (catalog pending → publish) |
| R1 ∥ R4 | Yes if no shared session/pending utilities |

Do **not** run mutating probes against organizer `:54321` or Agent 1 `:55321` during repairs unless explicitly handed off. Prefer Agent 2 disposable `:56321` for Admin/ACH/WRP probes; Agent 1 `:55321` for browser E2E continuity.

## Explicit non-actions (until Director says go)

- No `git merge test/qa2-reliability` into main without path discipline  
- No reset of either worktree  
- No push / deploy  
- No weakening of failing assertions during integration  
