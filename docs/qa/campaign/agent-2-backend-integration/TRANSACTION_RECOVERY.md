# TRANSACTION / NETWORK RECOVERY INTEGRATION

All injections targeted **qa2 `:56321` only**. Environment reset via `dev_reset_preview_gameplay_ledger` + `dev_seed_cruise_clock` between incompatible scenarios.

## Results

| Area | Injection | Authoritative DB outcome |
|---|---|---|
| Catalog publish shortage | Apply-time `REMAINING_POOL_SHORTAGE` | Full rollback — versions/offers/globals unchanged |
| Catalog concurrent publish | Parallel clients | Advisory lock serializes; no torn pointer |
| Catalog double-tap (ADM-009) | Second publish while pending | Server may succeed; UI loses reconcile handle |
| Catalog preview fail (CAT-001) | Preview after stage | DB staged OK; UI pending stuck |
| Roster in_progress (ADM-001/002) | Reconcile / 409 during lease | Ledger durable; client falsely `failed` |
| Bounty skip + 502 (ADM-003) | Forged gateway after apply | Skip applied; client `failed` |
| Void / skip / pause abort (B010) | Client abort | Server applied 8/8; retry never double-applied |
| Achievement grant / void | Qualifying logs + void | Awards idempotent; void revokes unsupported |
| Finale latch (B011) | Ship time past finale | Irreversible latch; no backend confirmation gate |

## Recovery posture

- Backend generally favors **durable apply + idempotent replay**.
- Frontend pending/reconcile paths remain the weak link (ADM-001/002/003/008/009).
- Disposable env was left recoverable (launch-candidate baseline restored by admin probe cleanup).
- Organizer and Agent 1 were never reset.
