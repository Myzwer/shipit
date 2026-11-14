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
| Catalog mid-voyage unsafe activate | **Ops violation of launch rule** (FINAL-A-CAT-001 evidence) — do not replace after gameplay begins; recovery would need Admin publish rebind (unproven for omitted keys) or controlled pre-finale repair |

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
**Ops rule (launch):** do not replace the active catalog after gameplay begins. Unsafe mid-cruise activate can leave **future bounty days unplayable** (FINAL-A-CAT-001 evidence preserved; reclassified as non-blocking when the fixed-catalog workflow is followed).
