# Remaining Test Coverage Gaps

Every blocked / not-run family from QA campaigns, classified by what unblocks it.  
**Do not mark complete because a related test passed.**

## Classification key

| Code | Meaning |
|---|---|
| `AUTO_NOW` | Automatable on disposable stacks with current harness |
| `NEEDS_FIX` | Requires product repair first |
| `DEVICE` | Physical iPhone/Android |
| `INJECT` | Specialized failure injection (proxy split, mid-PUT kill) |
| `CRUISE_CFG` | Needs real production cruise configuration |
| `MENU_AGENT` | Later menu-generation agent testing phase |
| `LAUNCH` | Final launch acceptance |

---

## Player media & connectivity

| ID / Case | Source | Class | Notes |
|---|---|---|---|
| DEV-HEIC-01 / E2E-ME-007 / E2B-M12 / QA2-B01 | 2A/2B/REL | `DEVICE` | Normal modern iPhone Photos HEIC — **missing evidence** |
| DEV-CAM-01 / E2E-ME-011 | 2A/2B | `DEVICE` | Live camera ≠ file fixture |
| DEV-AND-01 / E2E-ME-012 | 2A/2B | `DEVICE` | Android Chrome picker |
| QA2-B02 crop pinch/drag | REL UNTESTED | `DEVICE` | Pointer unit ≠ real gestures — **missing evidence** |
| QA2-B11 EXIF orientation samples | REL | `DEVICE` | Real camera samples |
| DEV-GAL-01 / E2E-ME-013 / QA2-B06 | 2A/2B | `NEEDS_FIX` then `DEVICE`/`AUTO_NOW` | 1h soak after REP-SIGNED-001 |
| DEV-NET-01 / QA2-B03/B04 / REL-005 live | REL/2A | `NEEDS_FIX` + `INJECT` | Mid-PUT abort on live Storage |
| E2E-NET-008/009 accept-then-disconnect | 2A/2B | `INJECT` | Playwright abort ≠ server-accept-then-loss |
| QA2-B05 JWT expiry mid-submit | REL | `INJECT` | Short-lived JWT on disposable |
| QA2-B08 Safari back during upload | REL | `DEVICE` | bfcache |
| QA2-B12 ship Wi-Fi / captive portal | REL | `CRUISE_CFG` / field | Emulation ≠ cruise network |
| QA2-B09 multi-tab concurrent submit | REL | `AUTO_NOW` | After R1; disposable `:56321` or `:55321` |
| QA2-B10 orphan cleanup after discard | REL | `NEEDS_FIX` + `AUTO_NOW` | After R2 |
| RISK-A navigator.onLine | REL | `CRUISE_CFG` | Field observation |

## Lifecycle / long session

| ID / Case | Source | Class | Notes |
|---|---|---|---|
| DEV-ROT-01 / E2E-LC-011 / E2B-L05 | 2A/2B | `DEVICE` / long `AUTO_NOW` | Leave Home across cocktail+ingredient windows — **missing extended session evidence** |
| DEV-GRACE-01 / E2E-LC-012 / E2B-L06 | 2A/2B | `DEVICE`/`AUTO_NOW` | Timed grace claim |
| DEV-CLK-01 / E2E-LC-008 | 2A/2B | `DEVICE` | Wrong device clock |
| DEV-FRI-01 / DEV-FIN-01 | 2B | `DEVICE`/`AUTO_NOW` | Friday cutoff / finale→Wrapped open tab |
| QA2-B07 pre-cruise/awards nav | REL | `AUTO_NOW` | Isolated stack clock mutate |
| E2B-L01/L02/L04 long-session suite remnants | 2B | Mixed | See LONG_SESSION_REPORT — do not inflate as product passes |

## Drink It / Daily / bounty

| ID / Case | Source | Class | Notes |
|---|---|---|---|
| E2E-DI-006 All Hands | 2A/2B | `AUTO_NOW` | Needs day assignment = All Hands (not Bring a Friend) |
| E2E-DI-007 | 2A | Blocked by DI-006 | Re-run after All Hands fixture |
| E2B-002 / E2B-S14 | 2B | `NEEDS_FIX` triage + isolated fixtures | Claimed_categories empty |
| DEF-QA1-001 | QA-1 | Product decide | Preview reason |

## Admin / catalog (post QA-4A)

