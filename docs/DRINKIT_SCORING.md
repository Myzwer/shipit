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
  "photo_storage_key": null,
  "photo_id": "<optional staged drink_log photo uuid>"
}
```

`photo_id` is optional. Omit it (or leave absent) for no-photo logs — fingerprints stay identical to pre-4B4 no-photo hashes. Non-null `photo_storage_key` is rejected (`FORGED_PHOTO_PATH`); only a validated staged `photo_id` may bind.

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

`submissions`, `drink_logs`, `drink_log_companions` (+ `bar_multiplier_eligible`), `bounty_claims`, minimal `gallery_events`, `ingredient_corrections` (overlay) + `ingredient_correction_sources` (provenance).

No mutable total-score column. Leaderboards sum active claims later.

Players: SELECT own correction/source rows (or admin); no direct INSERT/UPDATE. Writes only via `submit_drink` / `admin_deactivate_ingredient_correction` / void invalidation.

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

## Extension contracts

| Phase | Hook |
|---|---|
| 3C-B Admin Skip | Emergency skip current Cocktail / Ingredient from unused reserve |
| Daily photo | `submit_daily` (Phase 4B3) — required staged `daily` photo, 50 points, one claim/player/day |
| Optional drink photo | `submit_drink` (Phase 4B4) — nullable `photo_id`, atomic bind with claims + corrections |
| Achievements | Evaluate inside submit transaction; return `new_achievement_ids` (Phase 7A engine; test-only defs in development-only cruises) |
| Gallery UI / reactions | Phase 5A/5B feed + reactions |
| Admin Void (5B/5C) | `admin_preview_void_submission` / `admin_void_submission` — soft-void before Friday 6 PM; v2 fingerprint includes reason |
| Correction provenance (5C) | `ingredient_correction_sources` — independent Ingredient awards keep shared overlay alive |

## Admin Void (Drink It! + Daily)

- Soft-void `submissions.status = voided`; void only that submission’s active `bounty_claims`
- Points leave aggregates because reads sum `status = 'active'` only (no artificial negative ledger rows)
- Categories become claimable again when still eligible under window rules (unique active index)
- Daily is a Drink It! submission kind and voids the same way (50-point claim)
- Gallery event `active=false`; bound photo kept for audit but denied to members
- Same idempotency UUID after void: replay returns voided status — never resurrects claims/photo/gallery
- **Request fingerprint (5C):** `void_submission:v2:{submission}:{status}:{normalized_reason}`. Identical UUID + payload replays the original. Changed reason/submission/status → `REQUEST_ID_OPERATION_MISMATCH`. Phase 5B ledger rows (v1 fingerprint without reason) still replay when the stored `reason` column matches the retry.
- **Ingredient corrections (5C):** void calls `drinkit_invalidate_correction_sources`. Each successful Ingredient-award confirm that persists an overlay inserts one source row for that offering+ingredient. Voiding a source invalidates only that support; the shared correction stays active while any valid independent source remains. Last valid source → `active=false`, `inactive_cause='no_valid_sources'` (may reactivate on later proven support). Admin deactivate → `inactive_cause='admin'` and **never** auto-reactivates from player submits. No retroactive point changes. Players cannot write sources/corrections directly.
- **Independent support (smallest defensible):** a successful `drink_log` that awarded Ingredient and wrote via `drinkit_persist_ingredient_correction` for that exact `offering_id` + `ingredient_id`. No extra player questions. Historical backfill only from proven `source_submission_id` and accepted logs whose `result_json` references the correction plus matching Ingredient claim — never fabricated.
- **Achievement void:** `achievement_on_void_submission(submission_id)` recomputes awards, revokes unsupported grants, reassigns exclusive Firsts, and suppresses award Gallery events (Phase 7A). Post-finale voids remain refused by Admin Void.

## Local verify

```bash
npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run lint && npm run typecheck && npm test
npm run test:integration
npm run build
```
