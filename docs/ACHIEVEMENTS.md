# Achievements (Phase 7A / 7B0 / 7B1 / 7B2)

Bounded, data-driven achievement engine for the private ~22-player cruise app. **No production achievement catalog is published yet.** The Phase **7B2** working catalog (all 140 interim snapshot rows) loads as `test_only = true` and evaluates only while the active cruise label is `development-only`. See `docs/WORKING_ACHIEVEMENT_CATALOG.md`.

## Condition primitives

| Type | Family | Purpose |
|------|--------|---------|
| `event_count` | A | Accepted event thresholds (drink / scavenger / daily / bounty) |
| `distinct_count` | B | Distinct bars, cocktails, days, companions, categories, tags, modes |
| `grouped_count` | C | Max group sizes (same day, same bar across days, cocktails at one bar) |
| `exact_match` | D | Challenge key, drink mode, ingredient key, drink concept key |
| `tag_match` | E | Curated versioned tags; supports presence, `count_logs`, `min_distinct_on_log`, `distinct_across_cruise` |
| `recipe_ingredient_count` | E | Min listed ingredients on one logged offering (D-062) |
| `same_submission_claims` | F | Multiple bounty categories on one log |
| `set_completion` | G | Finite challenge sets / all scavenger challenges |
| `category_completion` | G | One-per-category or full category clear |
| `event_interval` | H | Two events within min/max minutes (optional same bar/concept) |
| `ordered_after` | H | Repeat drink after Cocktail bounty claim |
| `companion_predicate` | I | Companion counts / same companion across bars / named companion (test IDs only) |
| `ship_time_window` | J | Ship-local hour / port-day windows |
| `cruise_day` | J | First / final / Thanksgiving (requires cruise_config fields) |
| `all` / `any` | — | Bounded composites (max depth 4) |

Unknown `condition_type` values fail validation. There is no JSON-to-SQL, eval, or rule-builder UI.

Coverage of the interim 140-row snapshot: see `docs/ACHIEVEMENTS_COVERAGE.md`.

## Evidence contract

Only **accepted, non-voided** submissions count. Drink logs use versioned offering ingredients + **`catalog_version_*_tags`** at the logged `catalog_version_id`. Legacy global `ingredient_tags` / `drink_concept_tags` are not used for evaluation. Empty versioned tag rows mean tag conditions never unlock. Display aliases never unlock achievements.

Ship-time windows and Thanksgiving dates use **`clock_offset_at`** (same historical offset as Gallery), never the live base offset alone and never device timezone.

Drink It! `cruise_day` (first / final / Thanksgiving) requires an accepted **`drink_log`**, not a Daily Challenge alone. Ship It! first/final days continue to require scavenger completions.

`distinct_count` / `cruise_days` defaults to **`drink_log`** for Drink It! (D-078) and **`scavenger_completion`** for Ship It!. Set `event` explicitly when a definition must count Daily or another kind.

`tag_match` with `count_logs: true` counts qualifying cocktail **logs** (each log once) containing any listed tag — used for D-037–D-042. `min_distinct_on_log` requires multiple tags from a set on **one** cocktail (D-063 / D-064).

## Phase 7A.1 gates

1. Exclusive First ordering uses first-qualifying evidence (not earliest any-evidence).
2. Historical Ship Time for condition J.
3. `dev_submit_*_at` locked to `service_role` + `development-only` (EXECUTE revoked from anon/authenticated).

## Phase 7B0 gates

1. `ordered_after` evaluates claim→later same-concept drink without a bogus alias (D-031).
2. Versioned classification metadata flows through `full_snapshot` → publish → achievement eval.
3. Historical logs keep the classifications of their catalog version after later publishes/rollbacks.

Deferred (no proxy implementation): D-082 roster membership, D-083 pool-menu set, D-085 daily max, automatic dual grants to named companions.

## Awards

- Drink It! → `owner_player_id`; Ship It! → `owner_team_id`
- Shared: one active award per owner+definition
- Exclusive: one active `exclusive_slot` winner; **earliest first-qualifying submission** (prefix eval via `achievement_eval_condition_as_of`), then submission id tie-break; advisory lock + unique index. Unrelated earlier evidence does not win.
- No achievement leaderboard points
- Submit wrappers call `achievement_finalize_submit_result` in the same transaction as accept; receipts include `new_achievement_ids`
- Idempotent UUID replay returns the original award id list

## Admin Void

`achievement_on_void_submission` recomputes owners in the voided game: revoke unsupported awards, suppress their Gallery events, reassign exclusive Firsts to the next earliest valid owner. Post-finale: no award changes (submits and voids already refuse).

## Gallery / unread

- Kind `achievement` compact cards (secret titles masked pre-finale on the feed)
- Gallery unread remains separate from Achievement unread (`read_cursors.scope = achievements_mine`)
- Only a successful **My Achievements** load + `mark_achievements_seen` clears the achievement dot
- Unlock celebration popup overlays Gallery after a confirmed submit with new awards; dismiss does **not** clear the achievement unread dot (Phase **7B1**)

## RPCs

| RPC | Audience |
|-----|----------|
| `list_achievements(game, view)` | Player — masks secrets; empty production list when no enabled non-test defs |
| `get_achievements_unread(game)` | Player |
| `mark_achievements_seen(game, award_id, awarded_at)` | Player — My Achievements cursor |

## Phase 7B1 gates

1. Qualifying-log tag counts (`count_logs`) for spirit-family thresholds.
2. Drink-day `distinct_count` excludes Daily unless explicitly requested.
3. Recipe primitives for D-062 / D-063 / D-064; D-043 / D-066 proven via existing distinct/tag modes.
4. Princess Plus within-limit Ingredient corroboration + forged-readiness coverage refusal.
5. Achievement unlock celebration over Gallery (test-only content).

## Phase 7B2 gates

1. Working catalog manifest for all 140 snapshot rows with stable keys.
2. Exact conditions for every expressible row; no proxies for D-082 / D-083 / D-085.
3. Dev-only idempotent loader (`npm run db:load-working-achievements`).
4. Unread clear only after successful mark; celebration list failures preserve pending.
5. Representative unlocks use real working titles (not generic test names alone).

## Phase 7B remaining

Final creative reconciliation (titles/secrets/thresholds), real companion UUID maps, production menu classification content, Awards Mode / Wrapped, production enablement (`test_only = false` on a real cruise). Classification pipeline is Phase 7B0; Star Princess menu classification content is still external.
