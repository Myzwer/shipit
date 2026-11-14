# Gate A — Failure Injection & Recovery

## Exercised

| Scenario | Result |
|---|---|
| Idempotent drink replay (lost response / double tap) | PASS (voyage + R1 contracts) |
| Concurrent schedule init | PASS |
| Schedule init shortage (no partial ledger) | PASS |
| Paused game hides bounty exposure | PASS |
| Post-finale submit rejected | PASS |
| Non-admin forbidden Admin RPC | PASS |
| Catalog mid-voyage unsafe activate | **FAIL product** FINAL-A-CAT-001 — recovery requires re-init only when allowed (not after finale) or Admin publish rebind |

## R1 / R2 / R3 residual

| Item | Gate A stance |
|---|---|
| R1 submission integrity | Unit + prior disposable integration green |
| R2 Storage SDK empty-blob / abandon | **Residual risk retained** — documented; not re-opened as new defect |
| R3 signed URL refresh | Unit contracts green; real expiry previously proven on `:55321` |

## Not fully injected this gate

- True network partition mid-HTTP (browser)  
- Expired JWT residual (R8 deferred Auth design)  
- Image upload bind interruption with real Storage objects for all 50 Ship It challenges  

## Unrecoverable state risk

Players are not left unrecoverable by idempotent replays.  
**Ops risk:** unsafe mid-cruise catalog activate can leave **future bounty days unplayable** until a correct publish/rebind or (pre-finale) controlled schedule repair — that is FINAL-A-CAT-001.
