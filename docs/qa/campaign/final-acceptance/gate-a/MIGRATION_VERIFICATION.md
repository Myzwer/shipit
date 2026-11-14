# Gate A — Migration Verification

## Source-controlled sequence (10900–11400)

| Version | File | Purpose |
|---|---|---|
| 10900 | `mobile_order_virtual_source` | Mobile Order virtual bar |
| 11000 | `activity_day_reporting_boundary` | 5 AM activity day |
| 11100 | `plan_c_wrapped_leaderboard_achievements` | Wrapped LB achievements field |
| 11200 | `admin_initialize_bounty_schedule` | R5 production schedule init |
| 11300 | `r6_wrapped_rank_and_mo_venue` | Ranking correction + MO venue |
| 11400 | `r7_gauntlet_covered_count_location` | Gauntlet location / progress |

## Live stack fingerprints (read-only)

| Stack | Total migrations | 10900–11400 | `admin_initialize_bounty_schedule` |
|---|---:|---|---|
| Organizer `:54321` | 107 | **None** | Absent |
| Agent 1 `:55321` | 113 | **All six** | Present |
| Agent 2 `:56321` | 112 | 10900,11000,11100,11400 — **missing 11200, 11300** | Absent |

## Fresh vs upgrade

| Path | Gate A action | Result |
|---|---|---|
| Fresh apply of full chain | **Not executed** as a new empty database (would require a fourth disposable stack). Source migrations are ordered and present in repo. | Deferred — residual gap |
| Upgrade to latest on Agent 1 | Already applied through 11400 by prior R1–R7 integration; Gate A verified presence + R5 RPC works | **PASS** |
| Upgrade organizer | **Refused** — protected Wrapped fixture; do not apply until ops snapshot + R6 rank fix policy satisfied | **Not run (by design)** |
| Agent 2 upgrade | **Refused** — protected from this assignment | **Not run** |

## Functional dependency checks on Agent 1

- `admin_initialize_bounty_schedule` / status / reconcile — exercised (R5 suite + Gate A init) **PASS**
- Wrapped rank helpers (`wrapped_rank_rows` et al.) — present **PASS**
- Mobile Order listing RPC reachable on disposable (prior + unit contracts) **PASS**

## Data integrity note

Organizer awards (190) and Agent 1 awards (326 at campaign start) were not migrated/rewritten by Gate A. Organizer cruise id remained `48fa40c6-e7cd-4f8f-8b81-e3e48d10eb13` throughout.

## Residual gap

A true empty-database `supabase db reset` + migrate-from-zero proof was not created on a separate Docker project during Gate A. Recommend a disposable-only fresh reset rehearsal before production migrate of organizer.
