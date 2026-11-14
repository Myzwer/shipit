# R1–R7 Integration — Remaining Risks

## Fully repaired (confirmed this checkpoint)

- REP-SUB-001 / R1 submission idempotency contracts
- REP-MEDIA-001 / R2 media abandon contracts (unit)
- REP-SIGNED-001 / R3 signed URL contracts (unit)
- REP-ADM-* / REP-CAT-LOCK-001 / R4 admin-catalog suite
- REP-SCHED-001 schedule init presence + R5 contracts
- REP-WRP-RANK-001 / REP-WRP-MO-001 / R6 on disposable `:55321`
- REP-ACH-MAP-001 / ACH-003 release map coverage
- REP-ACH-GAUNT-001 UI `covered_count` location alignment (`11400`) + prior live ACH-002 probes

## Partially repaired

| Item | What’s done | What’s left |
|---|---|---|
| REP-ACH-FROZEN-001 | `frozen` tag on Frozen Aperol Spritz; tropical collections verification-gated | Organizer tropical+frozen list; republish launch catalog; live D-033 unlock on active catalog |
| REP-ACH-EMPTY-001 | Ingredient/tag aliases in launch JSON | Active catalog publish; Good Spirits price verification |
| Companion achievements D-086–D-093 | Mapped + correctly blocked | Private UUID map for cruise |
| D-082 / D-085 | Mapped + organizer-blocked | Explicit organizer enable/keep-blocked decision |

## Configuration / content requirements (launch setup)

1. Republish **launch-candidate-v1** (with R7 `frozen` / `spirit-dark` / aliases) as active catalog after schedule fixture work.
2. Organizer decision: frozen+tropical eligible drink keys (or confirm none).
3. Organizer decision: D-082 / D-085 production enablement.
4. Provision companion UUID map (gitignored) for D-086–D-093.
5. Apply migrations `10900`→`11400` to organizer **only** after ops snapshot + approval (R6 rank fix before relying on `11100` boards).
6. Agent 2 `:56321` still needs `11200`/`11300` if that stack is reused for Wrapped proofs.

## Still-blocked / expected-red tests

| Item | Status |
|---|---|
| REL-006 empty-MIME GIF | **Expected red — R8** |
| E2B-002 claim race | Expected red — R8 / REP-CLAIM-001 |
| DEF-QA1-001 preview reason | Pre-existing |
| INT-ACH-01 strict single-award on day 1 | Probe expectation vs `d076` day-1 behavior |
| ACH-001 live on schedule-fixture active catalog | Content publish dependency |
| Full QA-4A probe matrix on `:56321` | Deferred (protected stack) |

## R8 issues (not started)

- REP-MIME-001 (GIF empty MIME)
- REP-CLAIM-001 (E2B-002)
- REP-PREVIEW-001 / crew mutate UX / JWT residual / catalog error polish per consolidation matrix

## Physical-device / manual remaining

- HEIC real-device path, pinch crop, Safari bfcache
- Ship-Wi-Fi soak / Gallery long soak (R3 used 60s floor)
- Organizer cruise config (dates, roster, teams)
- Independent seven-day voyage rehearsal

## Explicit non-claims

- Did not start R8
- Did not push or deploy
- Did not apply migrations to organizer
- Did not mutate Agent 2 working tree or require a second `:56321` achievements probe
- Did not claim 174 live unlock proofs
