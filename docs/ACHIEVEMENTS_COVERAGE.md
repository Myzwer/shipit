# Achievements coverage audit (Phase 7A)

**Source:** provisional snapshot  
`handoff/achievements/Star_Princess_Achievements_Interim_Cursor_Handoff_2026-11-06.md`  
(140 working rows: S-001…S-048, D-001…D-093 excluding blank D-027).  
**Not** a final catalog. Temporary `S-`/`D-` refs are snapshot pointers, not DB IDs.

## Outcome labels

| Label | Meaning |
|---|---|
| **SUPPORTED** | Engine primitive + recorded evidence exist (or are introduced empty and fillable without inventing facts). Test fixtures can exercise the row’s condition family. |
| **NEEDS CONTENT/METADATA** | Engine can express the condition, but production unlocks need tags, config dates, challenge-key mapping, or named player IDs not present in Git. |
| **NEEDS ORGANIZER DECISION** | Product/definition unresolved; do not fake with a proxy. |

## Condition families (engine primitives)

| Code | Family | Evidence sources |
|---|---|---|
| A | Accepted-event counts / thresholds | `submissions` accepted + kind |
| B | Distinct counts / sets | bars, drink concepts, days, companions, bounty cats, scavenger categories |
| C | Grouped counts (bar/drink/day/category) | same-day counts, same-bar multi-day |
| D | Exact item matches | challenge `canonical_key`, drink_mode/generic_type, ingredient `canonical_key` |
| E | Classification metadata matches | **new** `ingredient_tags` / `drink_concept_tags` (empty until curated) |
| F | Same-submission bounty combinations | `bounty_claims` on one submission |
| G | Finite set completion | all challenges; all categories; named challenge sets |
| H | Two-event order / interval | received_at_utc pairs (30m, 2h apart, after Cocktail claim) |
| I | Companions | `drink_log_companions` player UUIDs |
| J | Ship-time / day / window | ship clock + `ship_day`; port/thanksgiving need config |
| K | Exclusive first-to | unique active exclusive award + earliest valid submission |
| ALL/ANY | Bounded composites | nesting depth limited |

## Data inventory (reviewed against live schema)

| Need | Status |
|---|---|
| Drink logs with bar, offering, concept, mode (beer/wine/other/named) | Present (`drink_logs`) |
| Companions as player UUIDs | Present (`drink_log_companions`) |
| Bounty claims by category on submission | Present (`bounty_claims`) |
| Ship day + received_at_utc | Present (`submissions`) |
| Catalog version on drink log | Present (`drink_logs.catalog_version_id`) |
| Ingredient keys on offerings (versioned) | Present (`catalog_offering_ingredients`) |
| Spirit family / clear-dark / rum style / frozen / fruit tags | **Missing** as structured tags (`family` is coarse free text only) |
| Recipe ingredient count | Derivable from offering ingredient rows when catalog version known |
| Margarita / cocktail-type tags | **Missing** |
| Scavenger challenges (50) + 5 categories + keys | Present (dev titles ≠ interim titles) |
| Port-day schedule | **Missing** on `cruise_config` |
| Thanksgiving ship date | **Missing** |
| Participating Drink It! membership definition | Unresolved (D-082) |
| Shared pool-menu eligible set | Unresolved (D-083) |
| Daily attainable max formula | Unresolved (D-085) |
| Named companion → player UUID map | Must not live in public repo |

## Ship It! matrix (48)

| Refs | Trigger summary | Families | Outcome |
|---|---|---|---|
| S-001…S-005 | Challenge count thresholds 1/5/10/15/25 | A | SUPPORTED |
| S-006 | All 50 challenges | G | SUPPORTED |
| S-007 | ≥1 in each of 5 categories | B,G | SUPPORTED |
| S-008 | Every challenge in any one category | G | SUPPORTED |
| S-009 | Before 10:00 Ship Time | J | SUPPORTED |
| S-010 | After 22:00 Ship Time | J | SUPPORTED |
| S-011 | 3 challenges same cruise day | C | SUPPORTED |
| S-012 | First cruise day | J | SUPPORTED |
| S-013 | Final cruise day before end | J | SUPPORTED |
| S-014 | Port day 10:00–16:00 | J | NEEDS CONTENT/METADATA (port days) |
| S-015 | Challenges on 3 different days | B | SUPPORTED |
| S-016 | 2 within 30 minutes | H | SUPPORTED |
| S-017…S-038 | Exact named challenge | D | NEEDS CONTENT/METADATA (title→`canonical_key` mapping for final defs; engine exact-key is ready) |
| S-039…S-045 | First team for exact challenge | D,K | NEEDS CONTENT/METADATA (same key mapping) |
| S-046 | First team: one per category | B,G,K | SUPPORTED |
| S-047 | First team: full category sweep | G,K | SUPPORTED |
| S-048 | Three named challenges set | G | NEEDS CONTENT/METADATA (key mapping) |

## Drink It! matrix (92)

