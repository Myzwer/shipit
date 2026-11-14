# QA-2A — Lifecycle / time-sensitive browser behavior

**Clock control:** `dev_seed_cruise_clock` + `dev_get_ship_clock_state_at` on disposable only  
**Not used:** organizer scenario, wall-clock waiting for real hour rolls

## Results

| ID | Journey | Outcome | Autonomous vs refresh |
|---|---|---|---|
| E2E-LC-001 | Active Home while accepting | **passed** | — |
| E2E-LC-002 | Pre-cruise blocks log | **passed** | — |
| E2E-LC-003 | Before-noon claim affordances | **passed** | — |
| E2E-LC-004 | Afternoon window Home | **passed** | — |
| E2E-LC-005 | Pause on open client | **passed** | **Needed refresh** to show pause UI |
| E2E-LC-006 | Resume after pause | **passed** | Refresh |
| E2E-LC-007 | Client TZ `Asia/Tokyo` | **passed** | Server authority |
| E2E-LC-008 | Wrong device wall clock | **blocked** | Physical device |
| E2E-LC-009 | Friday 6PM+ cutoff / finale | **passed** | `accepting_submissions=false` |
| E2E-LC-010 | Wrapped route after cutoff | **passed** | — |
| E2E-LC-011 | Open tab across cocktail hour | **blocked** | Manual long wait |
| E2E-LC-012 | Claim spanning 15m grace | **blocked** | Manual; backend QA-1 passed |

## Guest risk

Stale open tabs during **pause** do not reliably update until refresh. Same class of risk applies to rotation/grace/finale — guests can tap Claim on a stale card and get a server rejection that may feel like “the app is broken” unless error copy is clear.

## Restore

Lifecycle suite ends by reseeding afternoon Day 3; if interrupted mid-finale, re-run disposable `db:seed-bounty-now`.
