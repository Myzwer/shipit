# Demo scenarios — Phase 10B (launch-candidate catalog)

Development-only scenarios for the organizer and Visual Fidelity Agent.  
Uses the **same** `content/catalogs/launch-candidate-v1.json` as the production import path.  
**Not** production activation. **Not** in-app save slots. Simulated activity ≠ genuine onboard play.

## Runtime verification status

| Gate | Status |
|---|---|
| Launch-candidate static content / Category B fingerprints / ingredient map | Done (Phase 10C) |
| Local Docker Desktop API access | **BLOCKED in agent environment** (`permission denied` on `docker.sock`) |
| Live `demo:seed` / browser smoke / screenshots | **PENDING** — organizer must run below |

First executable smoke once Docker works: `npx supabase db reset` → `LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario embarkation` → open Drink It! Home.

### Organizer setup (exact)

```bash
# 1) Start Docker Desktop and ensure the CLI can talk to the daemon
open -a Docker
export PATH="$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
docker info   # must show Server section without permission errors

# 2) Local Supabase
cd "/path/to/Ship It"
npx supabase start
npx supabase db reset

# 3) Demo content
export LOCAL_TEST_PASSWORD='your-local-only-password-12+'
LOCAL_TEST_PASSWORD="$LOCAL_TEST_PASSWORD" npm run demo:seed -- --scenario embarkation
npm run dev
```

## Prerequisites

```bash
# Docker Desktop running + docker info OK
npx supabase start
npx supabase db reset          # applies migrations including Phase 10A title strip + schema 1.1 fixture activate
export LOCAL_TEST_PASSWORD='your-local-only-password-12+'
npm run db:provision           # synthetic roster unless private/roster/roster.local.json exists
npm run dev                    # Vite on http://127.0.0.1:5173
```

**Catalog:** `launch-candidate-v1.json` (Category B approved filtered-source eligibility; `price_usd` null; never invents $15). TS preview reports `ready_for_scheduling` with `safeToPublish: false`. Demo seeds this artifact on `development-only` only.

```bash
npm run catalog:build-launch
npm run catalog:validate-launch
```

## Load / reload a scenario

```bash
LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario embarkation
LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario tuesday
LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario wrapped
```

Each run:

1. Verifies the Supabase URL is **local** (no production bypass).
2. Requires / reseeds `cruise_config.label = development-only`.
3. Activates `content/catalogs/launch-candidate-v1.json` (authentic launch-candidate names).
4. Generates bounty schedule + daily fixtures.
5. Loads working achievements (`test_only`).
6. Seeds scenario activity through canonical submit helpers.

**Impact:** destructive to the **local preview** database only. Documented at command start. Never touches remote DBs.

## Demo accounts (synthetic default)

| Key | Display name | Login alias | Games | Team |
|---|---|---|---|---|
| `drink_only` | Demo Drink Only | `drink.only@star-princess.local` | Drink It! | — |
| `ship_only` | Demo Ship Only | `ship.only@star-princess.local` | Ship It! | Demo Team Alpha |
| `both` | Demo Both Games | `both.games@star-princess.local` | Both | Demo Team Alpha |
| `admin` | Demo Organizer | `organizer@star-princess.local` | Both + Admin | Demo Team Bravo |
| `no_games` | Demo No Games | `no.games@star-princess.local` | none | — |

Password: `LOCAL_TEST_PASSWORD` (never stored in roster JSON).

### Suggested perspectives

| Goal | Account |
|---|---|
| Drink It! Home / log wizard / bounties | Demo Drink Only or Demo Both Games |
| Ship It! challenges / team board | Demo Ship Only or Demo Both Games |
| Gallery + both games | Demo Both Games |
| Admin clock / roster | Demo Organizer |
| Wrapped intro (unrevealed) | Any game member after `wrapped` seed |
| Membership denial | Demo No Games |

Switch perspectives: log out → pick another name on Login → same password.

## What each scenario demonstrates

### A. Embarkation (`embarkation`)

