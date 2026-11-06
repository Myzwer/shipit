# Agent handoff — Phase 6B2 complete

**STOP.** Do not start achievements, Awards Mode, or production catalog population until the Development Director authorizes it.

| | |
|---|---|
| Branch | `main` (clean) |
| Feature tip | `4775106` — Phase **6B2** |
| Feature CI | https://github.com/Myzwer/shipit/actions/runs/42182237272 — success |
| Baseline accepted | Phase **6B1** `b5622b8` / `c54d82d` / `61e48c1` |
| This phase | Phase **6B2** — Catalog import / publish / rollback |

## Just shipped (6B2)

1. **Add Drink safety gate** — base offerings cannot become removable manuals; drink name/kind not overwritten; deactivate only removes introduced version rows (`067`)
2. **Stage → preview → publish** — `full_snapshot` schema 1.0; DB-aware publish preview; atomic pointer + scheduled-slot rebind; current/grace preserved (`068`)
3. **Overlay reconciliation** — manual offerings carry forward or deactivate as redundant; admin-suppressed corrections stay suppressed
4. **Guarded rollback** — new audited revision from prior content; same safety checks (not a raw pointer flip)
5. **Admin UI** — Catalog Import section (upload/paste, preview, confirm publish, rollback)
6. **Export ≠ import** called out in UI/docs

Migrations: `067` manual safety · `068` import/publish/rollback.

## Verified

lint · typecheck · unit **149** · integration **308** / 38 files · E2E 6A **10/10** · E2E 6B1 **13/13** · E2E 6B2 **8/8** · build · Actions success

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npx supabase functions serve admin-roster
npm run db:seed-bounty-now
npm run lint && npm run typecheck && npm test && npm run test:integration
npm run test:e2e:phase6a && npm run test:e2e:phase6b1 && npm run test:e2e:phase6b2
npm run build
```

## Out of scope until authorized

Production catalog from source Markdown · Photo-to-menu OCR/AI · Real cruise roster · Achievements / Awards · Visual polish · Deployment

## Pitfalls

- Export JSON is reconstruction context — not a publishable `full_snapshot`
- Active offers may retain a prior `catalog_version_id` while the pointer moves
- Good Spirits prices remain unverified; shared pool menus are not bar-proof
- Add Drink must never register base offerings as manuals
- Rollback is blocked when remaining pool / current offers are incompatible
