# Gate A — Final Acceptance Summary

**Campaign:** STAR PRINCESS — FINAL QA GATE A  
**Date:** 2026-11-14  
**Checkpoint:** `3424095` on `visual/drinkit-home-v1`  
**Role:** Independent post-repair acceptance (no application source changes)  
**Disposable:** Agent 1 `:55321` / `star-princess-disposable-mo`  
**Protected:** Organizer `:54321` (untouched), Agent 2 `:56321` (untouched)  
**`QA_ALLOW_ORGANIZER_MUTATION`:** never set

## Verdict

The repaired stack can **bootstrap a voyage with the production Admin schedule initializer**, advance **seven cruise days on server clock alone**, enforce **finale latch / no post-finale scoring**, and serve **Cruise Wrapped** after finale.

**Follow-up (2026-11-14):** Under the organizer’s approved plan — finalize/activate the catalog **before** gameplay and leave it unchanged for seven days — the production Admin stage→preview→publish→init path **passes**, all **125** schedule refs stay valid across seven days without catalog change, and **unlisted drink logging works E2E**. **FINAL-A-CAT-001** is reclassified as **out-of-scope for launch** (ops rule: do not replace the active catalog after gameplay begins). Original fixture-activate failure evidence is preserved; mid-cruise omitted-key Admin rebind remains unproven and is not a launch requirement. Details: `fixed-catalog-followup/`.

Normal gameplay still requires **one Admin schedule initialization before boarding** (by design, R5). No browser / logged-in player is required for daily rotations once the schedule exists and Ship Time advances.

## Environment fingerprint

| Stack | Project | Lifecycle at start | Migrations 10900–11400 | Role |
|---|---|---|---|---|
| Organizer `:54321` | `star-princess-local` | `final` cruise `48fa40c6-…` | **ABSENT** (107 total) | Protected Wrapped fixture — not mutated |
| Agent 1 `:55321` | `star-princess-disposable-mo` | `active` | **ALL PRESENT** (113 total) | Disposable — mutated under Gate A |
| Agent 2 `:56321` | `star-princess-qa2-backend` | `pre_cruise` | Partial (missing 11200, 11300) | Protected from this assignment |

Pre-test recoverable dump: `evidence/pre-gate-a-disposable-20261114T203946Z.dump` (local evidence only; gitignored).

## Baseline automation

| Suite | Result |
|---|---|
| Unit (`tests/unit`) | **756 / 756 passed** |
| Diagnostic contracts (qa2 + qa3a + qa3b) | **354 / 354 passed** |
| R5 Admin schedule init (disposable) | **4 / 4 passed** |
| `vue-tsc` typecheck | **PASS** |
| `npm run build` | **PASS** |
| Application source modified | **No** |
| Harness added | `scripts/gate-a/*` only |

## Voyage rehearsal (disposable)

| Question | Answer |
|---|---|
| Seven days simulated Sat–Fri? | **Yes** (server-timed RPC lifecycle) |
| First schedule via `admin_initialize_bounty_schedule`? | **Yes** (72 / 39 / 7 / 7; `gameplay_started=false`) |
| Used `dev_generate_bounty_schedule` for first init? | **No** |
| Autonomous daily rotations without browser? | **Yes** (days 1–4 proven; 5–7 broken only after unsafe catalog fixture swap) |
| Friday 6 PM cutoff / no reopen? | **Yes** |
| Wrapped after finale? | **Yes** (correct RPC arity; supplemental proof) |

## Scorecard (meaningful Gate A cases)

Aggregated from unit + R5 + voyage + supplemental + catalog rebind + diagnostic contracts (deduped families counted in `TEST_REGISTRY.json`):

| Status | Count (approx) |
|---|---:|
| Passed | **1180+** automated assertions across suites; **~85** distinct Gate A voyage/supp checks after harness triage |
| Failed (product) | **0** launch-blocking after fixed-catalog follow-up (`FINAL-A-CAT-001` reclassified — see `fixed-catalog-followup/`) |
| Failed (harness, triaged) | 4 voyage assertion families (ingredient field names; Wrapped arity; blocked-achievements field name) — corrected in supplemental |
| Blocked | Ingredient claim path in supplemental (offering join schema); full Admin publish-with-removed-key; full 50 Ship It photo submits; browser E2E device matrix |
| Not run | Physical-device HEIC; organizer migration apply; Agent 2 mutation; Gate B |

## Defects

See `DEFECTS.md`. **FINAL-A-CAT-001** remains documented with preserved evidence but **does not block launch** under the fixed-catalog workflow (`fixed-catalog-followup/FINAL_A_CAT_001_RECLASSIFICATION.md`).

## Direct proof counts

| Area | Direct proof |
|---|---|
| Earned achievement awards (Gate A synthetic) | **Not claimed as 174** — map audit 174/164/10; DB has awards from prior disposable history; Gate A did not run a full 174 earn matrix |
| Wrapped metric aggregation | Payload + sections available; **3** metric-winner RPC smokes; full **80** definition audit remains prior QA-3B/QA-4A evidence (not re-aggregated 80/80 in Gate A) |
| Ship It definitions | **50 / 50** present; voyage completions **0** (photo binding with stub keys) |

## Human / Admin required during normal play?

| Action | Required? |
|---|---|
| Before boarding: Admin initialize bounty schedule | **Yes** (once) |
| Daily Cocktail/Ingredient/Bar rotation | **No** — server clock |
| Mid-cruise catalog replacement | **Not part of approved launch** — do not replace after gameplay begins; menu-agent later if ever required |
| Finale / Wrapped reveal | **No** browser required for latch; players open Wrapped after finale |

## Deliverables

All files in this folder. Executable harness: `scripts/gate-a/`. Local evidence JSON under `evidence/` (gitignored).
