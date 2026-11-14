# QA-2A — Ship It! browser journeys

**Backend:** disposable `:55321`  
**Note:** QA-1 already covered all 50 challenge definitions at RPC level. This batch validates **browser flow** + representative variants.

## Results

| ID | Journey | Outcome |
|---|---|---|
| E2E-SI-001 | Challenge list + categories | **passed** |
| E2E-SI-002 | Photo required before continue | **passed** |
| E2E-SI-003 | Review reflects photo/caption | **passed** |
| E2E-SI-004 | Submit success | **passed** |
| E2E-SI-005 | Completed display after submit | **passed** |
| E2E-SI-006 | Duplicate attempt blocked (non-actionable card) | **passed** |
| E2E-SI-007 | Teammate sees completion | **passed** |
| E2E-SI-008 | Drink-only denied Ship It challenges | **passed** |
| E2E-SI-009 | Second challenge (portrait photo) | **passed** |
| E2E-SI-010 | Two teammates concurrent same challenge | **passed** (`dbCount=1`) |
| E2E-SI-011 | Home standings visible | **passed** |
| E2E-SI-012 | Friday cutoff browser | **not_run** (delegated to E2E-LC-009) |

## Observations

- Concurrent teammate submits produced **exactly one** active completion — no double score observed.
- Floating bottom nav can intercept scavenger Submit (force-click / pointer-events workaround in harness; real thumbs may miss the button).
- Friday cutoff presentation verified in lifecycle suite after authoritative finale latch.
