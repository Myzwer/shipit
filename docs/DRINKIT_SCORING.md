# Drink It! scoring engine (Phase 3A / 3A.1 / 3C-A)

Server-authoritative ordinary drink logging and Cocktail / Ingredient / Bar claims. Wizard UI: `docs/DRINKIT_LOGGING.md`.

## RPCs

| RPC | Who | Effect |
|---|---|---|
| `preview_drink_claims(p_payload)` | Drink It! player | Eligibility for Review; **no** writes |
| `submit_drink(p_payload)` | Drink It! player | Atomic log + selected claims |
| `dev_preview_drink_claims_at` / `dev_submit_drink_at` | **service_role** + `development-only` cruise | Timed simulation for tests |

Player RPCs capture `clock_timestamp()` at entry as `received_at_utc`. Clients never supply authoritative time, score, author, or ship day.

## Payload (canonical)

```json
{
  "idempotency_key": "<uuid>",
  "bar_canonical_key": "wake-view",
  "drink": {
    "mode": "named_catalog | generic_beer | generic_wine | generic_other | unlisted_named",
    "offering_id": "<uuid>",
    "custom_name": "…",
    "confirm_contains_ingredient_key": null,
    "unlisted_contains_ingredient_key": null,
    "confirm_featured_cocktail": false,
    "unlisted_drink_kind": "named_cocktail"
  },
  "companion_player_ids": ["<uuid>", "…"],
  "bar_eligible_companion_ids": ["<uuid>", "…"],
  "selected_claims": [
    { "category": "cocktail", "offer_id": "<uuid>" },
    { "category": "ingredient", "offer_id": "<uuid>" },
    { "category": "bar", "assignment_id": "<uuid>" }
  ],
  "caption": null,
  "photo_storage_key": null
}
```

### Confirm fields (Phase 3C-A)

| Field | Mode | Effect |
|---|---|---|
| `confirm_contains_ingredient_key` | `named_catalog` | In-request match for current Ingredient; on successful Ingredient award, upserts `ingredient_corrections` for that offering (**never reactivates** an admin-deactivated row; in-request honor still applies) |
| `unlisted_contains_ingredient_key` | `unlisted_named` + `named_cocktail` | Honor match for this submission only (no shared correction) |
| `confirm_featured_cocktail` | `unlisted_named` | Cocktail eligible only when name + designated bar match the live offer |

Preview is read-only: confirms influence eligibility but do not write corrections. Same UUID retry never inserts a second correction (`on conflict` unique).

### Companions vs Bar-eligible companions (Phase 3A.1)

| Field | Meaning |
|---|---|
| `companion_player_ids` | Physically present Drink It! players (required for Cocktail / Ingredient presence) |
| `bar_eligible_companion_ids` | Honor-system **subset** of companions who were still Bar-eligible when the group gathered |

Rules:

- Must be unique UUIDs, Drink It!-enrolled (via presence normalization), and ⊆ `companion_player_ids`.
- Cannot include self; cannot invent IDs not in the presence list (`BAR_ELIGIBLE_NOT_SUBSET`).
- Bar points use **N = length(bar_eligible_companion_ids)** only: `min(95, 25 + 10×N)`.
- Bar claim requires **N ≥ 1**. Empty / omitted bar-eligible list → Bar unavailable (`bar_eligible_companion_required`); Cocktail/Ingredient still use presence companions.
- Server does **not** exclude someone who already claimed Bar today. Simultaneous gathering members may each report the others as bar-eligible even if one submitted first.
- No player-entered points. Points always from `drinkit_bar_points`.

Phase 3B Friends uses **one** companion selector and auto-fills `bar_eligible_companion_ids` from the same selection (honor-system reminder when Bar Bounty could apply). See [`docs/DRINKIT_LOGGING.md`](./DRINKIT_LOGGING.md).

Forbidden client fields: `points`, `score`, `author_player_id`, `player_id`, `received_at_utc`, `ship_day`.

## Eligibility (shared evaluator)

