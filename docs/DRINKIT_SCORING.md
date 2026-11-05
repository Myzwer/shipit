# Drink It! scoring engine (Phase 3A)

Server-authoritative ordinary drink logging and Cocktail / Ingredient / Bar claims. No wizard UI yet.

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
    "unlisted_contains_ingredient_key": null
  },
  "companion_player_ids": ["<uuid>", "…"],
  "selected_claims": [
    { "category": "cocktail", "offer_id": "<uuid>" },
    { "category": "ingredient", "offer_id": "<uuid>" },
    { "category": "bar", "assignment_id": "<uuid>" }
  ],
  "caption": null,
  "photo_storage_key": null
}
```

`unlisted_named` + `unlisted_contains_ingredient_key` are reserved for Phase 3C confirmation. Phase 3A does not persist ingredient corrections or auto-qualify unlisted drinks for Ingredient.

Forbidden client fields: `points`, `score`, `author_player_id`, `player_id`, `received_at_utc`, `ship_day`.

## Eligibility (shared evaluator)

Uses Ship Clock, active catalog, bounty ledger (`bounty_resolve_at` with grace), and `bar_bounties`.

| Category | Requires | Points |
|---|---|---|
| Cocktail | Exact catalog offering = current/grace offer; ≥1 companion; not already claimed | Imported offer points |
| Ingredient | Offering contains current/grace ingredient; ≥1 companion; named catalog only | Imported offer points |
| Bar | Featured bar that day; alcoholic; ≥1 companion; noon–daily close | `min(95, 25 + 10×N)` |
| Daily | **Not** via `submit_drink` | — |

Generic beer/wine/other never auto-qualify Cocktail/Ingredient. Grace is private (15 minutes after public end; none after Friday 6 PM). Choose **one** offer per category when current + grace both match.

An eligible option is **not** awarded until listed in `selected_claims`.

## Idempotency & concurrency

- Unique `(author_player_id, idempotency_key)`.
- Same key + same canonical hash → original `result_json` (`idempotent_replay: true`).
- Same key + different payload → `IDEMPOTENCY_PAYLOAD_MISMATCH`.
- Partial unique active claim per `(player, cruise, day, category)`.
- Advisory lock per player reduces races; uniqueness is the hard guard.

## Pause / finale

- Pause → `GAME_PAUSED` for scored **and** unscored logs.
- Friday 6 PM Ship Time (and latched finale) → `GAME_ENDED`.
- Ordinary logs allowed outside bounty windows during the cruise when not paused/final.
- Receipt time is request entry, not browser time.

## Schema

`submissions`, `drink_logs`, `drink_log_companions`, `bounty_claims`, minimal `gallery_events`.

No mutable total-score column. Leaderboards sum active claims later.

Players: SELECT own rows only. No direct INSERT/UPDATE on claims.

## Error codes (structured `ok: false`)

| Code | Meaning |
|---|---|
| `ELIGIBILITY_CHANGED` | Selected claim no longer valid; no partial write |
| `ALREADY_CLAIMED` | Category used today |
| `GAME_PAUSED` / `GAME_ENDED` | Lifecycle gate |
| `IDEMPOTENCY_PAYLOAD_MISMATCH` | Key reuse with different body |
| `FORGED_FIELDS` | Client supplied authority fields |
| `SELF_COMPANION` / `COMPANION_NOT_DRINKIT` | Companion validation |

## Extension contracts (not built in 3A)

| Later phase | Hook |
|---|---|
| 3B wizard | Call `preview_drink_claims` then `submit_drink` with one UUID per intent |
| 3C corrections | On successful submit only, persist `ingredient_corrections` from confirmed unlisted/missing flow |
| Daily photo | Separate `submit_daily` RPC |
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
