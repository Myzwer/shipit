# Plan C Wrapped — Full Coverage Fixture Report

**Status:** Fixture prepared and verified. **Not activated.** Organizer Scenario C remains the live local review DB.

**Captured:** 2026-11-13  
**Coverage:** Drink It! **15/15**, Ship It! **12/12** (production `buildFeatureSlides` builders)

---

## 1. Existing infrastructure reused

| Piece | Role |
|---|---|
| `scripts/demo-seed.mjs` | Extended with `--plan-c-full` for Wrapped |
| `scripts/qa-scenario.mjs` | Snapshot/prepare/activate; Scenario C safety restore |
| `scripts/lib/demoLocalSafety.mjs` | Local URL + `development-only` cruise gate |
| `scripts/lib/demoPrivatePhotos.mjs` | Private QA images (skips `no_image.jpg`) |
| `scripts/lib/shipitTeamConfig.mjs` | Six-team scavenger submitters |
| `src/lib/wrapped/buildFeatureSlides.ts` | Unchanged eligibility / carousel selection |
| Server `get_my_wrapped` + gallery feed | Unchanged aggregations / photo ranking inputs |
| `.local/qa-scenarios/{tuesday,precruise,wrapped}` | Existing snapshot format |

**New (minimal):**

- `scripts/lib/wrappedPlanCFullSeed.mjs` — deterministic activity plan
- `scripts/qa-wrapped-plan-c-coverage.mjs` — coverage verifier
- Snapshot slot `wrapped-scenario-c` — safety copy of organizer Scenario C

No new fixture platform. No eligibility/scoring/aggregation/UI changes.

---

## 2. Fixture implementation and commit hash

**Code changes are uncommitted** (awaiting organizer approval per commit policy).

Base HEAD at verification time: `65e3dc4308f27f8bca747c8c2382172fb0afd169`

Relevant paths (this task only):

- `scripts/lib/wrappedPlanCFullSeed.mjs` (new)
- `scripts/qa-wrapped-plan-c-coverage.mjs` (new)
- `scripts/demo-seed.mjs`, `scripts/qa-scenario.mjs`
- `scripts/lib/qaScenarioSafety.mjs`, `scripts/lib/demoPrivatePhotos.mjs`
- `docs/QA_SCENARIOS.md`, `docs/DEMO_SCENARIOS.md`, `package.json`
- `tests/unit/qaScenarioSafety.spec.ts`
- `docs/qa/wrapped-plan-c-full/coverage-report.json`

---

## 3. Exact environment and database targeted

| Check | Value |
|---|---|
| Host | `http://127.0.0.1:54321` (local Supabase only) |
| Cruise label | `development-only` |
| DB container | `supabase_db_star-princess-local` |
| Production / remote | **Not touched** (hard-blocked) |
| Migration tip on live DB | `20261105010800` |
| Repo migrations `10900` / `11000` / `11100` | Present in git; **not applied** to this QA instance |

Live after this work: **Scenario C** (`wrapped-scenario-c`, fingerprint `a2e53d5b198488c7`).

Prepared fixture slot: **`wrapped`** (fingerprint `f9f07ab84d988614`, role `prepared-fixture-plan-c-full`).

---

## 4. Exact reset / recreate commands

```bash
open -a Docker
npx supabase status   # must be http://127.0.0.1:54321
export LOCAL_TEST_PASSWORD='…'   # or .local/runtime-qual-password.txt

# Prepare Plan C full fixture (saves Scenario C if live is Wrapped,
# verifies 15/15+12/12, snapshots wrapped, restores Scenario C)
npm run qa:prepare -- wrapped --plan-c-full --confirm-env=local-development-only

# Or manual steps:
npm run qa:snapshot -- save wrapped-scenario-c --confirm-env=local-development-only
LOCAL_TEST_PASSWORD="$LOCAL_TEST_PASSWORD" npm run demo:seed -- --scenario wrapped --plan-c-full
npm run qa:wrapped-plan-c-coverage
npm run qa:snapshot -- save wrapped --confirm-env=local-development-only
npm run qa:snapshot -- restore wrapped-scenario-c --confirm-env=local-development-only

# Activate ONLY with organizer authorization (switches live review DB):
npm run qa:activate -- wrapped --confirm-env=local-development-only

# Return to Scenario C review:
npm run qa:activate -- wrapped-scenario-c --confirm-env=local-development-only

# Return to Tuesday midgame:
npm run qa:activate -- tuesday --confirm-env=local-development-only
```

---

## 5. Summary of generated activity

| Game | Generated |
|---|---|
| Drink It! | 43 accepted drink logs across 7 days + 11 players; 7 daily challenge completions; bounty claims on Days 1–3; companions; curated Gallery photos + reactions |
| Ship It! | 42 accepted team completions across 6 teams; 11 challenges left unfinished; Team 3 primary QA (12 completions / 3300 pts) |

Finale latched via authoritative Friday 6 PM ship-local path. Submissions blocked. Wrapped accessible.

---

## 6. Drink It! 15-slide coverage (david_forrester)

