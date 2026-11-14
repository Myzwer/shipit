# QA-2A — Media / Storage E2E

**Assets:** `tests/fixtures/{tiny.jpg,sample.png,portrait.jpg,landscape.jpg}`  
**Backend:** real disposable Storage + `photos` / gallery tables

## Results

| ID | Journey | Outcome | Links |
|---|---|---|---|
| E2E-ME-001 | JPEG upload → gallery + refresh | **passed** | |
| E2E-ME-002 | PNG upload → gallery + refresh | **passed** | |
| E2E-ME-003 | Portrait → framing → square stage | **passed** | |
| E2E-ME-004 | Landscape stages | **passed** | |
| E2E-ME-005 | Gallery posts load | **passed** | |
| E2E-ME-006 | Photo viewer / expand | **passed** | |
| E2E-ME-007 | Reactions | **blocked** | control not found in build |
| E2E-ME-008 | Signed URL short session | **passed** | REL-008 long soak outstanding |
| E2E-ME-009 | Discard staged photo orphan | **failed** | **REL-003** / E2E-031 |
| E2E-ME-010 | Double-tap scavenger submit | **passed** (nav OK) | **REL-001** retained E2E-032 |
| E2E-ME-011 | HEIC | **blocked** | physical Safari required |
| E2E-ME-012 | Abort mid Storage PUT | **blocked** | **REL-005** |
| E2E-ME-013 | Remount retry empty blob | **blocked** | **REL-007** |

## REL-* integration status

| ID | Agent 2 | QA-2A |
|---|---|---|
| REL-001 | Unit/contract | Observable double invocation path; score usually idempotent |
| REL-002 | Daily guard gap | Not separately failed here; retain |
| REL-003 | Static missing abandon | **Reproduced** — photos count +1 after discard |
| REL-004 | Drink reset orphan | Not separately counted; same root as REL-003 |
| REL-005 | Signal not passed to upload | Outstanding |
| REL-007 | Empty blob retry | Outstanding |
| REL-008 | No refresh/@error | **Reproduced by inspection**; short-session OK |

No product fixes applied.
