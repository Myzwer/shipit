# QA-4A backend integration probes

Relocated from Agent 2’s flat `scripts/qa2a/probe-*.mjs` layout so they do **not** collide with the Playwright E2E harness (`scripts/qa2a/lib/`, `suites/`, `run.mjs`).

| Script | Purpose | Target |
|---|---|---|
| `lib.mjs` | Shared qa2 clients, SQL, safety | `:56321` only |
| `admin-catalog.mjs` | Admin / catalog / schedule probes | `:56321` |
| `achievements.mjs` | Achievement award integration | `:56321` |
| `wrapped-aggregation.mjs` | Wrapped SQL / ranks / venues | `:56321` |
| `roster-and-mo.mjs` | Roster RPC + Mobile Order helper | `:56321` |

## Safety

- Hard-refuse unless API URL is `http://127.0.0.1:56321`.
- Credentials from gitignored `.local/qa2-backend.env` only (never organizer / Agent 1 env).
- Synthetic `qa2a-*` aliases only.
- Organizer cruise id is read-only fingerprinting.
- **Do not** run these against `:54321` or `:55321`.

## Prerequisites

1. Independent disposable stack `star-princess-qa2-backend` on ports `5632x` (see Agent 2 worktree archive or `docs/qa/campaign/agent-2-backend-integration/ENVIRONMENT.md`).
2. Main-tree `supabase/config.toml` stays on organizer `:54321` — do **not** overwrite it to run probes; use the Agent 2 worktree or a dedicated qa2 config outside this file.
3. `.local/qa2-backend.env` present with `VITE_SUPABASE_URL=http://127.0.0.1:56321` and keys.

## Commands

```bash
npm run qa4a:probe:admin-catalog
npm run qa4a:probe:achievements
npm run qa4a:probe:wrapped
npm run qa4a:probe:roster-mo
```

Mutating — not part of the pre-repair integration baseline.