| ID | Eyebrow | Included | Displayed |
|---|---|---|---|
| DI-01 | Your Week | yes | 9 drinks |
| DI-02 | You've Got Taste | yes | Passion of the Irish |
| DI-03 | Where It All Began (photo) | yes | earliest photo |
| DI-04 | Your Hangouts | yes | 7 bars |
| DI-05 | The Competition | yes | 100 points |
| DI-06 | Funniest Photo | yes | top 😂 |
| DI-07 | Your Best Days | yes | Day 3 \| Day 5 |
| DI-08 | Still Laughing | yes | 2nd 😂 |
| DI-09 | What a Crew! | yes | 43 crew drinks |
| DI-10 | The People's Favorites | yes | Sand Meets the Sea |
| DI-11 | All the Love | yes | top ❤️ |
| DI-12 | The Dynamic Duo | yes | David F. & Katie |
| DI-13 | The Crowd Favorite | yes | top total reactions (distinct) |
| DI-14 | Early Birds & Night Owls | yes | Jonathan \| Cindy |
| DI-15 | Good Vibrations | yes | top 🤙 |

Machine report: `docs/qa/wrapped-plan-c-full/coverage-report.json`

---

## 7. Ship It! 12-slide coverage (katie_forrester / Team 3)

| ID | Eyebrow | Included | Displayed |
|---|---|---|---|
| SI-01 | Your Team's Adventure | yes | 12 challenges |
| SI-02 | Where It All Began | yes | first team photo |
| SI-03 | Your Specialty | yes | Food & Drink Discoveries |
| SI-04 | Your Best Days | yes | Day 4 \| Day 2 |
| SI-05 | Everybody Got In on the Fun | yes | Soft Serve photo |
| SI-06 | What a Crew! | yes | 42 completions |
| SI-07 | The Crowd Favorites | yes | Soft Serve Swirl |
| SI-08 | Big Points, Big Memories | yes | 500-pt photo |
| SI-09 | Record Breakers | yes | Team 3 \| Team 3 |
| SI-10 | The Overachievers | yes | Team 3 \| Team 5 |
| SI-11 | One Last Memory | yes | last team photo |
| SI-12 | The Ones That Got Away | yes | 11 unfinished |

---

## 8. Photo Storage and reaction verification

- Featured photos use private QA assets under `private/photos/` (not `no_image.jpg`)
- Bound `photos` rows + `storage.objects` + Storage bytes present
- Coverage verifier signed-URL smoke: **10/10 featured photo URLs OK**
- No duplicate photo IDs within either carousel
- Drink It! reaction ranking uses real `gallery_reactions` rows (per-player constraints)

---

## 9. Representative QA accounts

| Role | Key | Display |
|---|---|---|
| Drink It! full coverage | `david_forrester` | David F. |
| Ship It! full coverage | `katie_forrester` | Katie (Team 3) |
| Admin (not sole winner) | `josh_forrester` | Josh |

---

## 10. Final leaderboard results (seed snapshot)

**Drink It!** (top): David F. 100 · Katie 75 · Lindsey 75 · Mark 70 · Josh 50 · …

**Ship It!:** Team 3 **3300** · Team 5 3000 · Team 1 2200 · Team 6 1700 · Team 2 1300 · Team 4 600

---

## 11. All Stats / tabs

Fixture preserves the finalized 80-stat Wrapped builders and All Stats presentation (unchanged). Finale authorization and membership gates unchanged. Coverage verifier exercised `get_my_wrapped` for both games under real auth sessions.

---

## 12. Tests and build status

| Check | Result |
|---|---|
| `vitest` qaScenarioSafety + wrappedPlanCSlides | **41 passed** |
| `npm run typecheck` | **pass** |
| `qa:wrapped-plan-c-coverage` | **COVERAGE OK** |

---

## 13. Unavoidable limitations

- Live DB migration chain ends at `10800` — **5 AM activity-day (`11000`) not applied** (by design; do not apply as a side effect). Early/late use ship-local wall clock from `10000` Wrapped SQL. Overnight logs stay ≥06:48 and ≤23:41 so a later 5 AM boundary remains compatible.
- Bounty point amounts depend on generated schedules/crews; DI-05 floors on daily (50) + claims. Verified David F. reached 100 points.
- Snapshot names now include `wrapped-scenario-c` (safety only; not seedable via prepare).
- Full-coverage fixture lives in the **`wrapped`** slot until explicitly activated.

---

## 14. Production / Scenario C confirmation

| Asset | Status |
|---|---|
| Production / remote DB | Untouched |
| Organizer Tuesday snapshot | Untouched (`c765530620fd6b34`) |
| Organizer Scenario C live DB | **Restored** after prepare (`wrapped-scenario-c`) |
| Prior wrapped prepared backup | Kept at `.local/qa-scenarios/wrapped-prepared-backup-20261113/` |
| Visual Fidelity git WIP | Untouched by this fixture work |
| Eligibility / scoring / UI | Unchanged |

**STOP.** Activation of the full-coverage demo requires separate Development Director authorization:

```bash
npm run qa:activate -- wrapped --confirm-env=local-development-only
```
