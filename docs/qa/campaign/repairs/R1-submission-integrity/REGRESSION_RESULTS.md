# R1 — Regression Results

Environment: disposable Supabase `http://127.0.0.1:55321`, Vite app `http://127.0.0.1:5177`, never `QA_ALLOW_ORGANIZER_MUTATION=1`.

## Original failing tests — before / after

### `submitGuards.contract.spec.ts` (QA-2)

| Assertion | Before (baseline) | After R1 |
|---|---|---|
| Drink log BUSY while submitting | Pass (control) | Pass |
| Scavenger `if (submitting.value) return` | **Fail REL-001** | **Pass** |
| Daily `if (submitting.value) return` | **Fail REL-002** | **Pass** |
| Drink unknown classification | Pass | Pass |
| Scavenger/Drink abandon photo (REL-003/004) | Fail | Fail (deferred to R2) |
| PhotoCapture abandon control | Pass | Pass |

Focused filter after fix: `4 passed | 4 skipped` for re-entry/BUSY/unknown.

Full qa2-reliability suite remains partially red for unrelated REP-* groups (expected).

### E2B-S07 / E2B-001 (browser + disposable DB)

| Run | Result |
|---|---|
| Campaign baseline | `newSubs=2 statuses=accepted,accepted` |
| R1 focused repro (`repro-e2b-s07.mjs`) | `newSubs=1`, single RPC key |
| R1 rapid re-tap + nav (`repro-e2b-s07-double.mjs`) | `newSubs=1`, single RPC key |
| Forced remint race before fix | 2 RPCs, 2 keys, 2 accepted |
| Forced remint race after fix | 1 RPC, shared submission id for both callers |

## New regression coverage vs required scenarios

| # | Scenario | Coverage | Result |
|---|---|---|---|
| 1 | Double tap during pending | Unit coalesce (`submissionIntegrity.r1`) + browser double | Pass |
| 2 | Navigate away immediately after Submit | E2B-S07 focused repro | Pass (`newSubs≤1`) |
| 3 | Return while original pending | Unit mid-flight resetAll + coalesce; pending LS reuse | Pass |
| 4 | Lost success + retry same request | Unit durable pending reuse; server idempotent replay integration | Pass |
| 5 | Two simultaneous tabs same account | Integration concurrent same-key → one row | Pass |
| 6 | Legitimate separate ordinary logs | Integration two different keys both accept | Pass |
| 7 | Backend rejection then valid retry | Unit: key cleared on reject, new key on retry | Pass |
| 8 | Accepted claim/drink replay | Integration same-key → `idempotent_replay`, one row | Pass |
| 9 | Daily Challenge + attestation | Existing `drinkit.phase4b3.daily` + REL-002 latch; contract guard | Guard pass; prior daily suite remains authority for attest |
| 10 | Concurrent Ship It teammate submits | Existing scavenger team uniqueness + REL-001 latch | Guard pass; server `TEAM_CHALLENGE_DONE` / idempotency unchanged |

## Other suites

| Suite | Result |
|---|---|
| `tests/unit/logWizardNavigation.spec.ts` | 20/20 pass |
| `tests/unit/qa2-reliability/submissionIntegrity.r1.spec.ts` | 8/8 pass |
| `tests/integration/submissionIntegrity.r1.test.ts` | 3/3 pass (disposable) |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |

## Intentional remaining reds (not R1)

- REP-MEDIA-001 / REL-003–005, REL-007
- REP-SIGNED-001 / REL-008
- REP-MIME-001 / REL-006
- Admin / catalog / Wrapped / achievements groups

Do not weaken those assertions to green the full suite.
