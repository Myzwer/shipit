# R4 — Admin Controls & Catalog Recovery

**Status:** Repaired and verified on disposable `:55321`  
**Baseline HEAD:** `9f4a48a` on `visual/drinkit-home-v1`  
**Groups:** REP-ADM-ERR-001, REP-ADM-LOCK-001, REP-ADM-SESS-001, REP-CAT-LOCK-001

## Verdict

Admin operations now classify outcomes correctly (`ok` / `failed` / `unknown`), recover from realistic transport and in-progress states, and cannot soft-lock the catalog publication UI after a stage→preview failure. Discard restores a usable Admin surface without clearing site storage by hand. Publish refuses to mint a new request id while a pending write exists.

## Defect disposition

| ID | Group | Disposition |
|---|---|---|
| ADM-001 | REP-ADM-ERR-001 | **Fixed** — `in_progress` ledger → `unknown` |
| ADM-002 | REP-ADM-ERR-001 | **Fixed** — HTTP 409 / `OPERATION_IN_PROGRESS` → `unknown` |
| ADM-003 | REP-ADM-ERR-001 | **Fixed** — gateway / 5xx-style messages → `unknown` |
| ADM-004 | REP-ADM-ERR-001 | **Fixed** — deterministic void codes → `failed` |
| ADM-005 | REP-ADM-LOCK-001 | **Fixed** — `confirmManual` catch → unknown feedback |
| ADM-006 | REP-ADM-SESS-001 | **Fixed** — signOut clears all admin pending modules |
| ADM-007 | REP-ADM-LOCK-001 | **Fixed** — `requiresAdmin` exempt from empty-games redirect |
| ADM-008 | REP-CAT-LOCK-001 | **Fixed** — preview failure clears pending; Discard added |
| CAT-001 | REP-CAT-LOCK-001 | **Fixed** — same root cause as ADM-008 |
| INT-CAT-001L | REP-CAT-LOCK-001 | **Fixed** — live `:55321` proof (pending cleared) |
| INT-ADM-001L / 002L | REP-ADM-ERR-001 | **Fixed** at client classification (unit + helper proof) |
| INT-ADM-003L / 004L | REP-ADM-ERR-001 | **Fixed** at client classification (unit contracts) |
| INT-ADM-007L | REP-ADM-LOCK-001 | **Fixed** at router; backend admin RPC still authorizes |
| ADM-009 | REP-CAT-PUB-001 (R5) | **Also fixed** narrowly — `runPublish` pending guard (required by R4 catalog recovery criteria; not schedule generation) |

**Out of R4 scope (unchanged):** INT-SCHED-001 / R5 schedule bootstrap; R3 signed URLs; R6 Wrapped ranks; R7 achievements; CAT-002 / mobile-order validator polish.

## What changed (product)

1. **Roster** — reconcile keeps `in_progress` unknown; Edge 409 in-progress stays unknown.
2. **Skip / Void** — transport vs deterministic rejection split corrected.
3. **Ship Clock** — `confirmManual` catch surfaces unknown so Retry/Refresh appear.
4. **Router** — admins with zero enrollments reach `/admin`.
5. **Session** — signOut clears all `star-princess.admin.*` pending keys (+ daily announcement).
6. **Catalog** — no publish pending rewrite with stage request id; clear on preview failure; Discard; publish pending guard; Check Status only for publish/rollback actions.

No migrations. No organizer / Agent 2 mutations.

## Verification snapshot

| Check | Result |
|---|---|
| R4 QA-3A contracts (baseline) | **18 failed / 33 passed** |
| R4 QA-3A contracts (after) | **51 passed / 51** |
| Full `tests/unit/qa3a-admin-catalog` | **227 passed / 227** |
| Live `:55321` repro (`repro-r4-admin-catalog.mjs`) | **ALL PASS** (preview-fail clear, Discard, publish guard, publish+rollback) |
| `typecheck` / `build` | Pass |
| Related unit (`adminCatalogImport`, guards) | Pass |

## Docs in this folder

- `ROOT_CAUSE.md` — defect-by-defect cause
- `CHANGES.md` — files touched
- `REGRESSION_RESULTS.md` — before/after + live proof
- `REMAINING_RISKS.md` — residual / deferred
- `evidence/` — vitest logs + live JSON
