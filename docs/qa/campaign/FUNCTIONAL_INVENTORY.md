# Functional inventory (discovered)

Sources: `src/app/router.ts`, Admin sections, migrations/RPCs, `docs/*`, handoff specs.  
When docs conflict, prefer latest approved Director handoff (2026-11-13) and distinguish **documented intent** vs **implemented**.

## Classification legend

- **V** — Verified against approved spec in this assignment (code inspected and/or safe tests)
- **I** — Implemented; not independently re-verified end-to-end here
- **C** — Requires launch configuration / organizer decision
- **M** — Missing or ambiguous
- **D** — Needs real device / external network

---

## A. Gameplay & automation

| Area | Implementation anchors | Class | Notes |
|---|---|---|---|
| Pre-cruise lifecycle + shared opening | `router.ts` PRECRUISE_*, `docs/SHIP_CLOCK.md`, `10600` opening instants | I | Countdown alone never unlocks; backend recheck |
| Day-by-day game state / ship-local time | `ship_clock_state_at`, Admin clock RPCs | I | Server authoritative |
| Clock offset plan / adjustments / reconcile | `admin_save_ship_clock_plan`, manual correction RPCs | I | |
| Hourly Cocktail Bounty + grace | `bounty_resolve_at` (`01700`), schedule gen | V | Grace: cocktail/ingredient; half-open 15m; Fri 6PM override |
| 2h Ingredient Bounty | same resolve path; rarity/physical-bar counts | I | |
| Daily Bar Bounty locations | `bar_bounties` seeded 7 days | V | Live organizer has all 7 keys (see below) |
| Daily crew reset / partition / scoring | `09400`–`09600`, crew RPCs | I | 4+4+3 for 11 players |
| Daily Challenges + attendance attest | `09700`/`09800`/`10800`, `attest_participation` | I | All Hands / Bring a Friend honor |
| One-claim-per-category + overlap choice | scoring submit path | I | |
| Friday 6 PM cutoff + finale latch | clock + `ensure_finale_latched` | I | Organizer currently latched |
| Pause/resume Drink It! | Admin pause RPCs | I | |
| Stale browser sessions | client stores + server acceptance | I/D | Needs recovery E2E |

### Bar Bounty locations — **configured (not a launch gap)**

Observed on organizer DB:

| Day | `canonical_key` |
|---|---|
| 1 | `wake-view-bar` |
| 2 | `good-spirits-at-sea` |
| 3 | `sea-view-bar` |
| 4 | `crooners` |
| 5 | `omalleys-irish-pub` |
| 6 | `lido-bar` |
| 7 | `promenade-bars` |

Daily *Challenge* venues are a separate 7-list (Tequila Shot … Miami Vice Finale) — also present.

### 15-minute grace — exact semantics (V)

| Topic | Behavior |
|---|---|
| Applies to | **Cocktail** and **Ingredient** only |
| Does not apply | Bar Bounty, Daily Challenge, ordinary solo logs |
| Window | Half-open `[prev_public_end, prev_end + 15m)` |
| +0 / +14:59 | Eligible (`grace_previous` present) |
| +15:00 | Not eligible |
| Player Home RPCs | `p_include_grace=false` — grace never advertised |
| Friday 6 PM | `p_at_utc >= finale` → `finale`; no grace |
| Source | `supabase/migrations/20261105001700_phase2da_generate_and_resolve.sql` |
| Existing automation | `tests/integration/bounty.phase2da.schedule.test.ts`, scoring grace cases |

---

## B. Player functionality

| Area | Routes / modules | Class |
|---|---|---|
| Login/logout / session | `/login`, auth store | I |
| Navigation + guards | `router.ts` (auth, admin, membership, pre-cruise, awards mode) | I |
| Drink It! claims + ordinary logs | `/drinkit/log`, submit RPCs | I |
| Ship It! submissions | `/shipit/challenges/:id/submit` | I |
| Companion selection | FriendsStep + server validation | I |
| Photos / crop / captions / Gallery / reactions | media pipeline, Gallery views | I — crop E2E still open (Director item) |
| Achievements / secrets / gauntlets / revoke | achievements engine + UI | I |
| Scores / rankings / ties / LBs | scoring + Wrapped LBs; Ship It! first-to-reach-score (`10700`) | I |
| Errors / retries / interrupted submit | pending* local helpers + idempotency keys | I |

### Player routes

`/login`, `/`, `/drinkit`, `/drinkit/rules|wrapped|log|daily|gallery|achievements`, `/shipit`, `/shipit/rules|wrapped|challenges|challenges/:id/submit|gallery|achievements`, `/admin`, `/unavailable`, `/access-denied`.

---

## C. Administration

Sections in `AdminView.vue`: Overview, Players, Drink It! (pause, crews, daily announcements, bounty skip, void), Ship Clock, Catalog (add drink, export, import/publish/rollback).

All gated by `requiresAdmin` + server `require_admin`. Edge Function `admin-roster` for create/reset password.

---

## D. Catalog & infrastructure

| Area | Class | Notes |
|---|---|---|
| JSON import / publish / rollback | I | `docs/CATALOG.md` |
| New drink / ingredient / offering recognition | I | |
| Historical preservation | I | versioned catalogs |
| Malformed menu handling | I | validation preview |
| Storage signed URLs / cleanup | I | `ops:photo-cleanup`; auto-ops unclear (**C**) |
| Mobile Order | I on disposable; **not on organizer** | Migration `10900` pending |
| 5 AM activity-day reporting | I on disposable; **not on organizer** | Migration `11000` pending |

---

## E. Finale / Wrapped (Plan C)

| Area | Class | Notes |
|---|---|---|
| Final score freeze | I | Organizer latched |
| Featured slide eligibility | I | Full fixture 15/15 + 12/12 verified in prior QA reports (Cursor-reported; coverage JSON present) |
| 80 All Stats metrics | I | Spec + builders; full metric audit = next batch |
| Photo selection / signed URLs | I | |
| Ties / sparse Scenario C | I | `wrapped-scenario-c` snapshot available |
| Post-finale nav + Admin footer | I | Visual freeze approved |

---

## F. Additional systems found (beyond prompt minimum)

- Pre-cruise dual-game rules panels + FAQ groups  
- Achievement “Just Unlocked” celebration store  
- Gallery companion_names (105) + achievement secret reveal in Gallery  
- Admin overview roster-scope sections (`10100`)  
- Catalog authorized exceptions / price evidence gates  
- Photo framing schema (`09300`) + client framing editor  
- QA scenario snapshot harness (public + storage.objects + bytes)  
- Synthetic player dispose helpers for integration cleanup  
- Plan C Wrapped leaderboard achievements migration `11100` (source only)
