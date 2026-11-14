# QA-2B — Outstanding QA-2A coverage disposition

Original QA-2A registry preserved at `docs/qa/campaign/qa2a-browser-e2e/TEST_REGISTRY.json` (78 cases). Below: the **10 blocked** + **2 not_run** from QA-2A, plus the **3 failed** that QA-2B revisited.

## Failed in QA-2A → revisited

| ID | QA-2A | QA-2B disposition |
|---|---|---|
| E2E-DI-004 | failed (E2E-011) | **Harness fixed; drinkit re-run PASSED**. Original registry left as historical fail; see SUMMARY / FLAKINESS. |
| E2E-DI-005 | failed (E2E-012) | **Harness fixed; drinkit re-run PASSED**. |
| E2E-ME-009 | failed (REL-003 / E2E-031) | Reproduced orphan risk path where runnable; media discard often **blocked** when Ship challenge list exhausted (`E2B-M08`). Defect retained. |

## Not run (2)

| ID | QA-2A reason | QA-2B |
|---|---|---|
| E2E-DI-006 All Hands | Day mode was Bring a Friend | **Still not_run** — daily claim disabled/already used on disposable day (`daily-claim-disabled-or-missing`). Not mocked as pass. |
| E2E-SI-012 two-phone | Dual context ≠ two devices | **Still blocked** — see MANUAL_DEVICE_ACCEPTANCE `DEV-TAB-01`. |

## Blocked (10)

| ID | Why blocked in QA-2A | QA-2B disposition |
|---|---|---|
| E2E-DI-008 overlap | Blocked by DI-004 fail | **Drinkit re-run PASSED** after harness fix (cocktail+ingredient). |
| E2E-LC-008 wrong device clock | Needs device clock | **Still blocked** |
| E2E-LC-011 rotation leave-open | Multi-hour | **Still blocked** (`E2B-L05`) |
| E2E-LC-012 grace timing | Timed grace window | **Still blocked** (`E2B-L06`) |
| E2E-ME-007 HEIC | iPhone Safari | **Still blocked** (`E2B-M12` / DEV-HEIC-01) |
| E2E-ME-011 live camera | File input ≠ camera | **Still blocked** |
| E2E-ME-012 Android picker | Device | **Still blocked** |
| E2E-ME-013 gallery 1h soak | Time | **Still blocked**; short-session gallery refresh passed (`E2B-M11`); simulated expiry failed recovery (`E2B-L03`) |
| E2E-NET-008 accept-then-disconnect drink | Needs split proxy | **Still blocked** — Playwright abort ≠ server-accept-then-loss |
| E2E-NET-009 accept-then-disconnect ship | Same | **Still blocked** |

## Rules honored

- No blocked case relabeled **passed** via mocks or source-only inspection.
- Source inspection used only to document media limits (`E2B-M00`) and link REL contracts.
- Physical-device procedures: [`MANUAL_DEVICE_ACCEPTANCE.md`](./MANUAL_DEVICE_ACCEPTANCE.md).
