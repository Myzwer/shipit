# Agent handoff — Phase 7A.1 complete

**STOP.** Do not start Phase 7B (final catalog / unlock popups), Awards Mode, or production achievement loading until the Development Director authorizes it.

| | |
|---|---|
| Branch | `main` |
| Feature tip | *(pending commit)* — Phase **7A.1** |
| Baseline | Phase **7A** feature `74b7927` / checkpoint `988b8d2` / docs tip `5650324` |
| This phase | Phase **7A.1** — Exclusive First order, historical Ship Time, dev RPC lockdown |

## Just shipped (7A.1)

1. **Gate 1** — `achievement_owner_first_qualifying_submission` + as-of prefix eval; exclusive winners ordered by qualifying event, not earliest any-evidence; Void reassignment uses the same rule (`073`)
2. **Gate 2** — Ship-time / Thanksgiving use `clock_offset_at` / Gallery-parity historical wall time
3. **Gate 3** — `dev_submit_scavenger_at` / drink / daily: service_role + development-only body checks; EXECUTE revoked from anon/authenticated

Migration: `073` phase7a1_exclusive_clock_dev_gates.

## Out of scope until authorized

Phase 7B catalog/UI · Awards Mode / Wrapped · Real cruise roster · Visual polish · Deployment

See also: [`docs/ACHIEVEMENTS.md`](./ACHIEVEMENTS.md).
