# QA-1 — Ship It! results

**Env:** disposable · **Suites:** `shipit.phase4a.reads`, `shipit.phase4b2.submit`, `shipit.pc1.scoreReachedRanking`, `admin.phase5b.void`

| Check | Result | Notes |
|---|---|---|
| Challenge catalog reads (title/category/points/eligibility) | **Pass** | phase4a |
| Eligible team completion path | **Pass** | phase4b2 |
| One accepted score per team per challenge | **Pass** | phase4b2 + ranking |
| Independent teams same challenge | **Pass** | ranking/submit |
| Whole-team credit | **Pass** | |
| Photo requirement under approved contract | **Pass** (backend gate) | UI copy/instruction: **not E2E’d** |
| Duplicate / concurrent teammate double-score blocked | **Pass** | |
| Wrong-team / wrong-game blocked | **Pass** | |
| Friday cutoff | **Pass** | shared lifecycle gates |
| Lost response / refresh consistency | **Pass** (idempotent RPC) | browser refresh **not E2E’d** |
| Rosters of varying sizes / eligibility edges | **Partial** | covered via fixtures; not every roster size enumerated |
| Standings at 0 / some / all-50 completions | **Partial** | ranking suite covers first-to-reach / ties; **literal all-50 challenge titles not each submitted in QA-1** |

## Ranking / void / idempotency

| Check | Result |
|---|---|
| First-to-reach-final-score tie rule | **Pass** (`shipit.pc1.scoreReachedRanking`) |
| Equal totals at different times | **Pass** |
| Near-simultaneous / deterministic order | **Pass** |
| Void scored completion + recalc | **Pass** (`admin.phase5b.void`) |
| Retry already-accepted | **Pass** |
| Historical chronology preserved | **Pass** |
| Drink It! ranking uses DI rules (not SI tie globally) | **Pass** (DI scoring/provenance suites; SI rule isolated to Ship It) |

Evidence: `qa1-results/batch-g-shipit-void.log`, earlier `batch-c-d.log` Ship It portion.
