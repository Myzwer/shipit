# QA-1 — Drink It! results

**Env:** disposable `:55321` · **Method:** backend integration

## Cocktail Bounty

Covered via `bounty.phase2da*` / `phase2db*` + scoring submit: hourly rotation, designated bar/cocktail, rarity/score, availability, selection invariants, server claim validation, early/expired claims, 15-minute grace (± boundaries), Friday override, one-accepted-claim/category/day, companion rules, idempotent replay. **Pass** at suite level (106 clock/bounty batch + scoring).

Stale open card across rotations: **server contract tested**; **browser UI not E2E’d**.

## Ingredient Bounty

Two-hour rotation, selection, physical-bar availability/rarity, eligible relationships, points, location hidden from featured display, grace, Friday cutoff, companions, daily restrictions, duplicates — covered in bounty + scoring suites. Sparse/large catalog edge fuzz: **partial** (fixtures exercise catalog; exhaustive combinatorial catalog sizes not separately scripted). Mobile Order cannot grant Ingredient credit: **Pass** (`drinkit.mobileOrder.test.ts`).

## Bar Bounty (Wake View → … → Promenade)

| Check | Result |
|---|---|
| Daily bar sequence / valid IDs | **Pass** (B1) |
| Crew 4+4+3 partition; determinism; day change; repeat-avoidance | **Pass** (B1 + unit partition) |
| Presence / companion; noncrew excluded; solo reject | **Pass** (B2/B4) |
| 3-person 20/40; 4-person 20/30/40; lock; no upgrade; no second score | **Pass** (B4) |
| Concurrent claims; wrong bar; Friday cutoff | **Pass** (B2/B4) |
| Good Spirits catalog vs daily Bar Bounty | **Pass** under crew suites (no unintended break observed) |

Teardown flake after dirty fillers fixed in harness (`disposePlayers`); product paths green on re-run (`batch-f-b2b4-fixed.log`).

## Daily Challenges

All Hands vs Bring a Friend, `attest_participation: true` required for new All Hands, missing/false reject, idempotent replay, late upload window, no 100% attendance requirement, BaF companion rules, 50 pts, one-per-day, Friday cutoff, wrong-day reject — covered by `drinkit.dailyChallenge.phaseC1`, `drinkit.pc1.dailyAttest`, `drinkit.pc1.buddyAndSchedule`. **Pass**. Meetup times not invented.

## Category overlap & scoring

One drink / multiple categories independently; one claim/category/day; failed claims don’t consume; ordinary solo logs; scored social witness; non-participant witness rules; single award; concurrency; retry — primarily `scoring.phase3a*` / `phase3ca` / provenance. **Pass** except **DEF-QA1-001** (Bar preview reason code when cocktail bar ≠ featured bar).

## Outstanding Drink It! cases

- Browser stale bounty card + multi-TZ client UX
- Exhaustive every hourly window × 7 days enumeration as a single published matrix artifact (suites sample exhaustively by engine rules rather than printing 7×24 rows)
