# Pre-Repair Baseline (Integration Checkpoint)

**Branch:** `visual/drinkit-home-v1`  
**Agent 2 archive tip:** `f4c1dce` (untouched)  
**Scope:** Diagnostics + harness only — no application repairs, no mutating suites, no push.

## Safe checks run

| Check | Result |
|---|---|
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| Legacy unit (`tests/unit` excluding qa2/qa3a/qa3b folders) | **79 files / 396 tests PASS** |
| `devEnvironmentGuard.spec.ts` + `qaScenarioSafety.spec.ts` | **6 PASS** |
| Agent 2 defect contracts (qa2 + qa3a + qa3b) | **295 PASS / 32 FAIL / 327 total** |
| Mutating integration / probes / browser E2E | **Not run** (deferred) |

## Unexpected failures

**None.** All 32 failing assertions match [`KNOWN_FAILURE_MANIFEST.md`](./KNOWN_FAILURE_MANIFEST.md) (9 REL + 18 ADM/CAT + 5 ACH/WRP).

## Environment protections

| Stack | Port | Integration posture |
|---|---|---|
| Organizer | `:54321` | Untouched; `supabase/config.toml` remains `star-princess-local`; mutation blocked without `QA_ALLOW_ORGANIZER_MUTATION=1`; finalized refused |
| Agent 1 disposable | `:55321` | Untouched; still allowed for Agent 1 suites; may reseed through finale |
| Agent 2 disposable | `:56321` | Allowed in URL guard; probes hard-require this port; finalized refused |

## Campaign inventory on main

QA-0 / QA-0.5 · QA-1 · QA-2 · QA-2A · QA-2B · QA-3A · QA-3B · QA-4A · Consolidation — all represented (see `MASTER_TEST_REGISTRY.md` campaign index).

## First repair assignment

**R1 / REP-SUB-001** — see [`REPAIR_EXECUTION_MATRIX.md`](./REPAIR_EXECUTION_MATRIX.md).
