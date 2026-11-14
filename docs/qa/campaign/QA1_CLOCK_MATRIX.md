# QA-1 — Ship clock & rotation boundary matrix

**Env:** disposable · **Suites:** `clock.phase2a*`, `clock.phase2b*`, `clock.precruise_opening`, `bounty.phase2da*`, `bounty.phase2db*`, unit `bountyGraceContract`

| Scenario | Backend result | Notes |
|---|---|---|
| Scheduled ship-local offset changes | **Pass** | phase2a / 2b |
| Changes scheduled for 3 AM ship-local | **Pass** | covered in clock schedule suites |
| Crossing midnight | **Pass** | cruise day advance |
| Crossing 5 AM analytics boundary | **Pass** (reporting) | `activityDay.reporting.test.ts` — does **not** alter scoring-day / crew / Friday cutoff |
| Clock adjust forward / backward | **Pass** | stability + atomic |
| Admin ±1 hour | **Pass** | phase2a admin adjust paths |
| Admin Set Ship Time | **Pass** (RPC) | browser UI not E2E’d |
| Uncertain clock reconcile | **Pass** | fingerprint / idempotent request_id paths |
| Atomic schedule saves | **Pass** | `clock.phase2b1.atomic.test.ts` |
| Zero-adjustment saves | **Pass** | atomic suite |
| Pause / resume | **Pass** | `bounty.phase2db2_1.pause` + clock pause |
| Day changes after manual correction | **Pass** | clock stability |
| Previously accepted submissions after adjust | **Pass** | idempotent replay / provenance suites |
| Bounty rotations during clock changes | **Pass** | phase2da + clock interplay |
| Friday finale when time adjusted | **Pass** | finale latch assertions |
| Browser local clock wrong | **Backend: server wins** | **E2E not run** |
| Clients in different time zones | **Backend: ship-local authoritative** | **E2E not run** |
| Browser not final claim authority | **Pass** | submit uses server `received_at` / clock |

## Grace (cocktail / ingredient)

| Instant | Expected | Result |
|---|---|---|
| `end - 1s` | eligible | **Pass** |
| `end` | eligible (half-open start of grace) | **Pass** |
| `end + 14:59` | eligible | **Pass** |
| `end + 15:00` | ineligible | **Pass** |
| Friday 18:00 vs grace | Friday wins — no grace bypass | **Pass** |
| Grace hidden from Home public payload | no `grace_previous` on player get | **Pass** |
| Claim old bounty in grace while next shown | server accepts per contract via private grace | **Pass** (phase2da); stale-card **browser** gap |

Batch evidence: `qa1-results/batch-e-clock-bounty.log` (106 passed), `batch-a-full.log`, unit `batch-unit.log`.
