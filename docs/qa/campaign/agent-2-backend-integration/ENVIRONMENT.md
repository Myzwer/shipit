# ENVIRONMENT — QA-4A Agent 2 backend integration

## Independent disposable stack

| Property | Organizer | Agent 1 | Agent 2 (this assignment) |
|---|---|---|---|
| Project id | `star-princess-local` | `star-princess-disposable-mo` | `star-princess-qa2-backend` |
| Worktree | `Ship It` | `Ship-It-disposable-mo` | `Ship-It-qa2-reliability` |
| API | `:54321` | `:55321` | `:56321` |
| DB | `:54322` | `:55322` | `:56322` |
| Studio | `:54323` | `:55323` | `:56323` |
| Inbucket | `:54324` | `:55324` | `:56324` |
| Shadow | `:54320` | `:55320` | `:56320` |
| DB volume | `supabase_db_star-princess-local` | `…-disposable-mo` | `…-qa2-backend` |
| Storage volume | separate | separate | separate |
| Auth | separate | separate | separate (synthetic Demo + qa2a guests) |

Isolation is proven at Docker project, port, volume, Auth, Storage, and cruise-id layers. A different API port alone was **not** treated as sufficient proof.

## Safe probes

Pre-start, post-start, and post-seed fingerprints are under `evidence/isolation-*.json`.

- Organizer active cruise remained `48fa40c6-e7cd-4f8f-8b81-e3e48d10eb13` through all mutating work.
- Organizer Auth user count stayed at 27; lifecycle remained `final`.
- Agent 1 cruise id changed during the campaign window while Agent 1 was actively testing — treated as Agent 1 activity, not Agent 2 interference. Agent 1 containers were never stopped/reset/reconfigured by this agent.
- Shared `.env` files in organizer and Agent 1 worktrees were **not** redirected (still `:54321` / `:55321`).

## Data policy

- Synthetic Demo identities + `qa2a-*` probe cohorts only.
- Gitignored synthetic companion-alias map remapped public companion tokens onto Demo players (no private family roster committed).
- No production credentials.

## Host capacity

Three Supabase stacks ran concurrently on Docker Desktop (~7.75 GiB Docker RAM). Memory was sufficient; no stack was sacrificed to free resources.

## Worktree config changes (harness only)

**Agent 2 archive worktree (`Ship-It-qa2-reliability`):**

- `supabase/config.toml` → project `star-princess-qa2-backend`, ports `5632x`
- Gitignored `.env` / `.env.local` / `.local/qa2-backend.env` for that worktree only

**Integrated main (`Ship It` / `visual/drinkit-home-v1`):**

- `supabase/config.toml` remains organizer `star-princess-local` `:54321` — **do not overwrite** with qa2 ports
- `tests/helpers/devEnvironmentGuard.ts` allows `:54321` / `:55321` / `:56321`; organizer mutation still requires `QA_ALLOW_ORGANIZER_MUTATION=1`; finalized refused on organizer + qa2 ports; Agent 1 `:55321` may reseed through finale
- Live probes live at `scripts/qa2a/probe/` and hard-require `:56321` independently
- Gitignored `.local/qa2-backend.env` for probe credentials
