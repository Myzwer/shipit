# Agent handoff — Phase 10E private-roster local preview

**STOP.** Local private-roster demo setup closed. Do not begin visual redesign, production provisioning, achievement editing, or new game features until the Development Director authorizes the next step.

| | |
|---|---|
| Branch | `main` |
| Phase | **10E** — private real-roster demo setup (local preview only) |
| Prior baseline | 10D HEAD `618ea92` / CI [42404408410](https://github.com/Myzwer/shipit/actions/runs/42404408410) |
| Feature tip | _(fill after commit)_ |
| Docs tip | _(fill after commit)_ |
| HEAD | _(fill after push)_ |
| CI | _(fill after green run)_ |

## Local preview state

- Target: local Supabase `127.0.0.1:54321`, cruise `development-only`
- Private roster via gitignored `private/roster/roster.local.json` when present
- Synthetic fixtures only when that file is absent (`FORCE_SYNTHETIC_ROSTER=1` forces fixtures)
- Provisional Ship It! teams labeled `[TEMP DEMO] …` — not organizer-final
- Do **not** commit private roster, UUID maps, or real-name screenshots

## Runtime fix shipped with 10E

Migration `085` updates `dev_seed_daily_assignments` bar keys to launch-candidate keys (fixes `BAR_KEY_MISSING` after catalog activate).

## Out of scope / do not start

- Visual fidelity / CSS redesign
- Production guest Auth / cruise activation
- Achievement creative edits / D-082/083/085 unlocks
- Final Ship It! team assignments (await organizer)
