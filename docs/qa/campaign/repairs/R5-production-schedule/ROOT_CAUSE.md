# R5 — Root Cause (REP-SCHED-001 / INT-SCHED-001)

## Preflight

| Check | Result |
|---|---|
| Worktree | `/Users/josh/Documents/Web Projects/Vue/Ship It` |
| Branch | `visual/drinkit-home-v1` |
| HEAD at start | `535686f` (R4 Admin/catalog recovery) |
| Disposable | Agent 1 `:55321` / DB `:55322` |
| Organizer `:54321` / Agent 2 `:56321` | Untouched |

## Architecture facts (verified before edit)

1. **Development fixtures** create Cocktail/Ingredient slots via `dev_generate_bounty_schedule` (service_role + `cruise_config.label = 'development-only'`). Bar/Daily come from a second call to `dev_seed_daily_assignments` (same gates).
2. **Production-compatible server logic already existed** for selection, windows, exposures, grace, pause, finale, and catalog publish **rebind** of never-shown `scheduled` slots (`admin_publish_catalog_import`).
3. **Missing step:** there was no Admin/authenticated production entry point that could create the *first* schedule on a non-`development-only` cruise. Publish rebinds only; it never bootstraps an empty ledger.
4. **Active catalog** supplies candidates through `cocktail_candidates` / `ingredient_candidates` for `active_catalog_pointer.catalog_version_id`. Eligibility is catalog-authoritative; scheduling draws eligible rows (R5 also excludes virtual `mobile-order` cocktail designations).
5. **Job vs Admin:** no cron/job is required for first init. An explicit Admin operation is the production path. Catalog publish remains the path for later future-slot rebind after a new catalog activates.
6. **Precomputed:** the full seven-day Cocktail/Ingredient ledger is preallocated at init; player RPCs resolve the current window from server time. Bar/Daily are day-level assignments, also pre-seeded at init.
7. **Versions / claims:** `bounty_schedule_runs` is unique per `(cruise, catalog_version_id)`. Historical offers keep their catalog binding; publish rebinds only `scheduled` unshown slots. Active claims / exposed / current windows are preserved on catalog replace.

## Root cause

**Product gap, not engine failure.** The scheduling engine and catalog publish rebind were implemented; first-voyage bootstrap was left behind a development-only fixture RPC (`DEV_SCHEDULE_FORBIDDEN` on any non-dev label). A real cruise therefore could import a valid catalog and still have zero playable bounty windows without a developer running `dev_*` SQL.

## Reproduction (before repair, disposable `:55321`)

```text
select proname from pg_proc where proname ilike '%bounty_schedule%';
→ only dev_generate_bounty_schedule
```

No `admin_initialize_bounty_schedule` / status / reconcile RPCs existed. INT-SCHED-001 / QA3A-B012 remained open.
