# QA-2B — Intermittent failures & player stress testing

**Executed:** 2026-11-14 (local)  
**Branch:** `visual/drinkit-home-v1`  
**Backend:** disposable `http://127.0.0.1:55321` only  
**App:** main-tree Vite `http://127.0.0.1:5177`  
**Organizer `:54321`:** preserved — `lifecycle=final`, `finalized=true`, cruise `48fa40c6-…`  
**`QA_ALLOW_ORGANIZER_MUTATION`:** never set  
**Product repairs:** none (harness-only corrections for E2E-011/012)

## Verdict

E2E-011 and E2E-012 were **confirmed test harness defects**, not product rejections of valid bounty claims. After a narrow harness fix (no app changes), Drink It browser re-run passed ingredient, bar, and overlapping claims (`E2E-DI-004/005/008`).

Stress testing then surfaced a **new player-facing product risk**: navigating away during drink submit can leave **two accepted** submissions (`E2B-001`). Gallery signed-URL recovery remains missing (`E2B-L03` → REL-008 / E2E-030).

## Exact totals

### QA-2A original batch (unchanged authoritative registry)

| Metric | Count |
|---|---:|
| Total | 78 |
| Passed | 63 |
| Failed | 3 |
| Blocked | 10 |
| Not run | 2 |

Source: `docs/qa/campaign/qa2a-browser-e2e/TEST_REGISTRY.json` (preserved; drinkit-only re-run evidence kept separately).

### QA-2A Drink It re-run after harness fix (evidence only)

| ID | Outcome |
|---|---|
| E2E-DI-001..003, 005, 008..012 | **passed** |
| E2E-DI-004 Ingredient | **passed** (was failed) |
| E2E-DI-006 Daily | **failed** (daily already claimed / window) |
| E2E-DI-007 | **blocked** by DI-006 availability |

Console: `evidence/drinkit-after-harness.txt`

### QA-2B new meaningful cases

| Metric | Count |
|---|---:|
| Total | **46** |
| Passed | **16** |
| Failed | **12** |
| Blocked | **17** |
| Not run | **1** |

Source: [`TEST_REGISTRY.json`](./TEST_REGISTRY.json)

Repeated-run flake iterations are **not** counted as dozens of distinct cases — see [`FLAKINESS_INVESTIGATION.md`](./FLAKINESS_INVESTIGATION.md).

## Defect classification

| ID | Severity | Class | Summary |
|---|---|---|---|
| E2E-011 | P2 | **Harness defect** (confirmed) | Ingredient claim intentionally lands on bar picker; harness refused to click bars |
| E2E-012 | P2 | **Harness defect** (confirmed) | `/Bar/i` matched “8 bars” on Ingredient card → wrong deep link |
| E2B-001 | P1 | **Product defect** | Navigate-away during drink submit → 2 accepted rows |
| E2B-002 | P2 | **Product / eligibility** | Cocktail stress claim reached gallery with `claimed_categories=[]` |
| E2B-L03 / E2E-030 | P1 | **Product** (reproduced) | No gallery `@error` / signed URL recovery (REL-008) |

## Coverage mix

| Method | Role |
|---|---|
| Real browser + disposable backend | Authoritative |
| Harness-only fixes | `scripts/qa2a/lib/browser.mjs`, `suites/drinkit.mjs`, `scripts/qa2b/**` |
| Application source | **Unchanged** |
| Physical device | Still required — [`MANUAL_DEVICE_ACCEPTANCE.md`](./MANUAL_DEVICE_ACCEPTANCE.md) |

## Top ship risks

1. **Duplicate accepted drink logs if guest leaves mid-submit** (E2B-001) — slow Wi-Fi + tab switching.
2. **Gallery images die without recovery** (REL-008) — confirmed again via simulated URL failure.
3. **Bounty claim scoring vs UI success** — gallery success does not always mean `claimed_categories` populated (E2B-002 / exhausted fixtures).
4. **Large friend roster + floating nav** — still guest friction; harness now force-clicks Continue after measuring interception.

## Source modifications

| Path | Change |
|---|---|
| `scripts/qa2a/lib/browser.mjs` | Ingredient must pick bar; unlisted ingredient affirm path |
| `scripts/qa2a/suites/drinkit.mjs` | Stable `bounty-card-ingredient` / `bounty-card-bar` targeting |
| `scripts/qa2b/**` | New investigation + stress harness |
| `docs/qa/campaign/qa2b-browser-stress/**` | This report pack |
| `.gitignore` | Ignore qa2b evidence |
| **`src/**` application** | **None** |
