# Demo scenarios — Phase 10E private-roster local preview

Development-only scenarios for the organizer and Visual Fidelity Agent.  
Uses the **same** `content/catalogs/launch-candidate-v1.json` as the production import path.  
**Not** production activation. **Not** in-app save slots. Simulated activity ≠ genuine onboard play.

## Runtime verification status

| Gate | Status |
|---|---|
| Phase 10D Docker / integration / synthetic demos | **PASS** (baseline `618ea92`) |
| Private `roster.local.json` (gitignored) | **PASS** locally — 22 players / 11 Drink It! when file present |
| Synthetic Demo/Gate fixtures | Fallback **only** when private roster file is absent (`FORCE_SYNTHETIC_ROSTER=1` forces fixtures) |
| Provisional Ship It! teams | Local-demo only via `local_demo_provisional` (`[TEMP DEMO] …`) — **not** organizer-final |
| Login selector | Real display names only; no Demo/Gate/Roster fixtures when private roster active |
| Embarkation / Tuesday / Wrapped | **PASS** on private roster (Drink activity limited to enrolled Drink It! players) |
| Migration `085` daily bar fixtures | Launch-candidate bar keys (fixes post-activate `BAR_KEY_MISSING`) |
| Private-roster screenshots | Keep under ignored local paths — **do not** commit real-name captures |

### Actual browser checks performed

| Check | Result |
|---|---|
| Real cocktail / bar names | Embarkation: **Strawberries & Cream** @ Sea View Bar (50). Tuesday: **Lychee Vodka Mojito** @ Lido Bar (50); ingredient **mint leaves** (25). Log wizard lists authentic bars (Bellini's, Crooners, Good Spirits, …). |
| Bounties / points | Unequal Tuesday Drink It! board (Organizer 25 / others 0). Ship It! Alpha & Bravo **400** pts with unequal completions. |
| Tuesday new drink log | Interactive generic beer @ Bellini's submitted; gallery card caption `Phase 10D Tuesday interactive beer`. |
| Achievements + Gallery | Gallery showed unlock **These Boots Are Made for Walkin'** plus seeded cocktail logs (Figs & Honey, Amazonia). |
| Ship It! + team scoring | Home progress 3/50 / 400 pts; challenges list loads working titles. |
| Permissions | Ship-only → Drink It! denied. No-games → enrollment denial. |
| Wrapped + finale cutoff | Ship time Day 7 ~7:00 PM. `/drinkit/log` routes to Cruise Wrapped (“games are over”). Drink It! Wrapped stats + Ship It! Wrapped team results (400 pts, provisional awards). |

### Screenshot locations (Visual Fidelity Agent)

| Scenario | Directory |
|---|---|
| Embarkation | `docs/phase10a-screenshots/embarkation/` (`01`–`07`) |
| Tuesday | `docs/phase10a-screenshots/tuesday/` (`01`–`09`, review/submit extras, `verification-notes.txt`) |
| Wrapped | `docs/phase10a-screenshots/wrapped/` (`01`–`15`, including `14`/`15` results + `verification-notes.txt`) |

Capture helper: `npm run screenshots:phase10a` (account-switch logout fix applied in Phase 10D).

### Remaining blockers (not runtime failures)

- Confirmed final Ship It! team assignments still organizer-owned (local preview may use clearly labeled temporary demo teams).
- Companion UUID map for D-086…D-093 still private/out-of-band.
- Good Spirits still unpriced (Category C).
- Visual fidelity / CSS redesign — **out of scope** for 10E.
- Production activation / production Auth accounts — **blocked**.

## Organizer setup (exact)

```bash
open -a Docker
export PATH="$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker info   # must show Server Version without permission errors

cd "/path/to/Ship It"
npx supabase start
# Confirm API_URL is http://127.0.0.1:54321 before any reset
npx supabase db reset

export LOCAL_TEST_PASSWORD='your-local-only-password-12+'
LOCAL_TEST_PASSWORD="$LOCAL_TEST_PASSWORD" npm run demo:seed -- --scenario embarkation
npm run dev
```

## Prerequisites

```bash
npx supabase start
npx supabase db reset
export LOCAL_TEST_PASSWORD='your-local-only-password-12+'
npm run db:provision           # private roster when present; else synthetic defaults
npm run dev                    # Vite on http://127.0.0.1:5173
```

**Catalog:** `launch-candidate-v1.json` (Category B fingerprinted eligibility; `price_usd` null). Demo seeds this artifact on `development-only` only.

When `private/roster/roster.local.json` exists, `demo:seed` provisions that roster (and deactivates obsolete synthetic logins). It does **not** silently replace a present private roster with fixtures.

## Load / reload a scenario

```bash
LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario embarkation
LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario tuesday
LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario wrapped
```

Each run verifies local Supabase URL, requires `cruise_config.label = development-only`, activates launch-candidate, schedules bounties, loads working achievements (`test_only`), and seeds scenario activity.

**Impact:** destructive to the **local preview** database only. Never touches remote DBs.

## Demo accounts

**Preferred:** gitignored `private/roster/roster.local.json` (confirmed guests + memberships; optional `local_demo_provisional` temporary teams). Login selector shows those display names only.

**Fallback (no private file):** synthetic fixtures below.

| Key | Display name | Login alias | Games | Team |
|---|---|---|---|---|
| `drink_only` | Demo Drink Only | `drink.only@star-princess.local` | Drink It! | — |
| `ship_only` | Demo Ship Only | `ship.only@star-princess.local` | Ship It! | Demo Team Alpha |
| `both` | Demo Both Games | `both.games@star-princess.local` | Both | Demo Team Alpha |
| `admin` | Demo Organizer | `organizer@star-princess.local` | Both + Admin | Demo Team Bravo |
| `no_games` | Demo No Games | `no.games@star-princess.local` | none | — |

Password: `LOCAL_TEST_PASSWORD` (never stored in roster JSON).

## What each scenario demonstrates

### A. Embarkation (`embarkation`)

- Ship time ≈ Saturday Day 1 ~12:30.
- Authentic bars + cocktail names; empty / near-empty ledgers.
- Interactive: log a drink, open challenges, browse Home.

### B. Tuesday (`tuesday`)

- Ship time ≈ Tuesday Day 4 afternoon.
- Unequal Drink It! / Ship It! scores; Gallery + achievements present.
- Interactive logs still allowed (verified Phase 10D).

### C. Wrapped (`wrapped`)

- Ship time ≈ Friday Day 7 after 6 PM finale.
- Cruise Wrapped intro + results; gameplay submissions closed (log routes to Wrapped).

## Private roster / photos

| Input | Location | Git |
|---|---|---|
| Roster template | `private/roster.example/roster.template.json` | tracked — capacity contract only; no real names |
| Live roster | `private/roster/roster.local.json` | **ignored** |
| Photo convention | `private/photos.example/` | tracked |
| Live photos | `private/photos/` | **ignored** |
| Private preview screenshots | keep outside tracked `docs/phase10a-screenshots/` or under ignored paths | **do not commit real-name UI** |

Copy the template into the ignored local file. Confirmed guest rows use `team_key: null` until Dad supplies final teams; optional `local_demo_provisional` supplies temporary demo teams for local Ship It! boards only. Do **not** put passwords or Auth UUIDs in the file.

Without private inputs, synthetic accounts + `tests/fixtures/tiny.jpg` placeholders are used.

Phase 10D synthetic screenshots under `docs/phase10a-screenshots/` remain reference captures (Demo/Gate names only).

## Safety

- Demo seed refuses non-local hosts.
- Dev RPCs refuse non-`development-only` cruises.
- No `--force-production` flag.
