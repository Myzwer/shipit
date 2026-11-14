# R4 — Regression Results

Environment: disposable Supabase `http://127.0.0.1:55321`. Never `QA_ALLOW_ORGANIZER_MUTATION=1`. Organizer `:54321` and Agent 2 `:56321` untouched (probe scripts that hard-require `:56321` were **not** executed).

Baseline application HEAD: `9f4a48a`.

## Before (known-failing R4 contracts)

```
npx vitest run tests/unit/qa3a-admin-catalog/{adminAccess,adminClock,adminRoster,adminBountySkip,adminVoid,adminCatalogPending,catalogActivation,adminPendingKeys}*
→ 18 failed | 33 passed (51)
```

Evidence: `evidence/baseline-qa3a.txt`

Failing themes: ADM-001…008, CAT-001, ADM-009 pending guard, ADM-006 signOut.

## After — unit / contract

| Suite | Result |
|---|---|
| Same 8 R4 contract files | **51 passed / 51** (`evidence/after-qa3a.txt`) |
| Full `tests/unit/qa3a-admin-catalog` | **227 passed / 227** (`evidence/full-qa3a.txt`) |
| `adminCatalogImport.spec.ts` + safety guards | **20 passed** |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |

## After — disposable backend-integrated (`:55321`)

`node scripts/qa2b/repro-r4-admin-catalog.mjs` → **ALL PASS**

| Step | Proof |
|---|---|
| CAT-001 preview failure clears pending | `phase=preview_failed`, `pending=null` |
| ADM-008 Discard | stuck publish marker cleared |
| ADM-009 publish refuse | `refused=true` while pending exists |
| Active pointer unchanged after preview fail | same version id |
| Happy stage→preview | `preview_ok`, pending null |
| Happy publish | pointer moved to new version |
| Happy rollback | new audited revision; pending null |
| ADM-001 missing ledger | `unknown` |
| ADM-007 admin RPC | `admin_list_roster` OK (22 rows) |

Evidence: `evidence/repro-r4-admin-catalog.json`, `evidence/repro-r4-admin-catalog.log`

### Backend vs mocked distinction

| Area | Kind |
|---|---|
| QA-3A contracts | Mocked RPC / source-text (frontend classification & UI contracts) |
| `repro-r4-admin-catalog.mjs` | **Real** disposable Supabase + real `src/lib/*` via Vite SSR |
| QA-4A `scripts/qa2a/probe/admin-catalog.mjs` | **Not run** (hard-refuses anything but `:56321`; Agent 2 stack protected) |

## Legacy vitest integration suites

`admin.phase6b2.catalog_publish` / void / skip suites require `npx supabase status` from the **current** workdir to match `:55321`. Main repo status points at organizer / mismatched workdir, so those suites were not re-driven here. Publish+rollback authority was instead proven by the R4 repro against `:55321`.

## Browser

Full Playwright Admin UI soak not re-run in this assignment. Router / Catalog SFC contracts + live lib glue cover the repaired surfaces. Residual: physical Admin click-path across pre-cruise / pause / finale (see REMAINING_RISKS).
