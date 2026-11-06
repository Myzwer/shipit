# Agent handoff — Phase 7A.1 complete

**STOP.** Do not start Phase 7B (final catalog / unlock popups), Awards Mode, or production achievement loading until the Development Director authorizes it.

| | |
|---|---|
| Branch | `main` (clean) |
| Feature tip | `d7035e3` — Phase **7A.1** |
| Feature CI | https://github.com/Myzwer/shipit/actions/runs/42250808769 — success |
| Baseline | Phase **7A** feature `74b7927` / checkpoint `988b8d2` / docs tip `5650324` |
| This phase | Phase **7A.1** — Exclusive First order, historical Ship Time, dev RPC lockdown |

## Just shipped (7A.1)

1. **Gate 1** — Exclusive winners use first-qualifying submission (prefix/`as_of` eval), not earliest any-evidence; Void reassignment preserves that order (`073`)
2. **Gate 2** — Ship-time / Thanksgiving use `clock_offset_at` (Gallery-parity historical wall time)
3. **Gate 3** — `dev_submit_scavenger_at` / drink / daily: service_role + development-only checks; EXECUTE revoked from anon/authenticated
4. Unread race: My Achievements refreshes cursor after mark so nav cannot resurrect a stale unread bit

Migration: `073` phase7a1_exclusive_clock_dev_gates.

## Verified

lint · typecheck · unit **153** · integration **326** / 40 files · E2E 7A **6/6** · build · Actions success

## Out of scope until authorized

Phase 7B catalog/UI · Awards Mode / Wrapped · Real cruise roster · Visual polish · Deployment

See also: [`docs/ACHIEVEMENTS.md`](./ACHIEVEMENTS.md).
