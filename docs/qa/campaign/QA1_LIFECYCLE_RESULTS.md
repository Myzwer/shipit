# QA-1 — Seven-day lifecycle simulation results

**Env:** disposable `:55321` · **Method:** backend integration with controlled ship clock / `p_at_utc` (no wall-clock waiting)

## Verified (backend)

| Checkpoint | Result | Evidence |
|---|---|---|
| Pre-cruise players cannot claim before backend start | **Pass** | `clock.precruise_opening.test.ts` |
| Countdown does not independently authorize gameplay | **Pass** (server acceptance gates) | same + `evaluate`/submit paths in clock & scoring suites |
| Playable at configured Day1 00:00 ship-local | **Pass** | precruise opening + phase2a |
| Daily windows open/close; correct cruise day | **Pass** | clock phase2a/2b + bounty schedule |
| Daily rollover without admin | **Pass** | clock stability + bounty day transitions |
| Friday 6 PM cutoff strict | **Pass** | phase2da Friday / finale assertions |
| Finale latches; does not reopen unintentionally | **Pass** | clock finale + security suites |
| Final results / Wrapped accessibility automation | **Partial** | finale latch covered; full Wrapped 80-metric QA deferred (QA-3); migration `11100` not applied |
| Scored submissions blocked after finalization | **Pass** | clock/scoring finale paths |
| Existing accepted scores remain in results | **Pass** | void/provenance + Ship It ranking suites (accepted rows retained unless voided) |
| Admin access across pre-cruise / active / finale | **Partial** | Admin void + clock admin RPCs covered; full Admin UI matrix deferred |

## Boundary coverage

Exact ±1s transitions for open, grace, Friday 18:00 are covered in bounty grace unit + `bounty.phase2da.schedule.test.ts` (see clock matrix doc).

## Client refresh / no-session voyage

| Question | Finding |
|---|---|
| Can voyage progress with zero browsers? | **Yes** — exposure/acceptance are server RPCs driven by ship clock / `p_at_utc`. |
| Stale tab / wrong device clock authority? | **Not browser-tested** in QA-1. Server rejects claims using authoritative time; client timer is not final authority for claims (backend-tested). |
| Depends on scheduled job / admin for day rollover? | **No** for normal day advance under tested clock APIs. |

## Gaps

- Authenticated browser E2E for refresh/reconnect/stale bounty card UX.
- Exhaustive Admin “Set Ship Time” UI path (RPC/admin clock suites cover backend).
