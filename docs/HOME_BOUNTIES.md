# Drink It! Home bounties (Phase 2D-B1 → 2D-B2)

Player-facing Cocktail, Ingredient, Bar, and Daily Challenge cards on Drink It! Home.

## Data flow

```text
DrinkItHomeView
  └─ createHomeBountySync()
       └─ get_my_drinkit_home_board()   # one server now(); consistent cruise day
            ├─ cocktail / ingredient (rotating)
            ├─ bar / daily (fixed for the day)
            └─ clock snapshot
            ↓
       mapHomeBountyCards → BountyCarousel
```

Individual zero-arg RPCs remain available for focused tests:

- `get_my_current_cocktail_bounty()`
- `get_my_current_ingredient_bounty()`
- `get_my_current_bar_bounty()`
- `get_my_current_daily_challenge()`

**No client-supplied timestamps.** Player RPCs always use server `now()`. Timed simulation stays `dev_*` + `service_role` only.

Claim It remains **disabled** until Phase 3 (drink wizard / Daily photo path).

## Refresh strategy (single-flight)

| Trigger | Behavior |
|---|---|
| Mount | Immediate fetch |
| Interval | 60s |
| Focus / visibility | Refresh |
| Slot / noon / daily close boundary | Timeout slightly after boundary |
| Manual Retry | Error banner |

While a fetch is in flight, additional triggers **queue one follow-up** (latest reason wins). That prevents concurrent overlapping requests on cruise Wi-Fi and ensures a slot-boundary refresh is not dropped. `stop()` invalidates in-flight apply.

Network failure clears active card data — prior offers are not shown as definitely current.

## Fixed daily content

| Table | Guarantee |
|---|---|
| `bar_bounties` | Exactly one featured bar per cruise day (1–7), snapshotted display name |
| `daily_challenges` | Exactly one challenge per day; points fixed at 50 |

Local fixtures: `dev_seed_daily_assignments()` (development-only cruise + active catalog). **Not production content.**

Public windows: Days 1–6 noon–11 PM; Day 7 noon–6 PM. Meeting times on Daily Challenges are descriptive only.

Ordinary players cannot `SELECT` assignment tables directly — only current-day RPC payloads.

## Pause / Resume

Organizer Admin → **Game Status**:

- `admin_get_drinkit_pause_status` — latches Friday finale before reporting
- `admin_set_drinkit_paused(p_paused, p_client_request_id)` — desired-state mutation
- `admin_find_drinkit_pause_request_by_id` — durable ledger lookup for lost-response reconcile
- Table `admin_drinkit_pause_requests` — one outcome per request id + fingerprint (`drinkit_paused:true|false`)

**Reliability (2D-B2.1):** Persist request id + desired state to localStorage *before* mutate. Failed status reads never clear an unresolved operation. Same id + same fingerprint replays the original result (no second audit / no re-apply). Same id + opposite fingerprint → `REQUEST_ID_OPERATION_MISMATCH`. Refresh Status / Retry Same Change keep conflicting controls disabled until the ledger confirms.

Pause affects Drink It! only. Ship It! stays up. Resume is manual. Finale cannot reopen (latched even if no prior player read). Mutations are audited once per successful change.

## Card states

| Phase | All four cards |
|---|---|
| `loading` | Loading… |
| `active` | Live category content |
| `pre_open` / `overnight` | Closed messaging + Opens in |
| `paused` | Approved pause copy |
| `finale` | Games ended |
| `unavailable` / `error` | Couldn't Load + Retry |

Development “live” note appears **only** when `phase === 'active'`.

## Local verification

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run db:seed-bounty-now
npm run test:bounty
npm run test:e2e:phase2db2   # Vite running
npm run screenshots:phase2db2
```

## Remaining (not 2D-B2)

- Phase **3**: Claim It → logging wizard, Daily photo submit, scoring
- Admin Skip, production Publish/Rollback, final seven Bar/Daily content
- Galleries, Ship It! scavenger, Achievements, Wrapped
