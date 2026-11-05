# Star Princess Games

A mobile-first web app for a private family cruise group. Two games share player accounts and UI patterns in one Vue application:

- **Drink It!** — Individual cocktail exploration. Players log drinks at onboard bars and claim rotating Cocktail and Ingredient bounties, a daily Bar bounty, and a Daily Challenge.
- **Ship It!** — Team photo scavenger hunt. Fixed teams complete a catalog of photo challenges across five categories and compete on a team leaderboard.

Built for roughly a week at sea: simple login for known players, phone-friendly UI, and a low-ops backend the organizer can leave alone while on vacation.

## Tech stack

| Layer | Choice |
|---|---|
| Frontend | Vue 3 · TypeScript · Vite · Vue Router · Pinia |
| Styling | Tailwind CSS · semantic Drink It! / Ship It! theme tokens |
| Icons | Font Awesome Pro (Light / Solid / Regular) via Vue SVG components |
| Backend | Local Supabase (Auth, Postgres, RLS) |
| Hosting | Vercel static SPA (`vercel.json` rewrite for client routes) — not deployed yet |

## Current status

**Phases 0 → 3B.** Functional Drink It! five-step logging wizard (no-photo) on top of `preview_drink_claims` / `submit_drink`. Photo upload, full Gallery, Daily Claim It, and ingredient corrections remain later phases.

Authoritative product specs and mockups live in [`handoff/`](./handoff/). Logging: [`docs/DRINKIT_LOGGING.md`](./docs/DRINKIT_LOGGING.md). Scoring: [`docs/DRINKIT_SCORING.md`](./docs/DRINKIT_SCORING.md). Home board: [`docs/HOME_BOUNTIES.md`](./docs/HOME_BOUNTIES.md).

## Quick start (organizer)

**Requirements:** Node.js 20+, npm 10+, Docker Desktop, Font Awesome **Package Token**.

### 1. Font Awesome

```bash
# e.g. ~/.config/fontawesome/env  (outside the repo)
export FONTAWESOME_PACKAGE_TOKEN='…'
test -n "$FONTAWESOME_PACKAGE_TOKEN" && echo "FA package token is set"
```

### 2. Install

```bash
npm install
```

### 3. Start local Supabase

```bash
# If `docker` is missing in your shell PATH:
export PATH="$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"

npx supabase start
npx supabase db reset
```

### 4. App env (public keys only)

```bash
cp .env.example .env
npx supabase status -o env
# Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from status (never SERVICE_ROLE_KEY).
```

### 5. Provision development identities

```bash
export LOCAL_TEST_PASSWORD='choose-a-local-only-password-12+'
npm run db:provision
```

Creates local Auth users for Demo Drink Only, Demo Ship Only, Demo Both Games, Demo Organizer, and Demo No Games. Password stays in your shell env only.

### 6. Run the Vue app

```bash
npm run dev
```

Open **http://127.0.0.1:5173/** — you should land on **Welcome Aboard**. Pick a demo name and use `LOCAL_TEST_PASSWORD`.

| Route | Who sees it |
|---|---|
| `/login` | Guests |
| `/` | Dual-game members (chooser) |
| `/drinkit` | Drink It! members |
| `/drinkit/log` | Drink It! logging wizard |
| `/drinkit/gallery` | Minimal post-submit Gallery stub |
| `/shipit` | Ship It! members |
| `/admin` | Organizer only (Ship Clock, Pause, Skip Current Bounty) |
| `/unavailable` | Authenticated players with no enabled games |

### 7. Stop local services

```bash
# Stop Vite with Ctrl+C
npx supabase stop
```

## Scripts

```bash
npm run dev                 # Vite
npm run build               # production build
npm run lint
npm run typecheck
npm run test                # unit tests
npm run test:rls            # RLS integration (needs local Supabase + provision)
npm run test:auth           # Auth integration (needs local Supabase + provision)
npm run test:clock          # Ship Clock + finale + read-stability (local Supabase)
npm run test:integration    # all integration suites
npm run test:bounty         # schedule + Home player reads
npm run test:e2e:phase1b    # Playwright login/refresh/logout journey
npm run test:e2e:phase2b    # Playwright Admin Ship Clock (Vite + provision)
npm run test:e2e:phase2db1  # Playwright Home Cocktail/Ingredient (seed + Vite)
npm run test:e2e:phase2db2  # Playwright four cards + Pause/Resume
npm run db:start | db:stop | db:reset | db:provision
npm run db:seed-bounty-now  # align local clock + schedule + daily fixtures to now()
npm run db:seed-skip-reserves  # 80/45 catalog with unused Admin Skip reserves
npm run test:e2e:phase3cb   # Playwright Admin Skip + recovery
npm run screenshots:phase1b
npm run screenshots:phase2b # Admin clock overview / preview / schedule
npm run screenshots:phase2db1
npm run screenshots:phase2db2
```

Ship Clock + Admin: [`docs/SHIP_CLOCK.md`](./docs/SHIP_CLOCK.md). Home bounties: [`docs/HOME_BOUNTIES.md`](./docs/HOME_BOUNTIES.md). Organizer: Home → Account → **Admin**.

## Environment and secrets

| Variable | Purpose | Notes |
|---|---|---|
| `FONTAWESOME_PACKAGE_TOKEN` | npm auth for Pro packages | Shell / CI secret — never `VITE_` |
| `VITE_SUPABASE_URL` | Public Supabase URL | Local: `http://127.0.0.1:54321` |
| `VITE_SUPABASE_ANON_KEY` | Public anon key | From `supabase status` |
| `LOCAL_TEST_PASSWORD` | Local demo Auth password | Shell only — never commit |

Never commit service-role keys, real player passwords, or Font Awesome tokens.

## Project structure

```text
src/
  app/                 # router + auth guards
  components/shared/   # shell, nav, account, leaderboard
  features/auth/       # login, unavailable, access denied
  features/admin/      # organizer Admin (Ship Clock, Pause, Skip)
  features/drinkit/    # Drink It! Home + bounty carousel
  features/shipit/     # Ship It! Home shell
  features/shared/     # dual-game chooser
  stores/              # session + membership profile
  lib/                 # Supabase client, Ship Clock, Home bounty sync
  ui/                  # copy + icon registry
supabase/migrations/   # identity, clock, catalog, bounty schedule
docs/SUPABASE_LOCAL.md
docs/HOME_BOUNTIES.md
docs/phase2db1-screenshots/
```

## Documentation

| Document | Role |
|---|---|
| [`docs/SUPABASE_LOCAL.md`](./docs/SUPABASE_LOCAL.md) | Local Supabase, provision, tests |
| [`docs/HOME_BOUNTIES.md`](./docs/HOME_BOUNTIES.md) | Home Cocktail/Ingredient data flow |
| [`docs/BOUNTY_SCHEDULING.md`](./docs/BOUNTY_SCHEDULING.md) | Schedule engine |
| [`docs/SHIP_CLOCK.md`](./docs/SHIP_CLOCK.md) | Ship Clock |
| [`handoff/`](./handoff/) | Authoritative product specs |

## License / privacy

This is a private family cruise project. Do not publish real player credentials, Supabase service keys, or Font Awesome Package Tokens.
