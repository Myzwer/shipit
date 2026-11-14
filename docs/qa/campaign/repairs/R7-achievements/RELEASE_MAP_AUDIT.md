# R7 — Production release map audit

**Artifact:** `content/achievements/productionReleaseMapping.json`  
**Mapping id:** `working-achievements-production-release-v2-final-174`  
**Source of truth for rows:** `composeWorkingAchievements()` active set (174)  
**Authority:** `finalAuthority.json` (174 / 126 Drink It! / 48 Ship It!)

## Before → after

| Check | Before | After |
|---|---|---|
| Map `summary.total` | 140 | **174** |
| Active keys missing from map | 37 | **0** |
| Map keys not in active 174 | d032, d035, d083 | **none** |
| `release_enabled` | 129 | **164** |
| Blocked organizer | 3 | **2** (d082, d085; d083 retired) |
| Blocked metadata | 8 | **8** (d086–d093) |

## Previously missing families (now mapped)

- All personal + collective Bar Gauntlets (incl. Good Spirits, notes: verification-gated)
- Drinking with Davids pack
- Frozen Concoctions + License to Chill (notes: verification-gated pending tropical-frozen organizer set)
- D-094 All Hands on Deck, D-095 Seven Days Seven Ways, D-096 Bananaday Dreamin'

## Validation performed

- Every composed active `stableKey` present exactly once in map
- No duplicate stable keys in compose
- Game ownership / readiness preserved for blocked rows
- Competitive points: none on definitions (audit assertion)
- `load-production-achievements.mjs` still requires explicit confirm gates (unchanged)

## Per-definition machine audit

See `definition-validation.json` in this folder:

- `missing_map: 0`
- Frozen tag present in launch JSON: **true**
- Frozen tropical defs carry `VERIFICATION_GATED`
- Exact-key / ingredient-tag gaps for the prior INT-ACH-004 nine: **cleared in JSON**

## Production enablement note

Map coverage ≠ cruise DB load. Activation still requires explicit `load-production-achievements` / admin upsert with `test_only=false`. Dev load uses `test_only=true` via `dev_upsert_working_achievement_definition`.
