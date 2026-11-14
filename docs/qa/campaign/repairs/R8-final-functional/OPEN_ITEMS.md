# R8 — Open items

## Still open (not silent deferrals of high-impact player bugs)

| Item | Class | Impact | Owner |
|---|---|---|---|
| REP-AUTH-001 JWT residual after signOut | Deferred / by design | Shared-device residual access until access-token TTL (~1h). Client clears session + admin pendings; refresh revoked via global scope. | Ops hygiene / optional future denylist |
| Tropical+frozen earnability | Configuration / content | R7 partial — needs organizer eligible-drink list + catalog republish | Organizer |
| Good Spirits price evidence | Configuration | Achievements gated pending price proof | Organizer |
| Companion UUID map (D-086–D-093) | Configuration | Private alias map gitignored | Organizer |
| Organizer migrations `10900`→`11400` | Configuration | Apply only after snapshot + approval; R6 rank fix before relying on `11100` boards | Ops |
| Active catalog republish of launch-candidate-v1 | Configuration | Frozen tag / aliases need live publish | Organizer |
| Agent 2 `:56321` Wrapped/R6 migrations | Ops | Only if that stack is reused | Agent 2 / ops |

## Physical-device verification required

- Real HEIC capture/convert on iPhone Safari
- Pinch-to-crop framing
- Safari bfcache resume mid-wizard
- Ship-Wi-Fi soak (gallery signed URL long session already unit+60s proven in R3)

## Explicitly not open as unrepaired P0/P1 product defects

- REL-006 — repaired
- E2B-002 — harness-only
- DEF-QA1-001 — contract corrected; eligibility priority intentional
- INT-CRW-001 / INT-CLK-001 / INT-CAT-007 — repaired in UI/client
- R1–R7 must-repair groups — remain repaired per prior checkpoints

## Ready for

Comprehensive post-repair regression campaign (full browser E2E + ops launch checklist). No known high-impact player-facing R8 defect is quietly deferred.
