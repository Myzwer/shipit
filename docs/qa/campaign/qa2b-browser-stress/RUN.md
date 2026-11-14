# QA-2B — Safe execution

**Mutating target:** disposable Supabase only — `http://127.0.0.1:55321`  
**Never:** `QA_ALLOW_ORGANIZER_MUTATION=1`, organizer `:54321`, push/deploy, product repairs

```bash
unset QA_ALLOW_ORGANIZER_MUTATION QA_E2E_IDENTITIES
export QA_E2E_BASE_URL=http://127.0.0.1:5177

# Flake investigation (E2E-011/012)
node scripts/qa2b/investigate-bounty-flakes.mjs --iters=3

# Stress / media / long / outstanding
node scripts/qa2b/run-stress.mjs --suite=all
# or: stress | media | long | outstanding

# Drink It re-check after harness fix (writes qa2a registry — restore from git if needed)
node scripts/qa2a/run.mjs --suite=drinkit
```

Evidence under `evidence/` is gitignored.
