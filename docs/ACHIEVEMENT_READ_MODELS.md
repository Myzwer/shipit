# Achievement read models (Stage A4)

## List (`list_achievements`)

Existing RPC, extended card payload:

- Core: stable_key, title, description, secret, earned, icon_key, group_key, progress
- `collection` (gauntlets only): scope, bar_key, live_current/live_target, badge_earned, pin_target, current_menu_complete
- `same_log` (Drinking with Davids): progress stays `null` (binary earned/unearned)
- Client enriches with `content/achievements/categories.json` ordering (Davids first, Bar Gauntlets last)

## Bar gauntlet summaries (`list_drinkit_bar_gauntlet_summaries`)

One row per bar with live_target > 0. Personal + collective side summaries. Bars with zero within-limit offerings are omitted (no empty 0/0).

## Checklist detail (`get_drinkit_collection_checklist`)

Opened on a bar. Shared items with `mine` / `everyone` only — never per-person identities.

Presentation filters (client):

| Filter | Derivation |
|---|---|
| All | all items |
| I Need | `!mine` |
| We Need | `!everyone` |

## Badge earned vs current-menu progress

- `badge_earned` / pin_target: historical award
- `live_current` / `live_target` / `current_menu_complete`: active catalog

## New bars after menu import

1. Publish catalog (exceptions merged).
2. `node scripts/generate-bar-gauntlets.mjs`
3. `npm run db:load-working-achievements` (dev) — upserts new `working-drinkit-gauntlet-*` keys; disables removed empty bars.

Engine code does not hardcode bar counts.

## Collection price gate

Required offerings need `verified_within_limit` or `approved_filtered_within_limit`. Unverified (e.g. Good Spirits today) stay loggable but are not gauntlet requirements.
