# BLOCKED_INTEGRATION_TESTS — QA-3B

All items require a **dedicated disposable** Supabase (not `:54321`, not Agent 1 `:55321`) plus explicit permission to mutate.

## Achievement awarding / void

| ID | Proof required |
|---|---|
| INT-ACH-01 | Single qualifying drink unlocks expected def; nonqualifying does not |
| INT-ACH-02 | Threshold −1 / = / +1 for representative event_count / distinct_count defs |
| INT-ACH-03 | One log unlocks multiple inclusive-tier achievements; receipt lists all IDs |
| INT-ACH-04 | Idempotent UUID replay returns same award IDs; no duplicates |
| INT-ACH-05 | Collective gauntlet awards every enrolled Drink It! player |
| INT-ACH-06 | Void submission revokes unsupported awards; exclusive First reassigned |
| INT-ACH-07 | Post-finale void/submit refuse award changes |
| INT-ACH-08 | Secret title masked on list until earned; Gallery reveal rules |
| INT-ACH-09 | Mobile Order log with physical offering_id does **not** advance gauntlet (ACH-002 live) |
| INT-ACH-10 | After frozen tags published, License to Chill / Frozen Concoctions unlock paths |
| INT-ACH-11 | Good Spirits remains locked until verified prices; then full-menu applies |
| INT-ACH-12 | Companion alias map load; Davids + named companion awards |
| INT-ACH-13 | cruise_day first/final/Thanksgiving vs activity_day 05:00 boundary |
| INT-ACH-14 | Production `test_only=false` on non-development cruise label |

## Wrapped aggregation

| ID | Proof required |
|---|---|
| INT-WRP-01 | Each of 80 metrics vs independent fixture recomputation on disposable DB |
| INT-WRP-02 | Voided claims/completions excluded; historical accepted kept |
| INT-WRP-03 | DI-G11 only counts existing Adventurous tier assignments |
| INT-WRP-04 | Ship It! Wrapped standings == `shipit_team_score_rows` after void/recompute |
| INT-WRP-05 | Apply `11100` → Achievements LB mode ranks with real counts /126 |
| INT-WRP-06 | Featured photos resolve signed URLs; expiry refresh after REL-008/WRP-002 fix |
| INT-WRP-07 | Finale-only access; membership gates; read-only (no claims) |
| INT-WRP-08 | Sparse vs full Plan C carousel against seeded scenario packs |

## Explicitly out of scope this assignment

Mutating organizer or Agent 1 databases; applying migrations; pushing; repairing product code.