Uses Ship Clock, active catalog, bounty ledger (`bounty_resolve_at` with grace), and `bar_bounties`.

| Category | Requires | Points |
|---|---|---|
| Cocktail | Exact catalog offering = current/grace offer; ≥1 **presence** companion; not already claimed | Imported offer points |
| Ingredient | Offering contains current/grace ingredient (catalog ∪ active correction ∪ in-request confirm); ≥1 **presence** companion; named catalog **or** unlisted honor key | Imported offer points |
| Bar | Featured bar that day; alcoholic; ≥1 **bar-eligible** companion; noon–daily close | `min(95, 25 + 10×N)` with N = bar-eligible count |
| Daily | **Not** via `submit_drink` | — |

Generic beer/wine/other never auto-qualify Cocktail/Ingredient. Grace is private (15 minutes after public end; none after Friday 6 PM). Choose **one** offer per category when current + grace both match.

An eligible option is **not** awarded until listed in `selected_claims`.

## Idempotency & concurrency (Phase 3A.1)

- Unique `(author_player_id, idempotency_key)`.
- Deterministic fingerprint from client request fields only (sorted companion / bar-eligible IDs, sorted claims, drink, bar, caption, photo). **No** clock, catalog, membership, pause, or bounty state in the hash.
- On lookup hit with matching hash: return saved `result_json` with `idempotent_replay: true` **before** pause / finale / eligibility revalidation.
- Same key + different payload → `IDEMPOTENCY_PAYLOAD_MISMATCH`.
- Replay never creates another claim, score award, drink log, or Gallery event.
- Lookup is scoped to the authenticated author; another player cannot read someone else's saved result via the same key.
- **New** UUIDs remain fully subject to current pause / finale / eligibility rules.
- Partial unique active claim per `(player, cruise, day, category)`.
- Advisory lock per player reduces races; uniqueness is the hard guard.

## Pause / finale

- Pause → `GAME_PAUSED` for scored **and** unscored logs (**new** submissions only).
- Friday 6 PM Ship Time (and latched finale) → `GAME_ENDED` (**new** submissions only).
- Ordinary logs allowed outside bounty windows during the cruise when not paused/final.
- Receipt time is request entry, not browser time.

## Schema

`submissions`, `drink_logs`, `drink_log_companions` (+ `bar_multiplier_eligible`), `bounty_claims`, minimal `gallery_events`, `ingredient_corrections` (overlay).

No mutable total-score column. Leaderboards sum active claims later.

Players: SELECT own correction rows (or admin); no direct INSERT/UPDATE. Writes only via `submit_drink` / `admin_deactivate_ingredient_correction`.

## Error codes (structured `ok: false`)

| Code | Meaning |
|---|---|
| `ELIGIBILITY_CHANGED` | Selected claim no longer valid; no partial write |
| `ALREADY_CLAIMED` | Category used today |
| `GAME_PAUSED` / `GAME_ENDED` | Lifecycle gate (new submissions) |
| `IDEMPOTENCY_PAYLOAD_MISMATCH` | Key reuse with different body |
| `FORGED_FIELDS` | Client supplied authority fields |
| `SELF_COMPANION` / `COMPANION_NOT_DRINKIT` | Companion validation |
| `BAR_ELIGIBLE_NOT_SUBSET` | Bar-eligible IDs not ⊆ presence companions |

## Extension contracts (not built in 3A)

| Later phase | Hook |
|---|---|
| 3C-B Admin Skip | Emergency skip current Cocktail / Ingredient from unused reserve |
| Daily photo | `submit_daily` (Phase 4B3) — required staged `daily` photo, 50 points, one claim/player/day |
| Achievements | Evaluate inside submit transaction; return `new_achievement_ids` (currently `[]`) |
| Gallery UI / reactions | `gallery_events` row already created; reactions table deferred |
| Photos | Optional `photo_storage_key` accepted; upload pipeline not complete |

## Local verify

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test
npm run test:integration
npm run build
```
