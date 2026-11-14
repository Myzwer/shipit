# WRAPPED AGGREGATION INTEGRATION

**Evidence:** `evidence/probe-wrapped-aggregation-results.json`, `WRAPPED_INTEGRATION_MATRIX.json`  
**Migration state:** `11100` applied on qa2 only.

## 80-definition coverage

| Classification | Count |
|---|---|
| Directly executed aggregation proofs | **74** |
| Shared-logic proofs (per-def params validated) | **6** |
| Contract-only | **0** |
| Blocked | **0** |
| Independent expectation match | **77 / 80** |
| Failing spec ids | **DI-P03, DI-P15, DI-C08** |

Expected values were computed independently from seeded synthetic ledgers (not by reading the RPC implementation under test for oracles).

## WRP-001 + migration 11100

| Question | Answer |
|---|---|
| Does 11100 alone expose Achievements LB counts? | **Yes** |
| Client `hasAchievementCounts` with 11100? | **True** |
| Denominator | **126** |
| Additional app change required for counts? | **No** |
| Side effect | **INT-WRP-002** rank regression |

Organizer still lacks 11100 (unchanged). Applying 11100 to organizer is **out of scope** for this agent.

## New Wrapped defects

### INT-WRP-002 (P1) — rank regression from 11100

Join loop lacks `ORDER BY`; `wrapped_rank_rows` ranks by row position. Tied champion observed at ranks 5–7; DI-P03 Final Rank wrong for all checked players. Home leaderboard shares the server rank. Pre-11100 body ranks correctly in rolled-back transactions; adding `ORDER BY points desc, first_claim_at, lower(name), id` fixes ranks while keeping achievements.

### INT-WRP-003 (P2) — Mobile Order as venue

Favorite Bar (DI-P15) and Most Popular Bar (DI-C08) count Mobile Order via `group by l.bar_id` without excluding the virtual bar — contradicts Mobile Order product docs.

## Other verified behaviors

Voided claims/completions excluded where seeded; sparse vs fuller datasets exercised; ship-local / activity semantics covered in shared proofs. Featured photo signed-URL refresh (REL-008/WRP-002) was not re-proven as a Storage soak here beyond contract presence.
