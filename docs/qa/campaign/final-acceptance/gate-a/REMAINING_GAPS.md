# Gate A — Remaining Gaps

## Must close before trusting mid-cruise menu ops

1. **FINAL-A-CAT-001** — Prove Admin publish+rebind when a future-scheduled offering is absent (atomic fail or successful rebind). Do not use `dev_activate_catalog_fixture` on a live voyage.  
2. Menu-generation agent dependency: only emit catalogs that pass Admin preview against the **remaining** scheduled pool.

## Coverage gaps (not cruise-blocking if menu is frozen pre-boarding)

| Gap | Impact |
|---|---|
| Full 50 Ship It accepted submits with real photos | Ranking/photo provenance under load |
| Direct earn matrix for 174 achievements | Award confidence beyond map + shared engine |
| Fresh empty-DB migration apply | Organizer upgrade rehearsal |
| 80/80 Wrapped metric re-aggregation on Gate A voyage data | Sparse data; cite prior 77/80 |
| Browser E2E lost-ack / device HEIC | Client resilience on ship Wi-Fi |
| Legacy integration suite from main worktree | Status URL points at organizer — needs disposable status shim or worktree |
| Agent 2 missing migrations 11200/11300 | Do not use Agent 2 for schedule-init proofs until upgraded |

## Environment / device limitations

- Three local Supabase stacks; Gate A only mutates Agent 1  
- No physical device pass  
- Evidence dumps gitignored under `docs/qa/**/evidence/`  
- `.local/qa2a-disposable.env` unquoted path-with-spaces breaks naive `source` — export keys explicitly

## Explicit non-claims

- Not all 174 achievements directly earned in Gate A  
- Not all 80 Wrapped metrics re-aggregated in Gate A  
- Not Gate B  
- No organizer migrate / push / deploy
