# Admin Roster & Account Management (Phase 6A + 6B1 Auth gate)

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

## Auth request reservation (Phase 6B1 gate)

Phase 6A’s `admin_roster_auth_begin` held only a transaction advisory lock and did not write an in-progress ledger row before Auth Admin side effects. Concurrent identical UUIDs could both proceed.

**6B1 fix:**

1. `admin_roster_auth_begin` inserts a durable `status = in_progress` reservation (fingerprint, lease) **before** any Auth create/update.
2. Only the worker that receives `reserved: true` may call Auth Admin APIs.
3. Same UUID + same fingerprint while in progress → `reserved: false` / `OPERATION_IN_PROGRESS` (wait + reconcile); never a second Auth create/reset.
4. Same UUID + different fingerprint → `REQUEST_ID_OPERATION_MISMATCH` (rejected).
5. `admin_roster_auth_complete` writes terminal `completed`/`failed` only for a matching fingerprint; mismatched completions cannot overwrite another request’s result.
6. Completed v1 rows remain replayable (`replay: true` + prior `result_json`).
7. Stale `in_progress` leases may be reclaimed after expiry so interrupted ops are reconcilable (including Auth-created-but-DB-incomplete orphans via `orphan_auth_user_id`).
8. Fingerprints and ledgers never store plaintext passwords or recoverable password material. An unknown password-reset outcome stays explicit — never reported as success.

Migration: `065` (`phase6b1_auth_request_reservation`). Parallel coverage: `tests/integration/admin.phase6b1.auth_reservation.test.ts`.

## Create player

1. Admin UI collects display name, password, game toggles, optional Ship It! team.
2. Client sends `client_request_id` (UUID) + payload to `admin-roster`.
3. Function verifies Admin via `admin_roster_resolve_actor`.
4. Fingerprint (no password) is reserved in `admin_roster_auth_requests` (`in_progress`) before Auth.
5. Auth user is created (or an orphan Auth row with the same alias is reconciled). Concurrent workers without the reservation wait or replay — they do not adopt an unrelated already-linked identity.
6. `admin_provision_player_record` (service_role) inserts/links `players`, memberships, team.
7. Ledger completion + audit `roster.player_create` — **never logs the password**.

**Double-tap / lost response:** same `client_request_id` + same fingerprint returns the prior result (`idempotent_replay`). A different password still replays the prior create — use a **new request id** only when intentionally creating another account.

**Partial failure:** if Auth succeeds and DB provisioning fails, the function attempts Auth delete. If delete fails, `orphan_auth_user_id` is stored on the ledger. A later create with the same alias links the orphan Auth user instead of minting a duplicate.

## Password reset

1. Admin enters a new password (≥12 chars) for a roster player.
2. Edge Function reserves the request, then updates Auth via `updateUserById` only if reserved.
3. Audit `roster.password_reset` records only player id / success flag — **never the password**.
4. Passwords are never placed in URLs, localStorage pending records, analytics, or result JSON.

**Uncertain response:** do not assume success. Reconcile with `admin_find_roster_auth_request_by_id`. Because plaintext passwords are never stored, a completed prior intent cannot re-apply a “remembered” password — submit a **new** `client_request_id` (new reset intent) if you need to set credentials again after ambiguity. Concurrent callers racing an in-progress reset receive `OPERATION_IN_PROGRESS`, not a false success.

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

1. Deploy migrations through `066` (Auth reservation `065` + Add Drink/export `066`; keep `063`/`064`).
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
npx supabase functions serve admin-roster
npm run lint && npm run typecheck && npm test
npm run test:integration
LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase6a
LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase6b1
npm run build
```

## Related

- Provenance concurrency gate: migration `063` locks correction rows during void invalidation.
- Provision script: `scripts/provision-local-identities.mjs` (dev fixtures only).
- Add Drink + Export: [`docs/ADMIN_ADD_DRINK_AND_EXPORT.md`](./ADMIN_ADD_DRINK_AND_EXPORT.md).
