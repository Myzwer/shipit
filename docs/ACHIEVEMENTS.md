# Achievements (Phase 7A)

Bounded, data-driven achievement engine for the private ~22-player cruise app. **No production catalog is published in this phase.** Test-only definitions (`test_only = true`) evaluate only while the active cruise label is `development-only`.

## Condition primitives

| Type | Family | Purpose |
|------|--------|---------|
| `event_count` | A | Accepted event thresholds (drink / scavenger / daily / bounty) |
| `distinct_count` | B | Distinct bars, cocktails, days, companions, categories, tags, modes |
| `grouped_count` | C | Max group sizes (same day, same bar across days, cocktails at one bar) |
| `exact_match` | D | Challenge key, drink mode, ingredient key, drink concept key |
| `tag_match` | E | Curated `ingredient_tags` / `drink_concept_tags` only — never invented |
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

Only **accepted, non-voided** submissions count. Drink logs use versioned offering ingredients + tags at the logged `catalog_version_id`. Empty tag tables mean tag conditions never unlock.

Ship-time windows and Thanksgiving dates use **`clock_offset_at`** (same historical offset as Gallery), never the live base offset alone and never device timezone.

## Phase 7A.1 gates

1. Exclusive First ordering uses first-qualifying evidence (not earliest any-evidence).
2. Historical Ship Time for condition J.
3. `dev_submit_*_at` locked to `service_role` + `development-only` (EXECUTE revoked from anon/authenticated).

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
- Popup dismissal is out of scope until Phase 7B

## RPCs

| RPC | Audience |
|-----|----------|
| `list_achievements(game, view)` | Player — masks secrets; empty production list when no enabled non-test defs |
| `get_achievements_unread(game)` | Player |
| `mark_achievements_seen(game, award_id, awarded_at)` | Player — My Achievements cursor |

## Phase 7B remaining

Final creative catalog load, icons/secrets/thresholds, unlock popup/animations, Awards Mode / Wrapped, real companion ID maps, Thanksgiving/port schedule, recipe classifications, production enablement of definitions.