- Ship time ≈ Saturday Day 1 ~12:30.
- Authentic bars + cocktail names in the logging wizard.
- Working Ship It! titles (no `[DEV]`).
- Working achievement definitions loaded; **no** fabricated awards.
- Empty / near-empty score ledgers; initial bounties + Daily assignments.
- Interactive: log a drink, open challenges, browse Home.

### B. Tuesday (`tuesday`)

- Ship time ≈ Tuesday Day 4 afternoon.
- Multiple Drink It! players with unequal scores from accepted claims.
- Ordinary (non-scoring) beer logs mixed in.
- Ship It! teams with unequal completions + Gallery events/reactions.
- Claimed and available achievements; incomplete tasks remain.
- Interactive: further logs/claims still allowed.

### C. Wrapped (`wrapped`)

- Ship time ≈ Friday Day 7 after 6 PM finale.
- Completed cruise history + final boards.
- Provisional Wrapped awards only (`test_only`, development-only).
- Secrets visible under finale rules; intro for unrevealed viewers.
- **No** new gameplay submissions after finale.

Restore start state:

```bash
LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario embarkation
```

## Private roster / photos

| Input | Location | Git |
|---|---|---|
| Roster template | `private/roster.example/roster.template.json` | tracked |
| Live roster | `private/roster/roster.local.json` | **ignored** |
| Photo convention | `private/photos.example/` | tracked |
| Live photos | `private/photos/` | **ignored** |

Copy the template, fill display names / game toggles / teams. Do **not** put passwords or Auth UUIDs in the file. Two Davids = two rows with distinct approved display names.

Without private inputs, synthetic accounts + `tests/fixtures/tiny.jpg` placeholders are used (clearly development media).

## Visual Fidelity Agent screenshots

**Status: PENDING** until local Docker/Supabase is available. Do not treat empty scenario folders as captured output.

```bash
LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario embarkation
npm run dev   # separate terminal
LOCAL_TEST_PASSWORD='…' npm run screenshots:phase10a
# → docs/phase10a-screenshots/embarkation/

LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario tuesday
PHASE10A_SCENARIO=tuesday LOCAL_TEST_PASSWORD='…' npm run screenshots:phase10a

LOCAL_TEST_PASSWORD='…' npm run demo:seed -- --scenario wrapped
PHASE10A_SCENARIO=wrapped LOCAL_TEST_PASSWORD='…' npm run screenshots:phase10a
```

Expected captures (real app, development accounts — not static HTML):

| Scenario | Shots |
|---|---|
| Embarkation | Drink It! Home, Ship It! Home, drink-log wizard |
| Tuesday | Both Homes, Gallery, Achievements, logging screen |
| Wrapped | Intro + results for both games |

Simulated seed activity ≠ genuine onboard guest photos. Fixture JPEG placeholders are development media only.

**Do not redesign CSS in this phase.**

## Installed reference data

| Layer | Source |
|---|---|
| Catalog | `content/catalogs/development-preview-v1.json` from handoff menus + ranking drafts |
| Evidence report | `docs/CONTENT_EVIDENCE_REPORT.md` |
| Challenges | 50 working titles (keys unchanged) |
| Achievements | `content/achievements/workingCatalog.*` via `db:load-working-achievements` |

## Provisional / unresolved

- Exact printed dollar amounts not transcribed → ceiling `$15` with `PRICE_TRANSCRIPTION_CEILING` flag.
- Good Spirits unpriced → excluded from featured bounty corroboration.
- Shared pool menu (Promenade / Lido / MIX / Star).
- Ranking drafts are editorial, not onboard-verified production approval.
- D-082 / D-083 / D-085 organizer-blocked; D-086…D-093 companions need private UUID map.
- Real 22-guest roster / Drink It! participant list / permissioned photos: organizer private inputs.
- Final creative achievement catalog + Wrapped superlatives: **out of scope**.
- Production catalog: **BLOCKED** until onboard menu verification.

## Safety

- Demo seed refuses non-local hosts.
- Dev RPCs refuse non-`development-only` cruises.
- No `--force-production` flag.