| Refs | Trigger summary | Families | Outcome |
|---|---|---|---|
| D-001…D-005 | Alcoholic drink counts 1/3/7/15/30 | A | SUPPORTED |
| D-006…D-010 | First bounty / daily | A,F | SUPPORTED |
| D-011 | 2 bounty cats same drink | F | SUPPORTED |
| D-012 | Cocktail+Ingredient+Bar same drink | F | SUPPORTED |
| D-013 | All 4 cats same day | C,F | SUPPORTED |
| D-014…D-017 | Bounty cats across 3 days | B,C | SUPPORTED |
| D-018 | Each of 4 cats once | B | SUPPORTED |
| D-019…D-022 | Distinct bars 2/5/10/13 | B | SUPPORTED |
| D-023 | 3 bars same day | C | SUPPORTED |
| D-024 | Same bar ≥2h apart | H | SUPPORTED |
| D-025 | Same cocktail at 2 bars | B,H | SUPPORTED |
| D-026 | 3 distinct cocktails one bar | C | SUPPORTED |
| D-028…D-029 | Distinct cocktails 3/8 | B | SUPPORTED |
| D-030 | Same cocktail 3 times | A | SUPPORTED |
| D-031 | Repeat cocktail after Cocktail claim | H | SUPPORTED |
| D-032, D-084 | Other alcoholic option (dup trigger) | D | SUPPORTED (keep distinct defs) |
| D-033 | Frozen cocktail | E | NEEDS CONTENT/METADATA (`drink_concept_tags.frozen`) |
| D-034, D-035, D-080 | Wine / Beer (D-035≈D-080 dup) | D | SUPPORTED |
| D-036 | Cocktail + beer + wine across logs | B,D | SUPPORTED |
| D-037…D-040 | 3× gin/tequila/rum/whiskey | D,E | NEEDS CONTENT/METADATA (ingredient tags or keys) |
| D-041…D-042 | Clear / dark base spirit ×5 | E | NEEDS CONTENT/METADATA |
| D-043 | Gin+vodka+rum+tequila across cruise | B,E | NEEDS CONTENT/METADATA |
| D-044…D-061 | Specific ingredient / brand keys | D | NEEDS CONTENT/METADATA (confirm keys in catalog; some may match existing keys) |
| D-062 | ≥7 listed recipe ingredients | E/count | SUPPORTED when offering has ≥7 associations |
| D-063 | ≥2 base-spirit families one cocktail | E | NEEDS CONTENT/METADATA |
| D-064 | ≥2 rum styles one cocktail | E | NEEDS CONTENT/METADATA |
| D-065 | Wine/rosé/Prosecco/Champagne in cocktail | D,E | NEEDS CONTENT/METADATA |
| D-066 | ≥3 fruits from fixed set across cruise | B,E | NEEDS CONTENT/METADATA |
| D-067…D-068 | Companion counts 2 / 5 others | I | SUPPORTED |
| D-069 | Companion + noon–1pm | I,J | SUPPORTED |
| D-070 | ≥3 distinct companions | I,B | SUPPORTED |
| D-071 | Same companion @ 3 bars | I,B | SUPPORTED |
| D-072…D-073 | Before 11:00 / after 23:00 | J | SUPPORTED |
| D-074 | 2 drinks within 30 minutes | H | SUPPORTED |
| D-075 | Port daytime window | J | NEEDS CONTENT/METADATA |
| D-076…D-077 | First / final cruise day | J | SUPPORTED |
| D-078 | Drinks on 3 days | B | SUPPORTED |
| D-079 | Same bar on 3 days | C | SUPPORTED |
| D-081 | Thanksgiving | J | NEEDS CONTENT/METADATA (+ voyage calendar) |
| D-082 | Every other participating player | I | **NEEDS ORGANIZER DECISION** |
| D-083 | All shared pool-menu cocktails | G | **NEEDS ORGANIZER DECISION** |
| D-085 | Max attainable daily bounty points | — | **NEEDS ORGANIZER DECISION** |
| D-086…D-093 | Named companion + drink conditions | I,D,E | NEEDS CONTENT/METADATA (player UUID map out-of-band; no dual grant) |

## Intentionally preserved collisions

| Pair | Notes |
|---|---|
| D-001 vs D-087 | Same title, different triggers — distinct definitions |
| D-035 vs D-080 | Duplicate Beer trigger — distinct definitions pending editorial |
| D-032 vs D-084 | Duplicate Other trigger — distinct definitions pending editorial |
| Dual companion awards | **Not implemented** (organizer undecided) |

## Summary counts

| Outcome | Approx. refs |
|---|---|
| SUPPORTED | ~78 |
| NEEDS CONTENT/METADATA | ~59 |
| NEEDS ORGANIZER DECISION | 3 (D-082, D-083, D-085) |

Exact publishing of interim titles/icons/secrets remains Phase **7B**. Phase **7A** ships the engine + small test-only catalog exercising families A–K.

## Engine / test policy

- Unknown `condition_type` → validation failure.
- Classification conditions never unlock via display-name / alias substring matching.
- Empty tag tables ⇒ classification defs stay unearned (no fabricated unlocks).
- Exclusive firsts use earliest `received_at_utc`, then immutable `submission_id`.
- Void recomputes dependent awards in `achievement_on_void_submission`.
