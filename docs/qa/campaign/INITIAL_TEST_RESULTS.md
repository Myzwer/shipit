# Initial test results (Assignment 1)

## Fact classes

- **Verified outcome** — command run this session
- **Blocked** — intentionally not run (safety)
- **Harness change** — test/docs only; no app feature fixes

## Safe baseline (main workdir → organizer `:54321`)

| Command | Outcome |
|---|---|
| `npm run typecheck` | **PASS** |
| `npm run build` | **PASS** |
| `npm test` (77 files / 388 tests) | **PASS** |
| `npx vitest run tests/unit/bountyGraceContract.spec.ts tests/unit/devEnvironmentGuard.spec.ts tests/unit/qaScenarioSafety.spec.ts` | **PASS** 11/11 |

## Organizer mutation guard (verified)

```bash
npx vite-node scripts/qa-probe-mutating-guard.mjs
```

**Result:** blocked with  
`PROTECTED_QA_FIXTURE: refusing mutating tests against finalized/final lifecycle (lifecycle=final, finalized=true)`  
URL `http://127.0.0.1:54321`.

## Disposable foundational batch (`Ship-It-disposable-mo` → `:55321`)

Guard probe: **allows** mutation (`lifecycle=pre_cruise`, port `55321`).

```bash
cd "/Users/josh/Documents/Web Projects/Vue/Ship-It-disposable-mo"
export LOCAL_TEST_PASSWORD='…'   # local-only; not committed
npx vitest run --fileParallelism=false \
  tests/integration/bounty.phase2da.schedule.test.ts \
  tests/integration/clock.precruise_opening.test.ts
```

| Outcome | Detail |
|---|---|
| **PASS** | 2 files / **21 tests** |
| Duration | ~33s |
| Includes | Private grace +0/+14:59/+15:00, Friday override, pause/clock, pre-cruise opening |

## Post-condition — organizer fixture

After disposable batch, `npm run qa:inspect` still reports:

- `inferred_scenario: wrapped`
- `lifecycle: final`, `finalized: true`
- cruise id `48fa40c6-e7cd-4f8f-8b81-e3e48d10eb13`
- snapshot fingerprint on disk unchanged: `f9f07ab84d988614`

Migrations `10900` / `11000` still **not** on organizer.

## Not run (blocked / deferred)

| Suite | Reason |
|---|---|
| `npm run test:integration` (umbrella) | Would target organizer identities from main cwd; guard now fails closed, but umbrella not executed |
| `npm run test:clock` on organizer | Same |
| All e2e / screenshot scripts | Hardcode or assume `:54321`; deferred |
| `qa:activate` / `db:reset` | Forbidden |
| Mobile Order / activity-day integration on organizer | Migrations pending |

## Files added/changed this assignment (test/docs/harness only)

| Path | Purpose |
|---|---|
| `docs/qa/campaign/*` | Deliverables |
| `tests/helpers/devEnvironmentGuard.ts` | Refuse final + primary port |
| `tests/helpers/clockFixtures.ts` | Guard before clock seed |
| `tests/unit/bountyGraceContract.spec.ts` | Grace contract unit |
| `tests/unit/devEnvironmentGuard.spec.ts` | Guard URL helpers |
| `scripts/qa-probe-mutating-guard.mjs` | Safety probe |

No application feature/UI repairs. Dirty Visual Fidelity files left untouched.
