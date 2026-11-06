# Admin Roster & Account Management (Phase 6A)

Organizer-only **Players & Teams** controls inside the existing `/admin` SPA. No public signup, no self-service recovery, no separate account app.

## Architecture

| Concern | Where it runs | Why |
|---|---|---|
| Roster read | Postgres RPC `admin_list_roster` / `admin_list_teams` | Admin JWT + `require_admin()`; no secrets |
| Membership / team / active | Postgres RPC `admin_set_player_access` | Row locks + request-id ledger + state fingerprint |
| Create player (Auth + row) | Edge Function `admin-roster` (`create_player`) | Needs Auth Admin API (service role) |
| Password reset | Edge Function `admin-roster` (`reset_password`) | Needs Auth Admin API (service role) |

Browser code uses only the **anon key** + the organizer’s user JWT. The **service-role key never appears in Vite env or SPA source**.

Login identity convention (unchanged from Phase 1 provision scripts):

- `login_alias` = Auth email
- Domain: `@star-princess.local`
- Derived from display name: `jane.player@star-princess.local`

## Create player

1. Admin UI collects display name, password, game toggles, optional Ship It! team.
2. Client sends `client_request_id` (UUID) + payload to `admin-roster`.
3. Function verifies Admin via `admin_roster_resolve_actor`.
4. Fingerprint (no password) is ledgered in `admin_roster_auth_requests`.
5. Auth user is created (or an orphan Auth row with the same alias is reconciled).
6. `admin_provision_player_record` (service_role) inserts/links `players`, memberships, team.
7. Audit `roster.player_create` — **never logs the password**.

**Double-tap / lost response:** same `client_request_id` + same fingerprint returns the prior result (`idempotent_replay`). A different password still replays the prior create — use a **new request id** only when intentionally creating another account.

**Partial failure:** if Auth succeeds and DB provisioning fails, the function attempts Auth delete. If delete fails, `orphan_auth_user_id` is stored on the ledger. A later create with the same alias links the orphan Auth user instead of minting a duplicate.

## Password reset

1. Admin enters a new password (≥12 chars) for a roster player.
2. Edge Function updates Auth via `updateUserById`.
3. Audit `roster.password_reset` records only player id / success flag — **never the password**.
4. Passwords are never placed in URLs, localStorage pending records, analytics, or result JSON.

**Uncertain response:** do not assume success. Reconcile with `admin_find_roster_auth_request_by_id`. Because plaintext passwords are never stored, a completed prior intent cannot re-apply a “remembered” password — submit a **new** `client_request_id` (new reset intent) if you need to set credentials again after ambiguity.

## Membership & team rules

`admin_set_player_access` updates `players.active`, `game_memberships`, and active `team_memberships` in one transaction.

- Ship It! enabled ⇒ exactly one active team (existing deferred constraints).
- Disabling a game blocks **new** submits / private game reads via `has_game` / session profile refresh on navigation.
- Historical submissions, scores, photos, and audit rows are **not** deleted.
- Idempotent UUID replays of already-accepted submits still return the original result; they do not score twice.
- Optimistic concurrency: client must send `state_fingerprint` from the last roster read; mismatch → `STALE_ROSTER_STATE`.
- Admin cannot set **their own** `active=false` (`ADMIN_SELF_LOCKOUT`).
- Provisioning / access RPCs never grant `is_admin`.

### Historical team protection

If the player authored any Ship It! submission with a `team_id`, team reassignment returns `TEAM_HISTORY_LOCKED`. No score migration is offered — historical completions keep their stored `team_id`.

## Authorization

- Route meta `requiresAdmin` + server `require_admin()` / Edge Function actor check.
- Regular and Ship It!-only players are denied roster RPCs and Edge Function actions.
- Direct Edge Function calls without an Admin JWT return `403 ADMIN_REQUIRED`.

## Production setup

1. Deploy migrations through `064` (and `063` provenance lock).
2. Deploy Edge Function `admin-roster` with Supabase secrets:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (function secret only)
3. Confirm `enable_signup = false` remains in Auth settings.
4. Create real players via Admin (or a one-off privileged script mirroring the Edge Function). Distribute passwords out of band.
5. Do **not** put service-role keys in Vercel/`VITE_` variables.

## Local verification

```bash
npx supabase db reset
LOCAL_TEST_PASSWORD='…' npm run db:provision
# Edge runtime serves supabase/functions after db start / functions serve
npm run lint && npm run typecheck && npm test
npm run test:integration
LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase6a
npm run build
```

## Related

- Provenance concurrency gate: migration `063` locks correction rows during void invalidation.
- Provision script: `scripts/provision-local-identities.mjs` (dev fixtures only).
