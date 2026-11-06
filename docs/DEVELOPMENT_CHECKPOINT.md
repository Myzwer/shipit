# Agent handoff — Phase 6A complete

**STOP.** Do not start the next phase until the Development Director authorizes it.

| | |
|---|---|
| Branch | `main` (clean) |
| Feature tip | `cf60a43` — Phase **6A** |
| Checkpoint tip | *(this commit)* |
| Feature CI | https://github.com/Myzwer/shipit/actions/runs/42168252996 — success |
| Checkpoint CI | *(pending)* |
| Baseline accepted | Phase **5C** `026adc4` / `da6513e` (CI `42163800441`) |

## Just shipped (6A)

1. **Provenance concurrency gate** — `drinkit_invalidate_correction_sources` locks correction rows `FOR UPDATE` before deactivate; concurrent void + persist settle consistently; admin suppression preserved
2. **Admin roster read** — `admin_list_roster` / `admin_list_teams` (Admin-only; no passwords/tokens/`auth_user_id`)
3. **Secure account create + password reset** — Edge Function `admin-roster` (service role server-side only); `@star-princess.local` login aliases; request-id idempotency; partial Auth orphan reconcile
4. **Membership / team** — `admin_set_player_access` with fingerprint concurrency; Ship It! team required when enabled; `TEAM_HISTORY_LOCKED` blocks reassignment after Ship It! submissions; no score migration; Admin self-disable blocked
5. **Admin UI** — Players & Teams section (create, reset password, edit access/team)

Migrations: `063` invalidate lock · `064` roster RPCs/ledgers. Docs: `ADMIN_ROSTER.md`.

## Verified

lint · typecheck · unit **126** · integration **275** / 34 files · E2E 6A **10/10** · build · Actions success

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npx supabase functions serve admin-roster
npm run lint && npm run typecheck && npm test && npm run test:integration
npm run test:e2e:phase6a
npm run build
```

## Stack / rules

- Vue 3 + Pinia + Supabase (local Docker)
- Auth create/reset via Edge Function secrets only — never `VITE_` service role
- New ordered migrations only — **never rewrite applied history**
- Commit only after Josh approves; push only when asked (Phase briefs may override)

## Out of scope until authorized

Achievements / unlock celebrations · Awards Mode / Wrapped · Admin Add Drink · Catalog Publish/Rollback · Production cruise dates · Full visual polish · Deployment · Production player creation / password distribution

Likely next (Director decides): achievements engine + Gallery announcements — **must finish `achievement_on_void_submission` before achievements launch**. Also schedule `ops:photo-cleanup` when deploying; deploy `admin-roster` Edge Function + secrets for production roster ops.

## Pitfalls

- Gallery Ship Time = server historical offset, not device local
- Feed near-top refresh merges; don’t replace loaded pages
- Void is soft-state; bound/voided photos stay for audit
- Daily kind is `daily_completion` (not `daily`)
- Cleanup never deletes staged / bound / voided-bound; never SQL-delete `storage.objects`
- Team reassignment after Ship It! history is blocked (`TEAM_HISTORY_LOCKED`)
- Password reset uncertain response ⇒ new `client_request_id` (passwords never stored for replay)
- Login alias fingerprint must not embed `password=` material
