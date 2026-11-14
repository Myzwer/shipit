# Launch Blockers — Cruise Autonomy

Anything that can make the seven-day voyage unusable, unfair, or require developer intervention.

## Hard blockers (must clear before embarkation)

| # | Blocker | Repair group | Evidence | Failure mode at sea |
|---|---|---|---|---|
| 1 | Navigate-away / double-submit can create **two accepted** drink logs | REP-SUB-001 | E2B-S07 / E2B-001 | Inflated scores; fairness dispute |
| 2 | **No production first bounty schedule** path | REP-SCHED-001 | INT-SCHED-001 / B012 | Day-1 automation never starts without ops/dev |
| 3 | Catalog import UI **locks** after stage→preview failure | REP-CAT-LOCK-001 | INT-CAT-001L | Cannot activate onboard menu without clearing storage |
| 4 | Gallery/Wrapped **signed URLs expire** with no recovery | REP-SIGNED-001 | REL-008 / E2B-L03 / WRP-002 | Broken photos mid-cruise / finale |
| 5 | Photo **abort/discard/retry** unreliable | REP-MEDIA-001 | REL-003/005/007 | Guests abandon uploads; storage orphans |
| 6 | Admin roster reconcile **lies** on in-progress / 409 | REP-ADM-ERR-001 | INT-ADM-001L/002L | Unsafe Auth re-entry; stranded creates |
| 7 | Admin can **self-lock out** of `/admin` | REP-ADM-LOCK-001 | INT-ADM-007L | No in-app recovery for only operator |
| 8 | Ship Clock confirm can **brick** panel | REP-ADM-LOCK-001 | ADM-005 | Contingency time fix unavailable |
| 9 | Apply migration **11100 without rank fix** | REP-WRP-RANK-001 | INT-WRP-002 | Wrong Home/Wrapped standings |
| 10 | Production achievement **release map** incomplete | REP-ACH-MAP-001 | INT-ACH-003 | Missing FINAL achievements if activated as-is |
| 11 | Frozen achievements **unreachable** (or wrongly shown) | REP-ACH-FROZEN-001 | INT-ACH-001 | Broken achievement promises |

Hard blockers 1–11 map to the **10 Must** repair groups (ADM lockout+clock share REP-ADM-LOCK-001; catalog lock is separate).

## Soft blockers (should clear; workable with ops discipline)

| # | Item | Group | Mitigation if deferred |
|---|---|---|---|
| S1 | Publish ignores pending / double-tap | REP-CAT-PUB-001 | Single operator; no double-tap |
| S2 | Admin pending survives sign-out | REP-ADM-SESS-001 | Clear site data on handoff |
| S3 | Skip/void gateway misclassification | REP-ADM-ERR-001 | Prefer stable network; Check Status carefully |
| S4 | MO catalog / menu concept carry | REP-CAT-MO-001 | Manual MO menu verify after publish |
| S5 | MO as Wrapped favorite venue | REP-WRP-MO-001 | Accept skewed stats or fix with R6 |
| S6 | Crew list mutates day lock | REP-CRW-001 | Don’t open crews tab casually |
| S7 | Finale latch without confirm | REP-CLK-001 | Extreme caution on Set Ship Time |
| S8 | E2B-002 claim categories | REP-CLAIM-001 | Triage; monitor claims |

## Configuration blockers (not code defects)

| # | Item | Source | Notes |
|---|---|---|---|
| C1 | Production `cruise_config` dates/offset | AMBIGUITIES #1 / CFG-DATES | Game never leaves pre-cruise correctly without these |
| C2 | Production roster Auth | CFG-ROSTER | Local ≠ production accounts |
| C3 | Ship It teams rows/labels | CFG-TEAMS | Admin cannot CRUD teams |
| C4 | Meetup free-text | CFG-MEETUP | All Hands announcements |
| C5 | Organizer migrations 10900/11000/11100 | CFG-MIG | Snapshot first; **11100 only after R6** |
| C6 | Companion alias private map | CFG-COMPANION-ALIAS | Davids / named companion awards |
| C7 | Good Spirits price evidence | CFG-GOOD-SPIRITS | Keep gated until verified |
| C8 | Photo cleanup ops schedule | CFG-PHOTO-CLEANUP | Backstop for orphans until R2 |

## Explicitly not launch blockers

| Item | Why |
|---|---|
| E2E-011 / E2E-012 | Harness defects; product claims work after harness fix |
| HARNESS-QA1-* | Test-only |
| DEF-QA1-001 | P3 preview reason ordering |
| REL-006 GIF empty MIME | Rare |
| INT-AUTH-001 JWT residual | Low; shared-device hygiene |
| ACH-002 MO gauntlet leak | **Not reproduced** live |
| RISK-CAT-C add-drink race | **PASS** live (B005) |
| Chromium ≠ iPhone HEIC | Device acceptance gap, not a known product fail |

## Go / no-go checklist (final launch acceptance)

- [ ] R1–R7 must groups green on disposable + unit contracts  
- [ ] E2B-S07 cannot reproduce duplicate accepts  
- [ ] Catalog preview failure recoverable without clearing site data  
- [ ] First schedule generated without `dev_generate_bounty_schedule` on prod-like label  
- [ ] Gallery `@error`/refresh proven; optional 1h soak  
- [ ] Admin zero-games still opens `/admin`  
- [ ] `11100` rank-correct on disposable before organizer apply  
- [ ] Achievement release map covers FINAL enablement plan  
- [ ] Frozen achievements tagged **or** gated out of guest surface  
- [ ] Production dates, roster, teams configured  
- [ ] Physical device HEIC + crop + wrong-clock smoke  
- [ ] Organizer Wrapped fixture snapshotted before any mutation  

## Decision gates still open

1. **Schedule path:** new Admin RPC vs one-shot ops service_role runbook (prefer RPC for autonomy).  
2. **Frozen tags:** content tagging vs keep verification-gated and hide.  
3. **ACH-002:** run wrong-physical-bar disposable proof before any SQL change.  
4. **DEF-QA1-001:** change server reason order vs update contract.  
5. **When to apply organizer 109/110/111:** only after snapshot + R6.
