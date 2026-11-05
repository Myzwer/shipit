# Bounty scheduling engine (Phase 2D-A)

Server-authoritative, durable Cocktail and Ingredient rotation for Drink It!.

## Slot identity and public boundaries

| Category | Days 1–6 | Day 7 | Total |
|---|---|---|---|
| Cocktail | 11 hourly slots 12:00–23:00 | 6 hourly slots 12:00–18:00 | **72** |
| Ingredient | 12–14, 14–16, 16–18, 18–20, 20–22, **22–23** | 12–14, 14–16, 16–18 | **39** |

The final Ingredient window on Days 1–6 is **one hour** (10–11 PM), not two.

Slot keys look like `cocktail:day:1:h12`. Boundaries are ship-local; UTC eligibility uses the Ship Clock offset timeline. Friday **6:00 PM** hard cutoff ends all eligibility (no grace).

## Ledger

- `bounty_slots` — stable slot rows (day, window, state)
- `bounty_slot_offers` — assigned offer revision (active offer per slot)
- `bounty_objective_exposures` — cruise-wide nonrepetition once shown
- `bounty_schedule_runs` — one generation per cruise (idempotent)

States: `scheduled` → `current` → `exposed`, or `missed_paused` if the window ended while Drink It! was paused without exposure.

Preallocation ≠ shown. Nonrepetition uses **canonical drink concept** / **ingredient key**, not offering ID.

## Random assignment

`dev_generate_bounty_schedule` (service_role, `development-only` cruise label):

- Draws from eligible active-catalog candidates (uniform hash order with optional seed)
- No tier quotas / jackpots
- Fails atomically on shortage (`COCKTAIL_POOL_SHORTAGE` / `INGREDIENT_POOL_SHORTAGE`)
- Second call returns existing schedule (`idempotent: true`) — never reshuffles

## Player-safe reads

| RPC | Returns |
|---|---|
| `get_my_current_cocktail_bounty` | Current name, designated bar, tier/points, listed ingredients, `public_end_utc`, `offer_id` |
| `get_my_current_ingredient_bounty` | Current name, tier/points, known_bar_count only |

Locked down (Drink It! players cannot SELECT):

- `cocktail_candidates`, `ingredient_candidates`
- `catalog_offering_ingredients` (use `get_offering_display_ingredients(offering_id)` for forward recipes)
- `bounty_slots`, `bounty_slot_offers`, exposures

Optional `p_at_utc` on player RPCs is honored **only** when `cruise_config.label = 'development-only'`.

## Private grace

`dev_resolve_bounty_eligibility_at` (service_role) returns current offer plus `grace_previous` for 15 minutes after prior public end. Player RPCs never include grace. Finale overrides grace.

## Pause / clock

- Pause → public reads `paused`; scheduled windows that fully end without exposure become `missed_paused` (not backfilled)
- Clock corrections do not reshape the slot ledger or create duplicate exposures
- Future catalog imports may replace only `scheduled` / unshown offers (exposure table prevents repeats)

## Local seven-day simulation

```bash
npx supabase db reset && npm run db:provision
# in tests / service role:
dev_seed_cruise_clock(day1, offset, 'development-only')
dev_activate_catalog_fixture(<buildScheduleReadyCatalog(72,39)>)
dev_generate_bounty_schedule('seed')
dev_resolve_bounty_eligibility_at('cocktail', <utc>)
```

## Remaining for Phase 2D-B / later

- Home-card UI wiring
- Scoring / claim resolution using grace
- Admin Skip
- Production Publish/Rollback (not `dev_*`)
- Bar / Daily Challenge assignments
