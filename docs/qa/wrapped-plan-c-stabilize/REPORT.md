# Wrapped Plan C — Final Stabilization Report

**Captured:** 2026-11-13  
**Live fixture:** `wrapped` plan-c-full (`fingerprint f9f07ab84d988614`, cruise `development-only`)  
**App:** `http://127.0.0.1:5173` → local Supabase `http://127.0.0.1:54321`

---

## 1. Root cause (15 expected → 13 in browser)

Not a fixture or eligibility bug.

| Session | Drinks | Points | Slides | Notes |
|---|---:|---:|---:|---|
| **David F.** (Plan C QA player) | 9 | 100 | **15/15** | Coverage + browser confirmed |
| **Josh** (common default login) | 4 | 50 | **13/13** | Matches the reported “4 drinks / 50 points / 13 slides” |

Josh legitimately skips:

| Slide | Eligibility result | Reason |
|---|---|---|
| **DI-02** | skipped | `DI-P12` has **4** one-drink winners (`resolveWinners(..., 2)` fails; value `< 2`) |
| **DI-07** | skipped | `DI-P18` lists **4** day labels at 1 drink each (`dayLabels` needs 1–2; drinks ≥ 2) |

Live DB inspect matches the prepared plan-c-full snapshot counts. Coverage verifier (`npm run qa:wrapped-plan-c-coverage`) still reports **15/15 + 12/12** for David / Katie.

**No production eligibility, scoring, fixture reseeding, clock, or migration changes were required.**

---

## 2. Coverage (browser-rendered)

### Drink It! — David F.

| Slide ID | Expected | Browser displayed | Eligibility | Reason |
|---|---|---|---|---|
| DI-01 | yes | yes | included | — |
| DI-02 | yes | yes | included | — |
| DI-03 | yes | yes | included | — |
| DI-04 | yes | yes | included | — |
| DI-05 | yes | yes | included | — |
| DI-06 | yes | yes | included | — |
| DI-07 | yes | yes | included | — |
| DI-08 | yes | yes | included | — |
| DI-09 | yes | yes | included | — |
| DI-10 | yes | yes | included | — |
| DI-11 | yes | yes | included | — |
| DI-12 | yes | yes | included | — |
| DI-13 | yes | yes | included | — |
| DI-14 | yes | yes | included | — |
| DI-15 | yes | yes | included | — |

Counter: `01 / 15 — Your Week` · hero drinks `9`

### Drink It! — Josh (explains the discrepancy)

Counter: `01 / 13 — Your Week` · hero drinks `4` · points `50`  
Included: DI-01,03,04,05,06,08,09,10,11,12,13,14,15 · **Skipped: DI-02, DI-07** (see reasons above)

### Ship It! — Katie / Team 3

| Slide ID | Expected | Browser displayed | Eligibility | Reason |
|---|---|---|---|---|
| SI-01 … SI-12 | yes | yes | included | — |

Counter: `01 / 12 — Your Team's Adventure` · **12/12** at all tested widths

Artifacts: `docs/qa/wrapped-plan-c-full/phase1-coverage-reconcile.json`, `docs/qa/wrapped-plan-c-stabilize/short-layout-recheck.json`

---

## 3. Changes made

| File | Reason |
|---|---|
| `src/features/wrapped/WrappedStoryCard.vue` | Content-aware body layouts: `full` / `short` / `double` / `double-compact` driven by supporting-copy / footer presence. Short stories center intro+reveal as one group (no empty reserved footer). Double without footer uses `double-compact`. Adds `data-body-layout` for QA. |

No eligibility, scoring, copy, carousel ordering, photo selection, or fixture changes.

---

## 4. Visual QA

Widths: **360 / 390 / 402 / 430** · shots under `docs/qa/wrapped-plan-c-stabilize/`

### Featured carousel

- Drink It David: **15** slides × 4 widths; Ship It Katie: **12** × 4 widths
- Short layout verified on David **DI-12** and Josh **DI-04** (Hangouts without supporting paragraph)
- Double-compact verified on David **DI-07** / **DI-14**
- Full layout verified on cards with supporting copy (e.g. DI-04 for David, SI-01)
- Photo Polaroids: captions present; no duplicate featured photo IDs in coverage
- Counters stable (`01 / 15`, `01 / 12`); card height locked by existing PeekCarousel (no jump)

### Leaderboards

- Drink It: Bounties (points) + Achievements · champion David F. `100`
- Ship It: Points + Challenges Completed · champion Team 3 `3,300` (prior activation smoke)
- Ties visible (e.g. Lindsey/Katie both rank 2)

### All Stats

| Game | My / Team tab rows | Ours / All tab rows | Combined |
|---|---:|---:|---:|
| Drink It! | 18 | 28 | **46** |
| Ship It! | 10 | 24 | **34** |

Matches the required 46 / 34 entry totals across both tabs.

---

## 5. Tests

| Command | Result |
|---|---|
| `npm run qa:wrapped-plan-c-coverage` | **PASS** — Drink It! 15/15, Ship It! 12/12 |
| `npx vitest run tests/unit/wrappedPlanCSlides.spec.ts` | **PASS** — 38 tests |
| `npx vue-tsc --noEmit` | **PASS** (exit 0) |

Fixture left intact (no reseed / no scenario switch).

---

## 6. Remaining issues

| Item | Severity | Notes |
|---|---|---|
| Reviewers logging in as Josh (or other non–David F. Drink It players) will see fewer than 15 slides | Low / process | Expected under unchanged eligibility; use **David F.** for Drink It Plan C full coverage and **Katie** for Ship It |
| Playwright headless_shell fails inside Cursor sandbox without `required_permissions: ["all"]` | Tooling only | Does not affect the app |

No visual blockers found against the established Plan C card direction for the Plan C QA accounts.
