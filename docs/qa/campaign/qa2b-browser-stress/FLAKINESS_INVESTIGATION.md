# QA-2B — Flakiness investigation (E2E-011 / E2E-012)

## Method

Instrumented Playwright journeys against disposable `:55321` with:

- Step timeline (`wizard-mounted` → bar/drink/friends/photo/review)
- Network/console tails
- Screenshots under `evidence/` (gitignored)
- Authoritative `submissions` rows after submit

Repeated runs counted **separately** from meaningful case IDs.

## E2E-011 — Ingredient Bounty timeout

### Where the timeout occurred

**Before harness fix:** 100% of Demo Both Games iterations (5/5) stalled at **wizard → review**, stuck on **`bar-list`**.

Timeline signature:

1. Claim click succeeded → ` /drinkit/log?from=ingredient`
2. Prefill settle waited for friends/drink/photo/review
3. Loop only did `prefill-bar-flash-wait` (refused to click bars)
4. Final timeout on `[data-testid="wizard-review-step"]`

Not timeouts on: navigation to log, submit RPC, gallery, or score refresh.

### Product vs harness

Product code **intentionally** starts ingredient claims on the bar step:

```437:440:src/stores/drinkLogWizard.ts
    if (prefill?.source === 'ingredient') {
      step.value = 'bar'
      return
    }
```

Ingredient is available at multiple bars (“Available at 8 bars”). The player must pick a bar. Cocktail is different (bar+offering query → friends).

QA-2A `advanceLogWizardToReview` treated `from=ingredient` like cocktail and **never clicked a bar**.

### Classification

**Confirmed test harness defect** (primary).

Secondary guest UX note (not a new E2B id): landing on a full bar list after “Claim It” without stronger guidance can feel broken on large catalogs — mirrors automation confusion.

### After harness-only fix

| Cohort | Runs | Pass | Fail | Notes |
|---|---:|---:|---:|---|
| Before fix — Demo Both | 5 | 0 | 5 | stuck on bar |
| After fix — Demo Both | 3 then 2 | 2+2 | 1 then 0 | iter-2 flake was bar-list not ready; fixed with wait |
| Fresh roster names (June/Dan/…) | 5+2 | 0 | all | login wait timeout — password/env for non-Demo identities (**environmental**, not product) |
| Drink It suite re-run | 1 | DI-004 **passed** | — | `evidence/drinkit-after-harness.txt` |

### DB note after “PASS”

Several successful gallery landings still showed `claimed_categories: []` and review `data-state=unavailable` when the player had **already claimed** that category earlier in the disposable day, or when drink eligibility did not attach. Wizard completion ≠ bounty points. Unlisted+affirm path added to improve eligibility when still claimable.

---

## E2E-012 — Bar Bounty flakiness

### Root cause

Harness selected Bar via:

```js
.locator('.bounty-card').filter({ hasText: /Bar/i })
```

Ingredient card body contains **“Available at 8 bars”** → `/Bar/i` matches → click opened **`from=ingredient`**, not `from=bar`.

Evidence (before fix): every “Bar” iteration logged `log_url=.../log?from=ingredient`.

That explains intermittent QA-2A behavior: when Ingredient claim was disabled/claimed, `/Bar/i` could hit the real Bar card and pass; when Ingredient was claimable, Bar “failed” with the ingredient stall.

### After fix

Target `[data-testid="bounty-card-bar"]` only.

| Cohort | Runs | Pass | Fail |
|---|---:|---:|---:|
| Before fix — Demo Both | 5 | 0 | 5 (wrong deep link) |
| After fix — Demo Both | 3+2 | **5** | 0 |
| Crew pairs Josh/Katie etc. | 2+2 | 0 | login environmental |
| Drink It suite re-run | 1 | DI-005 **passed** | — |

### Classification

**Confirmed test harness defect** (element targeting).

Not primarily: crew assignment timing, server validation, or network delay — those were masked by the wrong card click.

Bar claim URL when correct: `from=bar&bar=sea-view-bar` (prefill → drink step).

---

## Harness corrections (application untouched)

1. `advanceLogWizardToReview` — ingredient **must** pick a bar; cocktail/bar wait for prefill skip.
2. Ingredient drink path — Not Listed → cocktail type → ingredient Yes → Continue when claiming ingredient.
3. Drink It suite — `bounty-card-ingredient` / `bounty-card-bar` testids.
4. QA-2B `clickBountyClaim` — same stable card targeting.

Before/after consoles: `evidence/flake-run-console.txt`, `evidence/flake-rerun-after-harness.txt`, `evidence/flake-scoring-rerun.txt`.

## Final labels

| Finding | Class |
|---|---|
| E2E-011 | **2. Confirmed test harness defect** |
| E2E-012 | **2. Confirmed test harness defect** |
| Roster-login uncaught timeouts | **3. Environmental instability** (Demo\* passwords only in this env file) |
| Post-fix DI-004/005 | **Passed** under corrected harness |
