# Scenario B — Pre-Cruise activation report

**Status:** Pre-Cruise **ACTIVE** (local development only)  
**Activated:** 2026-11-12T01:05:19Z  
**Branch:** `visual/drinkit-home-v1` (Visual Fidelity WIP left untouched)

## Commands

| Step | Command |
|---|---|
| Refresh Tuesday (pre-switch) | `npm run qa:prepare -- tuesday --confirm-env=local-development-only` |
| Activate Pre-Cruise | `npm run qa:activate -- precruise --confirm-env=local-development-only` |
| Recover Tuesday | `npm run qa:activate -- tuesday --confirm-env=local-development-only` |

Tuesday snapshot fingerprint after refresh / pre-activate safety: `c765530620fd6b34` (22 players, 79 awards, 129 gallery, **54** photos; public + `storage.objects` + Storage files).

## Authoritative clock (post-activate inspect)

- Scenario: `precruise`
- Ship-local: **2026-11-11T12:24:39** (advances with wall clock via offset)
- Ship date: `2026-11-11` · Day 1 embarkation: `2026-11-12` · `cruise_day`: null
- Lifecycle: `pre_cruise` · Submissions: unavailable (`evaluate_submission_acceptance` → `PRE_CRUISE`) · Finale: not latched
- Offset: `-766` · Finale UTC: `2026-11-19T06:46:00+00:00`

## Voyage calendar verification (2026-11-12)

**Blocker — no approved real voyage dates in project configuration.**

| Source | Finding |
|---|---|
| `handoff/docs/Production-Content-and-Launch-Checklist.md` | Unchecked: “Actual cruise Day 1 Saturday and Day 7 Friday dates” |
| `docs/SHIP_CLOCK.md` | “Production sailing dates are **not** configured”; still required before launch |
| `handoff/02-UX-Behavior.md` | Policy only: Saturday Day 1 → Friday Day 7; “exact sailing dates are configuration inputs” |
| Active Pre-Cruise `day1_ship_date=2026-11-12` | **Synthetic QA** from `demo-seed` `computeNowAligned` (precruise sets day1 = wall UTC date + 1) — not a production embarkation |
| Approved Tuesday snapshot | Also synthetic: `day1_ship_date=2026-11-08`, Day 4 `ship_date=2026-11-11` (calendar Wednesday; closeout already noted) |
| Wrapped prepared fixture | Different synthetic day1 `2026-11-05` |

No date was substituted. Pre-Cruise left on its prepared synthetic calendar; lifecycle remains genuinely `pre_cruise` with submissions blocked. Countdown/opening copy cannot be trusted as a real embarkation countdown until the organizer supplies Day 1 Saturday / Day 7 Friday anchors and the QA fixtures are rebuilt onto that shared voyage.

## Roster / config

| Check | Result |
|---|---|
| Active accounts | 22 |
| Drink It! | 11 |
| Ship It! on six teams | 21 (3+3+4+4+3+4) |
| Unassigned | June |
| Admin | Josh |
| Daily challenges | 7 approved |
| Achievement defs | 174 |
| Ship It! challenges | 50 / 5 categories |
| Catalog | bars 27 · concepts 462 · offerings 624 · ingredients 153 · active pointer set |
| Bounty schedule | 7 bar_bounties · 111 bounty_slots across 7 days |
| Gameplay history | 0 awards / gallery / photos / claims / completions |
| Day-locked Bar Bounty crews | 0 (expected pre-cruise; crews generate on cruise days) |

## Smoke notes (existing rules; not changed)

- Drink It! Home board RPC returns `outside_cruise` / phase `unavailable`; UI copy uses existing `Couldn't Load Game Data` unavailable strings (not a network failure).
- Drink It! Log wizard still opens client-side; server acceptance remains `PRE_CRUISE`.
- Ship It! Home/Challenges show “opens when the cruise begins”; progress 0/50; leaderboards at 0.
- Galleries empty; achievements 0 earned; Wrapped gated until finale.
- Account: Log Out + Admin reachable from Drink It! shell.

Screenshots: `docs/qa/precruise/screenshots/` · evidence: `docs/qa/precruise/evidence/`
