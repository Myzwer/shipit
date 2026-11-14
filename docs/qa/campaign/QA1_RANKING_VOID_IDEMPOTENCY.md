# QA-1 — Ranking, void, and idempotency

See also [QA1_SHIPIT_RESULTS.md](./QA1_SHIPIT_RESULTS.md) and [QA1_DRINKIT_RESULTS.md](./QA1_DRINKIT_RESULTS.md).

| Area | Result | Evidence |
|---|---|---|
| Ship It! first-to-reach-final-score | **Pass** | `shipit.pc1.scoreReachedRanking.test.ts` |
| Equal totals / timing / deterministic order | **Pass** | same |
| Void + recalculation | **Pass** | `admin.phase5b.void.test.ts` |
| Idempotent retry of accepted request | **Pass** | Ship It submit + Drink It scoring/MO |
| Concurrent double-award blocked | **Pass** | B2/B4 + Ship It + provenance race |
| Drink It! ranking ≠ Ship It! tie rule globally | **Pass** | DI scoring/provenance vs SI-specific suite |
| Gallery / achievement side-effects of void | **Partial** | void suite covers score/ranking; full Gallery association matrix deferred to media batch |

Outstanding for later: browser lost-response UX; exhaustive void×achievement×gallery combinatorial matrix.
