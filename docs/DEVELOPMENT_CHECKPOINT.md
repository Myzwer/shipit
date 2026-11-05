# Development checkpoint

**As of:** 2026-11-05  
**Branch:** `main`  
**Phase:** 2D-B2.1 (Pause/Resume reliability) — verify then closeout

## Baseline

| Phase | Commit |
|---|---|
| 2D-B1 | `9ac4933` |
| 2D-B2 | `c6ebc80` / tip was `0f9fc46` |
| 2D-B2.1 | `9caa2f5` |

## 2D-B2.1 scope

- Durable request-id + fingerprint ledger for Pause/Resume
- Failed reconciliation never clears unresolved ops
- Persist pending request across reload/navigation
- Finale latch on mutation/status even without a prior read
- Claim It still disabled; no Phase 3 gameplay

## Security

No authenticated player RPC honors caller-controlled `p_at_utc`.

## Verify

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test
npm run test:integration
npm run test:bounty
npm run db:seed-bounty-now
npm run test:e2e:phase2db2
npm run test:e2e:phase2db2_1
npm run build
```

## Next (when authorized)

**Phase 3** — Drink It! logging wizard, claims, scoring.