| ID / Case | Source | Class | Notes |
|---|---|---|---|
| QA3A-B006 crafted `p_validation` bypass | 3A/4A | `AUTO_NOW` after harness fix | Probe aborted on `'undefined'` uuid — **not product proof** |
| QA3A-B014 organizer config verify | 3A/4A | `CRUISE_CFG` / `LAUNCH` | Organizer sacred |
| Full catalog hostile soak after R4/R5 | 4A | `AUTO_NOW` | Re-run probes on qa2 |
| Menu-agent generated catalogs | — | `MENU_AGENT` | After REP-CAT-MO/VAL |
| First schedule end-to-end on prod-like label | 4A | `NEEDS_FIX` (R5) then `LAUNCH` | INT-SCHED-001 |

## Achievements / Wrapped

| ID / Case | Source | Class | Notes |
|---|---|---|---|
| INT-ACH-07 post-finale award refuse | 3B list | Partial via probes | Reconfirm after latch sequencing harness fix |
| INT-ACH-08 secret title / gallery reveal | 3B | `AUTO_NOW` | Disposable |
| INT-ACH-11 Good Spirits prices | 3B | `CRUISE_CFG` | Keep gated |
| INT-ACH-12 companion alias map | 3B | `CRUISE_CFG` | Private map present |
| INT-ACH-13 cruise_day vs activity_day | 3B | `AUTO_NOW` | After 11000 |
| INT-ACH-14 test_only on non-dev cruise | 3B | `LAUNCH` | |
| ACH-002 wrong physical bar | 3B/4A | `AUTO_NOW` | Explicit wrong-bar_id case — **missing**; MO path already PASS |
| INT-WRP-06 featured photo expiry soak | 3B | `NEEDS_FIX` + soak | After R3 |
| INT-WRP-07 finale-only access gates | 3B | Mostly covered | Reconfirm on organizer read-only / disposable finale |
| Remaining award proofs beyond 23/174 | 4A | `AUTO_NOW` | Expand probe matrix — not all defs earned this run |
| Organizer Wrapped visual Plan C | prior | `LAUNCH` | Organizer fixture protected |

## Production initialization (missing evidence)

| Gap | Class | Notes |
|---|---|---|
| Real voyage dates + offset applied | `CRUISE_CFG` | AMBIGUITIES #1 |
| Production roster Auth provisioning | `CRUISE_CFG` | ≠ local Demo |
| Ship It team CRUD/labels | `CRUISE_CFG` | Admin cannot create teams |
| First schedule generation without `dev_*` | `NEEDS_FIX` + `LAUNCH` | INT-SCHED-001 |
| Organizer apply 10900/11000/11100 | `LAUNCH` after R6 | Snapshot first |
| Intermittent connectivity field trial | `CRUISE_CFG` | RISK-A / ship Wi-Fi |
| Extended multi-hour player session | `DEVICE`/`LAUNCH` | Beyond E2B short stress |

## Harness debt (not product)

| ID | Action |
|---|---|
| E2E-011 / E2E-012 | Fixed; keep targeting rules; do not reopen as product |
| HARNESS-QA1-* | Fixed |
| Vitest finale latch sequencing | Fix test process isolation so pause/achievement suites do not trip guard |
| QA3A-B006 probe uuid bug | Fix harness before claiming authz bypass proof |

## Explicit missing evidence called out by assignment

| Topic | Status |
|---|---|
| Normal modern iPhone photographs (HEIC/camera roll) | **Not verified** — device-only |
| Crop gestures (pinch/drag) | **Not verified** — unit ≠ touch |
| Extended sessions (multi-hour Home/gallery) | **Not verified** — blocked/long |
| Intermittent connectivity (real uplink) | **Not verified** — inject/field |
| Actual production initialization | **Not verified** — config + schedule path |

---

## Suggested post-repair verification waves

1. **Wave A (auto):** Flip failing unit contracts for R1–R7; re-run Agent 2 probes on `:56321`.  
2. **Wave B (browser):** QA-2A drinkit + QA-2B stress subset on `:55321` after R1–R3.  
3. **Wave C (device):** HEIC, camera, Android, crop, wrong clock, gallery soak.  
4. **Wave D (launch):** Production config checklist + first schedule + migration apply + All Hands day + finale Wrapped.
