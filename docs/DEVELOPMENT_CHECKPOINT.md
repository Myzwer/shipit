# Agent handoff — Phase 10B launch-candidate closeout

**STOP.** Do not begin visual fidelity, production provisioning, deployment, or another phase until the Development Director authorizes the next step.

| | |
|---|---|
| Branch | `main` |
| Phase | **10B** — launch-candidate content finalization |
| Prior baseline | 10A feature `90b5ef2` / docs `700b93f` / HEAD `202e8e9` / CI [42391843165](https://github.com/Myzwer/shipit/actions/runs/42391843165) |
| Feature tip | `4368cd1` — Phase **10B** launch-candidate catalog |
| Docs tip | _(fill after docs commit)_ |
| HEAD | _(fill after push)_ |
| CI | _(fill after green run)_ |

## Runtime gate (still open)

Local Docker daemon remains **unavailable** in the agent environment. Live `demo:seed`, browser smoke, and screenshots stay **PENDING** (`docs/DEMO_SCENARIOS.md`).

## Launch-candidate pools

| Metric | Value |
|---|---:|
| Bars / offerings / unique cocktails | 13 / 210 / 110 |
| Category A / B / C / D | 0 / 191 / 19 / 0 |
| Cocktail eligible | **79** (+10 GS pending) |
| Ingredient eligible | **44** (Basil excluded) |
| TS readiness | `ready_for_scheduling` |
| `safeToPublish` | always **false** in TS preview |

## Just shipped

1. Category A/B/C/D price evidence + server allowlist gates (migrations 081–083)
2. `content/catalogs/launch-candidate-v1.json` (shared with demos)
3. Organizer ranking + filtered-source approval manifests
4. Candidate reconciliation + evidence docs
5. Guarded production achievement release path (not activated)
6. Demo scenarios pointed at launch-candidate catalog

## Out of scope / do not start

- Visual fidelity / CSS redesign
- Production guest provisioning / cruise activation / Vercel
- Final creative achievement revisions / Wrapped jokes
- Implementing the photo-reading Menu Reconstruction Agent
- Gameplay redesign
