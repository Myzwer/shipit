# QA-2A — Safe execution instructions

**Mutating target:** disposable Supabase only — `http://127.0.0.1:55321`  
**App under test:** main worktree Vite on `http://127.0.0.1:5177` with disposable anon key  
**Never:** `QA_ALLOW_ORGANIZER_MUTATION=1`, organizer `:54321`, push/deploy, product defect repairs

## Prerequisites

1. Disposable stack up (`Ship-It-disposable-mo`, API `:55321`, DB `:55322`).
2. Organizer Wrapped on `:54321` remains `lifecycle=final` (read-only check OK).
3. Create gitignored env (once):

```bash
# From disposable worktree — capture keys into main .local (gitignored)
cd "/Users/josh/Documents/Web Projects/Vue/Ship-It-disposable-mo"
npx supabase status -o env > /tmp/disp.env
# Build .local/qa2a-disposable.env with VITE_SUPABASE_URL=:55321 + anon + service_role + LOCAL_TEST_PASSWORD
```

4. Provision synthetics + identities merge:

```bash
cd "/Users/josh/Documents/Web Projects/Vue/Ship It"
node scripts/qa2a/setup-synthetics.mjs
# writes .local/qa2a-identities.json (gitignored)
```

5. Seed active mid-cruise schedule **from disposable worktree** (status matches `:55321`):

```bash
cd "/Users/josh/Documents/Web Projects/Vue/Ship-It-disposable-mo"
LOCAL_TEST_PASSWORD='…' npm run db:seed-bounty-now -- --hour=14 --day=3
```

6. Start main-tree Vite against disposable:

```bash
cd "/Users/josh/Documents/Web Projects/Vue/Ship It"
export VITE_SUPABASE_URL=http://127.0.0.1:55321
export VITE_SUPABASE_ANON_KEY='…from disposable status…'
unset QA_ALLOW_ORGANIZER_MUTATION
npx vite --host 127.0.0.1 --port 5177 --strictPort
```

7. Run suites:

```bash
cd "/Users/josh/Documents/Web Projects/Vue/Ship It"
unset QA_ALLOW_ORGANIZER_MUTATION QA_E2E_IDENTITIES
export LOCAL_TEST_PASSWORD='…'
export QA_E2E_BASE_URL=http://127.0.0.1:5177
node scripts/qa2a/run.mjs --suite=all
# or: auth | drinkit | shipit | media | network | lifecycle
```

## Artifacts

| Path | Commit? |
|---|---|
| `docs/qa/campaign/qa2a-browser-e2e/*.md` + `TEST_REGISTRY.json` | Yes |
| `docs/qa/campaign/qa2a-browser-e2e/evidence/` | **No** (gitignored; may include UI with names) |
| `.local/qa2a-*.env` / `qa2a-identities.json` | **No** |

## Notes

- Chromium mobile emulation ≠ physical iPhone Safari / Android Chrome.
- Lifecycle suite reseeds clock (incl. finale); re-run `db:seed-bounty-now` before further mutating Drink/Ship journeys.
