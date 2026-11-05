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
| Backend | Supabase (Auth, Postgres, Storage) — scaffolded; live wiring comes later |
| Hosting | Vercel static SPA (`vercel.json` rewrite for client routes) |

## Current status

**Phase 0 — foundation.** Game selection and themed Home shells, shared navigation, design tokens, Font Awesome Pro, tooling, and CI. No authentication, scoring, submissions, galleries, or admin yet.

Authoritative product specs and mockups live in [`handoff/`](./handoff/).

## Quick start

**Requirements:** Node.js 20+, npm 10+, and a Font Awesome **Package Token** (not a Kit/API token).

1. Configure the Package Token in your shell (never commit it):

   ```bash
   # e.g. ~/.config/fontawesome/env  (outside the repo)
   export FONTAWESOME_PACKAGE_TOKEN='…'
   ```

   Confirm without printing the value:

   ```bash
   test -n "$FONTAWESOME_PACKAGE_TOKEN" && echo "FA package token is set"
   ```

2. Install and run:

   ```bash
   npm install
   npm run dev
   ```

3. Open **http://127.0.0.1:5173/**

| Route | Screen |
|---|---|
| `/` | Game selection |
| `/drinkit` | Drink It! Home shell |
| `/shipit` | Ship It! Home shell |

Stop the dev server with `Ctrl+C`. Restart with `npm run dev`.

Optional app env (not required for Phase 0 shells):

```bash
cp .env.example .env
```

## Scripts

```bash
npm run dev        # local Vite server
npm run build      # production build
npm run preview    # preview the production build
npm run lint
npm run typecheck
npm run test
```

## Environment and secrets

| Variable | Purpose | Notes |
|---|---|---|
| `FONTAWESOME_PACKAGE_TOKEN` | npm auth for Pro packages | **Required** for `npm install` and CI. Shell / CI secret only — never `VITE_` |
| `VITE_SUPABASE_URL` | Public Supabase URL | Optional in Phase 0 |
| `VITE_SUPABASE_ANON_KEY` | Public anon key | Optional in Phase 0 |

Do not commit tokens, service-role keys, or real player passwords. The committed [`.npmrc`](./.npmrc) references `${FONTAWESOME_PACKAGE_TOKEN}` only.

### Font Awesome Pro

Icons use the official Vue Font Awesome SVG integration:

- `@fortawesome/pro-light-svg-icons` — outline / inactive
- `@fortawesome/pro-solid-svg-icons` — active / completed / emphasis
- `@fortawesome/pro-regular-svg-icons` — available when Light is too thin
- Registry: [`src/ui/icons.ts`](./src/ui/icons.ts)

Create or copy a Package Token from [fontawesome.com/account](https://fontawesome.com/account) → **Tokens**.

### GitHub Actions

CI needs repository secret `FONTAWESOME_PACKAGE_TOKEN`:

1. Repo → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret** named `FONTAWESOME_PACKAGE_TOKEN`
3. Paste the same Package Token used locally
4. Re-run the workflow if a prior run failed on install

## Project structure

```text
src/
  app/                 # router bootstrap
  components/shared/   # shell, nav, leaderboard, icons
  features/drinkit/    # Drink It! module
  features/shipit/     # Ship It! module
  features/shared/     # game selection
  styles/              # theme tokens
  ui/                  # copy + icon registry
  lib/                 # Supabase client stub
handoff/               # rules, UX, tech spec, mockups (authoritative)
supabase/              # local tooling scaffold
docs/phase0-screenshots/
```

## Git workflow

- Default branch: `main`
- Prefer small, reviewable commits per phase or closeout
- Do not commit secrets, `.env`, or Font Awesome tokens
- Push feature work on branches when collaborating; Phase checkpoints land on `main` after Director review

```bash
git status
git pull
# …make changes…
git add -A
git commit -m ":rocket: Short imperative summary"
git push
```

## Documentation

| Document | Role |
|---|---|
| [`handoff/README.md`](./handoff/README.md) | Handoff manifest and authority order |
| [`handoff/01-Game-Rules.md`](./handoff/01-Game-Rules.md) | Scoring and eligibility |
| [`handoff/02-UX-Behavior.md`](./handoff/02-UX-Behavior.md) | Screens and interaction |
| [`handoff/03-Technical-Spec.md`](./handoff/03-Technical-Spec.md) | Architecture and phases |
| [`handoff/04-UI-Content-and-Icons.md`](./handoff/04-UI-Content-and-Icons.md) | Copy and icon registry |
| [`handoff/design/`](./handoff/design/) | Visual mockups |

## License / privacy

This is a private family cruise project. Do not publish real player credentials, Supabase service keys, or Font Awesome Package Tokens.
