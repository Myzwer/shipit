# Defect Disposition — Every Original ID

Disposition classes:

| Class | Meaning |
|---|---|
| `confirmed_product` | Repair required (see `REP-*`) |
| `duplicate_of` | Same root as another ID; do not repair twice |
| `live_confirmation` | Backend/browser confirmation of a prior ID |
| `harness_only` | Test debt; not a product defect |
| `resolved_or_invalid` | Fixed by later evidence, or not a defect |
| `configuration_required` | Content/migration/ops input — not (only) code |
| `unverified_risk` | Suspected; insufficient fail evidence |
| `blocked_testing` | Could not be proven yet |

---

## QA-1

| Original ID | Disposition | Maps to | Notes |
|---|---|---|---|
| DEF-QA1-001 | `confirmed_product` | REP-PREVIEW-001 | P3 bar preview reason ordering |
| HARNESS-QA1-MO-001 | `harness_only` | — | Wrong offering_id; fixed in tests |
| HARNESS-QA1-DISPOSE-001 | `harness_only` | — | `disposePlayers` FK; fixed in helpers |

## QA-2 reliability (`REL-*`)

| Original ID | Disposition | Maps to | Notes |
|---|---|---|---|
| REL-001 | `confirmed_product` | REP-SUB-001 | Scavenger in-flight guard; linked E2E-032 |
| REL-002 | `confirmed_product` | REP-SUB-001 | Daily in-flight guard (same family) |
| REL-003 | `confirmed_product` | REP-MEDIA-001 | Scavenger discard orphans Storage |
| REL-004 | `confirmed_product` | REP-MEDIA-001 | Drink `resetAll` orphan (same root) |
| REL-005 | `confirmed_product` | REP-MEDIA-001 | AbortSignal not passed to Storage PUT |
| REL-006 | `confirmed_product` | REP-MIME-001 | Empty MIME + `.gif` bypass |
| REL-007 | `confirmed_product` | REP-MEDIA-001 | Remount retry empty Blob |
| REL-008 | `confirmed_product` | REP-SIGNED-001 | Gallery signed URL no refresh/`@error` |
| RISK-A | `unverified_risk` | — | `navigator.onLine` on ship Wi-Fi |
| RISK-B | `unverified_risk` | REP-MEDIA-001 (extend) | DailyClaim discard likely same orphan |
| RISK-C | `configuration_required` | — | HEIC friction; mitigated by message |
| RISK-D | `unverified_risk` | — | Router scrollBehavior vs wizard |
| RISK-E | `resolved_or_invalid` | — | By-design: originals not retained |

## QA-2A / QA-2B browser

| Original ID | Disposition | Maps to | Notes |
|---|---|---|---|
| E2E-030 | `duplicate_of` | REL-008 → REP-SIGNED-001 | Browser confirmation |
| E2E-031 | `duplicate_of` | REL-003 → REP-MEDIA-001 | Browser orphan confirmation |
| E2E-032 | `duplicate_of` | REL-001 → REP-SUB-001 | Double-tap reachability |
| E2E-011 | `harness_only` | — | Ingredient bar-picker; fixed harness; DI-004 passed |
| E2E-012 | `harness_only` | — | `/Bar/i` wrong card; fixed harness; DI-005 passed |
| E2B-001 | `confirmed_product` | REP-SUB-001 | **Nav-away → 2 accepted** (elevated) |
| E2B-002 | `confirmed_product` | REP-CLAIM-001 | Success path without claimed_categories (triage) |
| E2B-L03 | `live_confirmation` | REL-008 → REP-SIGNED-001 | Simulated URL error |

## QA-3A Admin / Catalog

| Original ID | Disposition | Maps to | Notes |
|---|---|---|---|
| ADM-001 | `confirmed_product` | REP-ADM-ERR-001 | `in_progress` → failed |
| ADM-002 | `confirmed_product` | REP-ADM-ERR-001 | 409 OPERATION_IN_PROGRESS → failed |
| ADM-003 | `confirmed_product` | REP-ADM-ERR-001 | Gateway errors → failed |
| ADM-004 | `confirmed_product` | REP-ADM-ERR-001 | Deterministic void errors → unknown (narrowed live) |
| ADM-005 | `confirmed_product` | REP-ADM-LOCK-001 | ShipClock confirm missing catch |
| ADM-006 | `confirmed_product` | REP-ADM-SESS-001 | Sign-out leaves admin pending |
| ADM-007 | `confirmed_product` | REP-ADM-LOCK-001 | Zero games blocks `/admin` |
| ADM-008 | `confirmed_product` | REP-CAT-LOCK-001 | Catalog pending lock |
| ADM-009 | `confirmed_product` | REP-CAT-PUB-001 | Publish ignores pending |
| CAT-001 | `duplicate_of` | ADM-008 → REP-CAT-LOCK-001 | Same root |
| CAT-002 | `confirmed_product` | REP-CAT-MO-001 | `mobile-order` accepted as bar |
| RISK-ADM-A | `duplicate_of` | INT-CLK-001 → REP-CLK-001 | Finale latch |
| RISK-ADM-B | `duplicate_of` | INT-CRW-001 → REP-CRW-001 | Crew list mutates |
| RISK-ADM-C | `unverified_risk` | — | Daily announcement last-write-wins |
| RISK-ADM-D | `resolved_or_invalid` | — | Usability (UUID paste); not defect |
| RISK-CAT-A | `unverified_risk` | — | No payload size limit |
| RISK-CAT-B | `blocked_testing` | — | Direct RPC bypass (QA3A-B006 harness abort) |
| RISK-CAT-C | `resolved_or_invalid` | — | Add-drink vs publish race **PASS** live (B005) |
| RISK-CAT-D | `duplicate_of` | INT-SCHED-001 → REP-SCHED-001 | First schedule |
| RISK-CFG-A | `configuration_required` | CFG-* | Missing Admin tooling for cruise_config/teams |

