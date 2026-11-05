# Star Princess Games

Private mobile-first web app for **Drink It!** and **Ship It!** on a seven-day Princess cruise.

**Current status:** Phase 0 foundation only — themed shells, routing, tooling. No authentication, scoring, or live data yet.

Authoritative product docs live in [`handoff/`](./handoff/). Start with [`handoff/05-Cursor-START-HERE.md`](./handoff/05-Cursor-START-HERE.md) and [`handoff/README.md`](./handoff/README.md).

---

## Required local tooling

- **Node.js 20+** (Node 20.19+ recommended)
- **npm 10+** (comes with Node)
- A modern browser (Safari or Chrome on phone-sized viewport for visual checks)
- Optional later: [Supabase CLI](https://supabase.com/docs/guides/cli) for local database work (not required to view Phase 0 shells)
- **Font Awesome Package Token** required for `npm install` (Pro Light/Solid/Regular) — see below

---

## First-time install

1. Ensure `FONTAWESOME_PACKAGE_TOKEN` is exported in your shell (Package Token from [fontawesome.com/account](https://fontawesome.com/account) → Tokens). Recommended macOS setup:

   ```bash
   # ~/.config/fontawesome/env  (private; not in this repo)
   export FONTAWESOME_PACKAGE_TOKEN='…'
   ```

   Then `source` that file from `~/.zshrc`.

2. Confirm without printing the token:

   ```bash
   test -n "$FONTAWESOME_PACKAGE_TOKEN" && echo "FA package token is set"
   ```

3. Install dependencies:

```bash
cd "/Users/josh/Documents/Web Projects/Vue/Ship It"
npm install
```

Copy the environment template (optional in Phase 0 — shells run without Supabase values):

```bash
cp .env.example .env
```

Do **not** put secrets in `.env` files that get committed. `.env` is gitignored. Never put the Font Awesome token in a `VITE_` variable.

---

## Launch the app locally

```bash
npm run dev
```

Then open:

**http://127.0.0.1:5173/**

Useful routes:

| URL | Screen |
|---|---|
| http://127.0.0.1:5173/ | Game selection |
| http://127.0.0.1:5173/drinkit | Drink It! Home shell |
| http://127.0.0.1:5173/shipit | Ship It! Home shell |

Tip: use browser responsive mode at ~390×844 to compare against the mockups in `handoff/design/`.

### Stop and restart

- **Stop:** focus the terminal running Vite and press `Ctrl+C`
- **Restart:** run `npm run dev` again

---

## Checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Preview the production build:

```bash
npm run build
npm run preview
```

---

## Environment variables (no secrets in git)

| Variable | Purpose | Phase 0 |
|---|---|---|
| `VITE_SUPABASE_URL` | Public Supabase project URL | Optional / unused by shells |
| `VITE_SUPABASE_ANON_KEY` | Public anon key (RLS-protected) | Optional / unused by shells |
| `FONTAWESOME_PACKAGE_TOKEN` | npm auth for Pro packages | **Required** for install/CI |

**Never** prefix Font Awesome or service-role keys with `VITE_`. Never commit tokens.

---

## Font Awesome Pro

Phase 0 uses the official Vue SVG integration with:

- `@fortawesome/pro-light-svg-icons` — outline / inactive
- `@fortawesome/pro-solid-svg-icons` — active / completed / emphasis
- `@fortawesome/pro-regular-svg-icons` — available when Light is too thin at mobile sizes
- Central registry: `src/ui/icons.ts` (semantic keys from `handoff/04-UI-Content-and-Icons.md` §13)

The committed `.npmrc` uses `${FONTAWESOME_PACKAGE_TOKEN}` only — no literal token.

### GitHub Actions secret

CI installs Pro packages via repository secret `FONTAWESOME_PACKAGE_TOKEN`:

1. Open the GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. **New repository secret**
3. Name: `FONTAWESOME_PACKAGE_TOKEN`
4. Value: your Font Awesome **Package Token** (same as local; not a Kit/API token)
5. Save, then re-run the failed workflow if needed

For Vercel later, add the same name as a **build** environment variable (still not `VITE_`).

---

## External services (not configured in Phase 0)

| Service | Status |
|---|---|
| Supabase (Auth / DB / Storage) | Local `supabase/config.toml` scaffold only — no production project |
| Vercel | `vercel.json` SPA fallback ready — **do not deploy** until authorized |
| Font Awesome Pro registry | Package Token required locally and in GitHub Actions |

---

## Project layout (high level)

```text
src/
  app/                 # router
  components/shared/   # nav, shell, leaderboard, icons
  features/drinkit/    # Drink It! Home shell
  features/shipit/     # Ship It! Home shell
  features/shared/     # game selection
  styles/theme.css     # semantic theme tokens
  ui/icons.ts          # Font Awesome semantic registry
  ui/copy.ts           # approved Phase 0 strings
  lib/supabase.ts      # client stub (inactive until env set)
handoff/               # authoritative rules, UX, tech, mockups
supabase/              # local tooling scaffold
```

---

## Phase boundary

Phase 0 intentionally excludes auth, schemas, scoring, wizards, galleries, achievements, admin, and production catalogs. Do not start Phase 1 until the Development Director reviews this checkpoint.
