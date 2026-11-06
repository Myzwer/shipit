# Local Supabase (Phase 1A–1B)

Local Auth + Postgres + RLS for Star Princess. **No hosted production project in this phase.**

## Required tools

| Tool | Purpose |
|---|---|
| **Docker Desktop** | Required by the Supabase CLI local stack |
| **Node 20+ / npm** | App + `npx supabase` (devDependency) |
| **Supabase CLI** | Via `npx supabase` / `npm exec supabase` |

### Docker Desktop

Keep Docker Desktop running before `supabase start`.

If `docker` is missing in a non-login shell (e.g. some IDE terminals), add Docker’s CLI to `PATH`:

```bash
export PATH="$HOME/.docker/bin:/Applications/Docker.app/Contents/Resources/bin:$PATH"
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
npx supabase db reset
```

| Migration | Purpose |
|---|---|
| `20261105000100_phase1a_identity_schema.sql` | players, memberships, teams, helpers, login directory |
| `20261105000200_phase1a_rls_policies.sql` | RLS + grants |
| `20261105000300_phase1b_restrict_player_columns.sql` | Hide `auth_user_id` / `is_admin` from ordinary SELECT; `player_roster` view |
| `20261105000400_phase2a_clock_schema.sql` | Cruise config, clock plan/events, game_control, admin audit |
| `20261105000500_phase2a_clock_functions.sql` | Ship Clock engine, admin RPCs, acceptance contract, dev seed |
| `20261105000600_phase2a1_clock_security.sql` | Player time-bypass removal, rebuild double-count fix, receipt-time contract |
| `20261105000700_phase2b_stable_clock_reads.sql` | Ordinary reads no longer rebuild/delete scheduled events |
| `20261105000800_phase2b1_atomic_plan_and_request_id.sql` | Atomic plan save + client_request_id correction reconcile |
| `20261105000900_phase2b1_request_fingerprint.sql` | Bind request id to operation fingerprint (mismatch rejected) |
| `20261105001000_phase2c_zero_delta_request_id.sql` | Zero-adjustment Set Ship Time consumes request id |
| `20261105001100_phase2c_catalog_schema.sql` | Normalized catalog / candidates / version snapshots |
| `20261105001200_phase2c_catalog_rls_and_preview.sql` | Catalog RLS + read-only admin preview RPC |
| `20261105001300_phase2c1_catalog_read_contracts.sql` | Ingredient public-card hint contract + cocktail concept uniqueness |
| `20261105001400_phase2da_disclosure_lockdown.sql` | Lock curated pools / reverse ingredient index from players |
| `20261105001500_phase2da_bounty_slot_ledger.sql` | Durable bounty slot / offer / exposure ledger |
| `20261105001600_phase2da_schedule_and_reads.sql` | Dev catalog activation + window helpers |
| `20261105001700_phase2da_generate_and_resolve.sql` | Schedule generation, player reads, private grace |
| `20261105001800_phase2da_closeout_player_time.sql` | Player bounty RPCs force `now()`; timed sim is service_role-only |

## Vue app env

```bash
cp .env.example .env
# From `npx supabase status -o env`:
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<ANON_KEY>
```

Never put `SERVICE_ROLE_KEY` in a `VITE_` variable or commit it.

## Provision development identities

```bash
export LOCAL_TEST_PASSWORD='choose-a-local-only-password-12+'
npm run db:provision
```

| Key | Games | Notes |
|---|---|---|
| `drink_only` | Drink It! | No team |
| `ship_only` | Ship It! | Demo Team Alpha |
| `both` | Both | Demo Team Alpha |
| `admin` | Both | Demo Team Bravo, `is_admin` |
| `no_games` | None | Unavailable-state testing |

Writes gitignored `.local/test-identities.json` (ids/aliases only).

## Tests

```bash
export LOCAL_TEST_PASSWORD='…same as provision…'
npm run test:rls            # Phase 1A + 1B RLS
npm run test:auth           # Auth / membership RPCs
npm run test:clock          # Phase 2A Ship Clock + finale
npm run test:integration    # all of the above
npm run test:e2e:phase1b    # Playwright (app must be running on :5173)
```

See [`docs/SHIP_CLOCK.md`](./SHIP_CLOCK.md) for clock architecture and how seven cruise days are simulated.

Integration suites no-op when Docker/Supabase/identities are unavailable (CI without a local stack). If `LOCAL_TEST_PASSWORD` is set, fixtures must load or the suite fails.

Node 20: scripts/tests pass `ws` as the Supabase Realtime transport.

## Edge Functions (Phase 6A roster)

Local Auth create / password reset for Admin roster:

```bash
npx supabase functions serve admin-roster
npm run test:e2e:phase6a
```

Service-role key stays in the Edge runtime — never in `VITE_` env. See [`docs/ADMIN_ROSTER.md`](./ADMIN_ROSTER.md).

## Auth product settings

In `supabase/config.toml`:

- `[auth] enable_signup = false` / `enable_anonymous_sign_ins = false`
- `[auth.email] enabled = true` (password sign-in for provisioned aliases)
- `[auth.email] enable_confirmations = false`
- `[functions.admin-roster] verify_jwt = true`

## Security notes

- Public `login_directory` exposes **display_name + login_alias only**
- Authenticated `players` SELECT grants exclude `auth_user_id` and `is_admin` (use `get_my_session_profile` / `is_admin()`)
- Players cannot update memberships or elevate admin via the anon/authenticated roles
- Ship It! enabled membership requires exactly one active team
