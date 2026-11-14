# R7 — Bar Gauntlet verification (ACH-002)

## Spec

FINAL §3.4: personal gauntlet progress requires logs **at that physical bar**; Mobile Order / virtual bars excluded. Good Spirits remain price-verification gated.

## SQL authority

| Function | Migration | Location guards |
|---|---|---|
| `achievement_log_counts_for_collection` | **11000** (authoritative) | `d.bar_id = bo.bar_id` + `b.is_virtual is false` |
| `achievement_collection_covered_ids` | 08600 (delegates to log_counts) | inherits 11000 |
| Award eval `offering_collection` | live_met → covered_ids | inherits 11000 |
| `achievement_collection_covered_count` (UI progress) | **11400** (R7) | same guards as 11000 |

## Live qa2 probes (`:56321`, after def reload)

| Case | Result |
|---|---|
| Qualifying offerings at intended physical bar (O’Malley’s personal) | **PASS** — gauntlet completes |
| Same offerings via Mobile Order | **PASS** — no progress / no award |
| Wrong physical bar / shared offering path | **PASS** — rejected or not credited |
| MO does not count as distinct physical bar | **PASS** |
| Collective path | Covered by engine collective scope + prior INT-ACH-05 gallery linkage |
| Good Spirits `verification_required` + `eligible_count: 0` | Unchanged / intact |
| Void / idempotent replay (general award path) | INT-ACH-04/06 **PASS** |

## Wrong-bar physical same-offering

Offering IDs are bar-scoped. Submit path rejects `OFFERING_NOT_AT_BAR` for mismatched physical bar. Therefore “log offering A at bar B” is not a normal accepted path. Probe `ACH-002-WRONG-PHYSICAL-BAR` **PASS**.

## Suspected MO leak

**Not reproduced** on qa2 with `11000` applied (confirms QA-4A INT-ACH-09). Static test that only read `08600`/`09200` was **stale**, not proof of live award failure.

## R7 code change

Only `11400` for `covered_count` UI/award-progress consistency. No speculative rewrite of already-correct `log_counts`.
