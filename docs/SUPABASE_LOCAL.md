# Local Supabase (Phase 1A)

Local Auth + Postgres + RLS for Star Princess. **No hosted production project in this phase.**

## Required tools

| Tool | Purpose |
|---|---|
| **Docker Desktop** | Required by the Supabase CLI local stack |
| **Node 20+ / npm** | App + `npx supabase` (devDependency) |
| **Supabase CLI** | Via `npx supabase` / `npm exec supabase` |

### Docker Desktop

Required and verified for Phase 1A. Keep Docker Desktop running before `supabase start`.

If `docker` is missing in a non-login shell (e.g. some IDE terminals), add Docker’s CLI to `PATH`:

```bash
export PATH="$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

### Supabase CLI

Already listed in `devDependencies`. Use:

```bash
npx supabase --version
```

## Start / stop

```bash
npx supabase start
npx supabase status
npx supabase status -o env   # prints local URL + keys (do not commit)
npx supabase stop
```

API URL is typically `http://127.0.0.1:54321`.

## Migrations

```bash
# Apply to local (also runs on fresh `supabase start`)
npx supabase db reset
```

`db reset` recreates the local DB, applies `supabase/migrations/*`, and clears data.

Phase 1A migrations:

1. `20261105000100_phase1a_identity_schema.sql` — players, memberships, teams, helpers, login directory
2. `20261105000200_phase1a_rls_policies.sql` — RLS + grants

## Local env for the Vue app

```bash
cp .env.example .env
```

After `npx supabase status -o env`, set:

```bash
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<ANON_KEY from status>
```

Never put `SERVICE_ROLE_KEY` in a `VITE_` variable or commit it.

## Provision local test identities

Uses the Auth Admin API + service role from `supabase status` (not committed):

```bash
export LOCAL_TEST_PASSWORD='choose-a-local-only-password-12+'
npm run db:provision
```

Creates Auth users + rows for:

| Key | Games | Notes |
|---|---|---|
| `drink_only` | Drink It! | No team |
| `ship_only` | Ship It! | Demo Team Alpha |
| `both` | Both | Demo Team Alpha |
| `admin` | Both | Demo Team Bravo, `is_admin` |

Writes gitignored `.local/test-identities.json` (ids/aliases only — password stays in your env).

## RLS integration tests

```bash
export LOCAL_TEST_PASSWORD='…same as provision…'
npm run test:rls
```

These tests **sign in as restricted clients** (anon + authenticated). They no-op when Docker/Supabase/identities are unavailable (including default CI without a local stack). If `LOCAL_TEST_PASSWORD` is set, fixtures must load or the suite fails (no false-green).

Node 20 note: local Node scripts/tests pass `ws` as the Supabase Realtime transport (`supabase-js` requires this below Node 22).

Default `npm test` continues to run unit tests only.

## Auth product settings (local config)

In `supabase/config.toml`:

- `[auth] enable_signup = false` / `enable_anonymous_sign_ins = false`
- `[auth.email] enabled = true` (password sign-in for provisioned aliases)
- `[auth.email] enable_confirmations = false` (no confirmation UX)

## Security notes

- Public `login_directory` exposes **display_name + login_alias only**
- Players cannot update `is_admin`, memberships, or teams via the anon/authenticated roles
- Ship It! enabled membership requires exactly one active team (DB trigger + unique index)
- `SECURITY DEFINER` helpers set `search_path = public` and grant `EXECUTE` only to `authenticated`

## After Docker is installed

```bash
npx supabase start
npx supabase db reset
export LOCAL_TEST_PASSWORD='…'
npm run db:provision
npm run test:rls
npm run lint && npm run typecheck && npm run test && npm run build
```
