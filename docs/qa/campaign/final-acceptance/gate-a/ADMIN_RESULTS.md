# Gate A — Admin Acceptance Results

## Access

| Check | Result |
|---|---|
| Admin schedule status | PASS |
| Admin clock diagnostics | PASS |
| Admin list bar bounty crews | PASS |
| Non-admin / no-games denied Admin clock | PASS |
| Non-admin initialize denied | PASS |

## Operations exercised

| Operation | Result |
|---|---|
| Bounty schedule initialize (+ replay / concurrent) | PASS |
| Pause / resume Drink It! | PASS (voyage day 3) |
| Finale access / post-finale init refuse | PASS |
| Catalog stage (incomplete validation harness) | `VALIDATION_NOT_READY` — see catalog doc |
| Catalog publish/rollback full matrix | Prior R4 repro on `:55321`; not fully re-driven Gate A for omitted-key case |
| Ship clock plan / roster / announcements / void / skip | Prior suites + unit contracts; selective Gate A coverage only |

## Safety

Admin init after finale does **not** restart cruise (`CRUISE_FINALIZED`). Organizer and Agent 2 unchanged after all Admin calls on disposable.
