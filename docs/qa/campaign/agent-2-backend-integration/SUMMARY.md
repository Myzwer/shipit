# SUMMARY — QA-4A Agent 2 backend integration

**Mission:** Independent disposable Supabase + previously blocked Admin/Catalog/Achievement/Wrapped backend proofs.  
**Worktree / branch:** `Ship-It-qa2-reliability` / `test/qa2-reliability`  
**Prior checkpoint:** `2572d0b`  
**Isolation held:** Third stack `star-princess-qa2-backend` on `:56321`. Organizer cruise `48fa40c6-…` unchanged. Agent 1 `:55321` not reset/stopped/reconfigured. No `src/` repairs. No push/merge.

## Environment

| Stack | Ports | Role |
|---|---|---|
| Organizer | 54321–54324 | Protected Wrapped fixture |
| Agent 1 | 55321–55324 | Active E2E — do not touch |
| **Agent 2 qa2** | **56321–56324** | This campaign’s disposable |

Migrations **10900, 11000, 11100** applied on qa2 only. Synthetic Demo + qa2a data only.

## Counts (meaningful)

| Metric | Value |
|---|---|
| Probe cases (admin+ach+wrapped) | **155** |
| Probe PASS | **121** |
| Probe FAIL (includes intentional defect repros) | **22** |
| Probe INFO | **10** |
| Probe BLOCKED | **2** |
| Vitest batch1 (catalog/roster/MO/replace) | **35 pass / 6 fail** |
| Vitest void+skip (clean clock) | **15 pass** |
| Confirmed `INT-*` defects | **20** (see DEFECTS.md) |
| Achievement defs with DB load evidence | **174 / 174** |
| Achievement defs with earned-award proof this run | **23** |
| Wrapped defs with executed aggregation proof | **74 / 80** (+6 shared-logic) |

## Top cruise-ops risks (live backend)

1. **Catalog UI lock after preview fail** (INT-CAT-001L / ADM-008) — activation blocked until storage cleared; DB still recoverable.
2. **No production first bounty schedule path** (INT-SCHED-001) — imported catalog alone cannot bootstrap schedule.
3. **11100 fixes Achievements LB counts but breaks ranks** (WRP-001 resolved for counts; INT-WRP-002 P1 ranks).
4. **Roster reconcile lies during in-flight Auth** (INT-ADM-001L/002L) — live Edge confirmation.
5. **Frozen achievements unreachable on launch catalog** (INT-ACH-001) — content gap, engine OK.
6. **Production release map misses 37 of 174 defs** (INT-ACH-003).

## Key verdict flips vs prior mocked QA

| Finding | Prior | Live qa2 |
|---|---|---|
| ACH-002 MO gauntlet leak | Suspected | **Not reproduced** |
| ACH-001 frozen unreachable | Suspected | **Confirmed** |
| WRP-001 counts | Hidden w/o 11100 | **Fixed by 11100**; new rank bug |
| ADM-001/002/003/008/009 | Unit | **Live confirmed** |

## Artifacts

- `ENVIRONMENT.md`, `MIGRATIONS.md`, `ADMIN_INTEGRATION.md`, `CATALOG_INTEGRATION.md`
- `ACHIEVEMENT_INTEGRATION.md`, `WRAPPED_INTEGRATION.md`, `TRANSACTION_RECOVERY.md`
- `DEFECTS.md`, `BLOCKED.md`, `TEST_REGISTRY.json`
- Matrices: `ACHIEVEMENT_INTEGRATION_MATRIX.json`, `WRAPPED_INTEGRATION_MATRIX.json`, `ADMIN_CATALOG_INTEGRATION_MATRIX.json`
- Harness: `scripts/qa2a/probe/*.mjs` (relocated under `probe/` on main so Playwright E2E keeps `scripts/qa2a/lib/`)
- Evidence under `evidence/`

## Explicit non-actions

No application source repairs. No organizer/Agent1 mutations. No merge/push/deploy.
