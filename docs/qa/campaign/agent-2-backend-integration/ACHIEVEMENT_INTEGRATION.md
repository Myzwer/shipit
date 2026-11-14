# ACHIEVEMENT INTEGRATION

**Evidence:** `evidence/probe-achievements-integration-results.json`, `ACHIEVEMENT_INTEGRATION_MATRIX.json`  
**DB state:** 174 enabled definitions (126 Drink It! / 48 Ship It!), migrations through 11100.

## Backend execution evidence (174 definitions)

| Class | Count |
|---|---|
| Active definitions loaded | **174** |
| Directly executed award proofs this run | **23** |
| Reachable via production map AND engine | **118** |
| Reachable in active catalog (engine) | **161** |
| Unreachable empty collection | **4** |
| Unreachable missing catalog dependency | **9** |
| Production map: reachable / blocked / missing | **127 / 10 / 37** |

A definition audit is **not** claimed as an earned-award proof. Matrix rows distinguish `executed_award_proof` vs parameter/contract validation.

## Scenario results (INT-ACH-*)

| ID | Result |
|---|---|
| INT-ACH-01 qualifying unlock | PASS |
| INT-ACH-02 threshold −1/=/+1 | PASS |
| INT-ACH-03 multi-unlock same log | PASS |
| INT-ACH-04 idempotent UUID replay | PASS (no dup submission/award/gallery; payload mismatch rejected) |
| INT-ACH-05 collective gauntlet | Covered via physical-bar gauntlet completion path |
| INT-ACH-06 void revokes | PASS (void 7th log revokes tier; earlier kept; re-log restores) |
| INT-ACH-09 Mobile Order vs gauntlet | **ACH-002 not reproduced** — MO logs did **not** advance gauntlet |
| INT-ACH-10 frozen after tags | Engine awards when tags present; launch catalog has **zero** frozen tags |

## ACH-001 — License to Chill / Frozen Concoctions

**Confirmed unreachable** on the active launch catalog: zero `frozen` tags (target 0).  
With temporary frozen tags on tropical offerings, both awards fired — engine OK, **catalog data gap**.  
Defect: **INT-ACH-001** (links ACH-001).

## ACH-002 — Gauntlet + Mobile Order

QA-3B static suspicion **not confirmed** on qa2 backend:

- 12 MO logs of O’Malley’s offerings → 0 gauntlet progress / no award.
- Physical-bar logging completed the gauntlet.
- Cross-bar physical offering rejected (`OFFERING_NOT_AT_BAR`).
- MO does not count as a distinct physical bar.

## ACH-003 — Production release map coverage

**Confirmed.** Of 174 FINAL defs:

- 127 reachable via production map
- 10 blocked in map
- 37 missing map rows (gauntlets, Davids pack, frozen, D-094/095/096)
- 3 map keys point at non-active defs (d032, d035, d083)

Defects: **INT-ACH-003**, **INT-ACH-004** (unreachable empty/missing catalog sets).

## Vitest notes

Achievement engine / catalogReplace vitest suites latch finale and then trip `PROTECTED_QA_FIXTURE` for later files in the same process. Dedicated probe scripts are the authoritative backend proofs for this assignment.
