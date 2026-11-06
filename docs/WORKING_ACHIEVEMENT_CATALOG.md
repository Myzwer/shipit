# Working achievement catalog (Phase 7B2)

**Authoritative working list:** interim snapshot `2026-11-06`  
Source: `handoff/achievements/Star_Princess_Achievements_Interim_Cursor_Handoff_2026-11-06.md`  
Machine-readable: `content/achievements/workingCatalog.ts` (+ `.json` for the loader)

**Not** the final creative catalog. Names, thresholds, visibility, and membership may change over the next week via source-controlled edits — not via an in-app editor.

## Stable keys

- Format: `working-{drinkit|shipit}-{s|d}{NNN}` (e.g. `working-drinkit-d001`)
- Snapshot refs (`S-001`, `D-087`) are **source pointers**, not DB primary keys
- Stable keys do **not** depend on display titles (duplicate titles keep distinct keys)

## Development loading

```bash
npx supabase db reset
LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run db:load-working-achievements
```

- Upserts via `dev_upsert_working_achievement_definition` (service_role + `development-only` only)
- Idempotent on `stable_key` (preserves UUID when title/threshold text changes)
- All rows are `test_only = true` so they never evaluate on a non-development cruise
- Removed snapshot rows are disabled explicitly (`dev_disable_missing_working_achievements`)
- No client writes; no Admin achievement CMS

## Snapshot → readiness (140 / 140)

| Readiness | Count | Meaning |
|---|---:|---|
| **enabled** | 129 | Condition expressed; enabled in development |
| **blocked_metadata** | 8 | D-086…D-093 named companions — UUID map out-of-band |
| **blocked_organizer** | 3 | D-082, D-083, D-085 — no proxy |
| **missing_capability** | 0 | — |

Enabled rows that still need **content** (tags, port/Thanksgiving config, ingredient keys) remain enabled: they simply will not unlock until metadata exists. That is intentional — do not invent evidence.

## Final creative reconciliation (when the next Google Doc arrives)

1. Diff the new snapshot against `workingCatalog.ts` by **snapshot ref / stable key**, not by title.
2. Title / description / secret / group → update fields; keep `stable_key` and existing awards.
3. Threshold / trigger change → update `conditionConfig`; keep `stable_key`.
4. New row → new `stable_key` (`working-…` or a future production prefix).
5. Removed row → set `enabledInDev: false` / `enabled: false` (do not delete awards history in development).
6. Named companion UUIDs become available → fill `companion_player_id`, flip readiness to `enabled`.
7. Re-run `npm run db:load-working-achievements`.

No production award-migration framework in this phase — definitions remain development-only.

## Visibility

`secret` values are **PROVISIONAL**. Do not treat them as final public/secret assignments.