## QA-3B Achievements / Wrapped

| Original ID | Disposition | Maps to | Notes |
|---|---|---|---|
| ACH-001 | `confirmed_product` + `configuration_required` | REP-ACH-FROZEN-001 | Zero frozen tags; engine OK with tags |
| ACH-002 | `unverified_risk` | REP-ACH-GAUNT-001 | Static fail; **MO leak not reproduced** live |
| ACH-003 | `configuration_required` | REP-ACH-MAP-001 | Release map 140 vs 174 |
| WRP-001 | `resolved_or_invalid` + `configuration_required` | REP-WRP-RANK-001 | Counts fixed by `11100`; organizer still needs apply after rank fix |
| WRP-002 | `duplicate_of` | REL-008 → REP-SIGNED-001 | Wrapped Polaroid signed URLs |

## QA-4A Integration (`INT-*`)

| Original ID | Disposition | Maps to | Notes |
|---|---|---|---|
| INT-CAT-001L | `live_confirmation` | REP-CAT-LOCK-001 | ADM-008 live |
| INT-ADM-001L | `live_confirmation` | REP-ADM-ERR-001 | ADM-001 live |
| INT-ADM-002L | `live_confirmation` | REP-ADM-ERR-001 | ADM-002 live |
| INT-ADM-003L | `live_confirmation` | REP-ADM-ERR-001 | ADM-003 live |
| INT-ADM-004L | `live_confirmation` | REP-ADM-ERR-001 | ADM-004 narrowed |
| INT-ADM-007L | `live_confirmation` | REP-ADM-LOCK-001 | ADM-007 live |
| INT-ADM-009L | `live_confirmation` | REP-CAT-PUB-001 | ADM-009 live |
| INT-SCHED-001 | `confirmed_product` | REP-SCHED-001 | No prod first schedule |
| INT-WRP-002 | `confirmed_product` | REP-WRP-RANK-001 | Rank regression from 11100 |
| INT-WRP-003 | `confirmed_product` | REP-WRP-MO-001 | MO counted as venue |
| INT-ACH-001 | `live_confirmation` | REP-ACH-FROZEN-001 | ACH-001 live |
| INT-ACH-003 | `live_confirmation` | REP-ACH-MAP-001 | ACH-003 live |
| INT-ACH-004 | `confirmed_product` | REP-ACH-EMPTY-001 | Empty/missing eligible sets |
| INT-CAT-003 | `confirmed_product` | REP-CAT-VAL-001 | Non-enum tier stages |
| INT-CAT-004 | `confirmed_product` | REP-CAT-MO-001 | MO menu concepts not carried |
| INT-CAT-006 | `live_confirmation` | REP-CAT-MO-001 | CAT-002 live |
| INT-CAT-007 | `confirmed_product` | REP-CAT-ERR-001 | Raw Postgres errors |
| INT-CRW-001 | `confirmed_product` | REP-CRW-001 | Crew list mutates/locks day |
| INT-CLK-001 | `confirmed_product` | REP-CLK-001 | Set Ship Time past finale no confirm |
| INT-AUTH-001 | `confirmed_product` | REP-AUTH-001 | JWT valid after client signOut |

## Configuration IDs (from audits / ambiguities)

| ID | Disposition | Notes |
|---|---|---|
| CFG-DATES | `configuration_required` | Production day1 / offset |
| CFG-ROSTER | `configuration_required` | Production Auth roster |
| CFG-TEAMS | `configuration_required` | Ship It team rows/labels |
| CFG-MEETUP | `configuration_required` | All Hands free-text |
| CFG-MO-MENU | `configuration_required` | Optional OceanNow menu |
| CFG-PHOTO-CLEANUP | `configuration_required` | Cleanup schedule |
| CFG-MIG-109-111 | `configuration_required` | Organizer migrations after snapshot |
| CFG-GOOD-SPIRITS | `configuration_required` | Price evidence gate |
| CFG-COMPANION-ALIAS | `configuration_required` | Private alias map for Davids pack |

## Completeness check

- **54** filed defect IDs from DEFECTS.md files appear above.
- Live `*L` suffixes are confirmations, not extra root causes.
- No original ID silently omitted.
- Harness IDs retained for audit trail but excluded from repair-group severity rollups.
