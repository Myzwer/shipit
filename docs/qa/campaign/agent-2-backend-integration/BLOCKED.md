# REMAINING BLOCKED / NOT-RUN

| ID | Reason |
|---|---|
| QA3A-B006 | Probe harness aborted (`catalog_version_id='undefined'`); not re-run as product proof |
| QA3A-B014 | Organizer sacred — read-only cruise-id check only |
| Vitest pause suite in mixed batch | Finale latch from prior file in same process trips guard; B010 abort covered by probe |
| Vitest achievement engine after finale cases | Same latch sequencing; probe scripts are authoritative |
| Featured photo signed-URL expiry soak | Not claimed beyond contract; Storage soak optional follow-up on qa2 |
| Organizer `11100` apply | Explicitly forbidden; WRP-001 counts proven only on qa2 |
| ACH-002 as product defect | Static ACH-002 **not** confirmed on backend — do not treat as open INT |

## Differences: mocked/unit vs live backend

| Area | Unit/mocked (QA-3A/3B) | Live qa2 backend |
|---|---|---|
| ADM-001/002/003/008/009 | Contract fails | **Confirmed** against real Edge/RPC + localStorage shim |
| ADM-005/006 | Frontend contract | Backend fine; frontend-only |
| ACH-002 MO gauntlet | Suspected leak | **Not reproduced** — MO correctly excluded |
| ACH-001 frozen | Suspected unreachable | **Confirmed** (zero frozen tags) |
| WRP-001 | Counts hidden without 11100 | Counts appear with 11100; **new rank bug** |
| Roster list empty | N/A | Demo aliases excluded by design (10100); not a cruise-ops defect for real guests |
