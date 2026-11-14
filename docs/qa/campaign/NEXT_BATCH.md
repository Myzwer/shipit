# Recommended next testing batch (post QA-1)

QA-1 game-engine batch is complete on disposable `:55321`. Organizer Wrapped on `:54321` remains untouched (`lifecycle=final`).

## Immediate repair candidates (after diagnostic freeze)

1. **DEF-QA1-001** — decide whether Bar preview should surface companion reason when cocktail bar ≠ featured bar, or update the contract test to accept `not_featured_bar` as earlier short-circuit (P3).
2. Keep harness fixes already landed (`disposePlayers` submissions delete; MO offering from MO list).

Do **not** apply `11100` to organizer until Wrapped display batch plans it.

## Batch QA-2A — Authenticated browser E2E — **executed**

See [`qa2a-browser-e2e/SUMMARY.md`](./qa2a-browser-e2e/SUMMARY.md) — **63 passed / 3 failed / 10 blocked / 2 not_run** (78 total) on disposable `:55321` + main Vite `:5177`.

Residual: ingredient/bar claim E2E flake (E2E-011/012), REL media items, physical device list in `BLOCKED_DEVICE_TESTS.md`.

## Batch QA-2B — Media / Gallery / photo crop

| Focus | Notes |
|---|---|
| QA-ME-001 crop pinch/drag | Director open item |
| Signed gallery URLs, reactions | |
| Ship It photo gate UX copy | QA-SI-004 |

## Batch QA-2C — Achievements engine

QA-ACH-001..003, Good Spirits price gate, secret reveal — disposable catalog fixtures; do not mutate organizer Wrapped awards.

## Batch QA-3 — Wrapped provenance

Read-only organizer Plan C **or** disposable wrapped seed. Include optional `11100` on disposable only for LB achievements metadata.

## Preflight (every mutating session)

```bash
# Organizer must stay final
docker exec supabase_db_star-princess-local psql -U postgres -t -A \
  -c "select public.get_ship_clock_state()::text;" | rg 'lifecycle.: .final'

# Disposable identity
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:55321/rest/v1/
# Never: QA_ALLOW_ORGANIZER_MUTATION=1
```
