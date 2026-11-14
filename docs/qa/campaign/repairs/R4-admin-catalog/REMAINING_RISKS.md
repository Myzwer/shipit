# R4 — Remaining Risks

## Deferred to later batches (by design)

| Item | Owner | Notes |
|---|---|---|
| First production bounty schedule generator | **R5** (`INT-SCHED-001`) | Publish still does not create the first schedule; R4 only restored catalog Admin usability |
| Full ADM-009 ops soak on `:56321` | R5 / QA-4A re-probe | Pending guard fixed in R4; Agent 2 probe stack not mutated here |
| CAT-002 / mobile-order as normal bar | R8 / catalog polish | Validator still accepts MO as a bar in client preview |
| RISK-ADM-A Set Ship Time past finale | Product / UI guard | Backend latch unchanged; R4 did not add a confirmation gate |
| RISK-ADM-B Admin crews list mutates day | Known design | Opening Drink It crews still ensures/locks |
| Concurrent Edge 409 create under load | Ops soak | Classification fixed; multi-admin race not soak-tested live |
| Browser Admin click-path matrix | Manual / QA-2A | Pre-cruise, paused, finale Admin reachability contracts are source + RPC proven; full Playwright not re-run |

## Still-unverified scenarios

- Live INT-ADM-001L/002L against a real Edge `in_progress` row concurrent create (unit + missing-ledger covered; true 409 collision not induced on `:55321`).
- Live INT-ADM-003L forged 502 after successful skip (classification unit-proven; no gateway forge harness on `:55321`).
- Live INT-ADM-004L malformed UUID vs FINALE paths beyond unit mocks.
- Shared-device signOut handoff in a real browser (source contract + clear fns exercised).
- Legacy clients that already have stuck `publish` pending with a stage request id: Discard recovers without DB change; operators should Discard once after upgrade.

## Safety preserved

- Organizer `:54321` — no mutations
- Agent 2 `:56321` — no mutations; QA-4A probes not pointed elsewhere
- No `QA_ALLOW_ORGANIZER_MUTATION=1`
- No migrations applied
- Friday finale latch / ship-time math / scoring / void rules unchanged
- R1 submission integrity and R2 media recovery untouched
