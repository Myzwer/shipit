# R6 — Regression Results

## Before (disposable `:55321`)

| Check | Result |
|---|---|
| Live LB order vs `drinkit_player_score_rows` | **FAIL** (`join_preserves_order=false`, `lb_matches_score_order=false`) |
| LB function body | Achievements join present; **no ORDER BY** |
| `schema_migrations` `11100` | Missing (body already replaced) |
| `11300` | Absent |

## After (`11300`)

### Authoritative SQL/RPC (`scripts/qa2b/repro-r6-wrapped-ranking.mjs`)

| ID | Status | Notes |
|---|---|---|
| R6-PREFLIGHT | PASS | Disposable has 11100+11300; org/qa2 lack 11300 |
| R6-LIVE-ORDER-MATCHES-SCORE-ROWS | PASS | Live board matches score-row contract |
| R6-FIXTURE-POINTS-TIES-ZERO-ACH | PASS | Champ Early #1 before Champ Late; Adam/Tina name tie-break; Zed #5; achievements preserved |
| R6-FIXTURE-VIEWER-IDENTITY | PASS | `is_me` only for viewer |
| R6-MO-VENUE-EXCLUSION | PASS | Filtered → Wake View; unfiltered control → Mobile Order; 4 logs retained |
| R6-ROLLBACK-PRESERVED-11300 | PASS | Fixture rollback left repaired body |
| R6-WRP-001-ACHIEVEMENT-COUNTS | PASS | Every live row has numeric `achievements` |

Evidence: `evidence/r6-ranking-results.json`

### Home leaderboard (authenticated client RPC)

`get_my_drinkit_leaderboard` as `drink_only`:

- 181 rows, points descending, competition ranks match independent calculation
- Numeric `achievements` on every row
- Viewer `Demo Drink Only`: rank 1 (all-zero points roster), **17** achievements

Evidence: `evidence/home-leaderboard-rpc.json`

### Unit / contract

| Suite | Result |
|---|---|
| `wrappedMetricsAndCarousel.spec.ts` (incl. WRP-001) | Pass |
| `wrappedRankingR6.spec.ts` | Pass |
| Combined | **13/13** |

### Typecheck / build

| Command | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run build` | Pass |

## Intentional non-runs / preserved reds

| Item | Reason |
|---|---|
| Full QA-4A `wrapped-aggregation.mjs` on `:56321` | Agent 2 DB; would need `11300` apply there; not mutated |
| R7 ACH-001/002/003 | Expected red; ownership R7 |
| Browser Wrapped UI walkthrough | Login custom listbox blocked automation; backend RPC + SQL fixtures used as integration proof |
| Organizer apply | Explicitly forbidden until ops |

## Expected-red manifest

`KNOWN_FAILURE_MANIFEST.md`: WRP-001 / INT-WRP-002 / INT-WRP-003 marked **Repaired (R6)** for Agent1 disposable; qa2 still needs `11300`.
