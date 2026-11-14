# QA-1 defects

Do **not** repair application code in this assignment. Harness-only issues that manufactured false fails are listed under “Resolved harness issues” and are not product defects.

---

## DEF-QA1-001

| Field | Value |
|---|---|
| **ID** | DEF-QA1-001 |
| **Feature** | Drink It! preview — Bar category reason when logging featured Cocktail |
| **Severity** | **P3** |
| **Expected** | When `bar_eligible_companion_ids` is empty, `preview.categories.bar` is `unavailable` with a companion/crew reason (`solo_or_no_crewmate_selected`, `bar_eligible_companion_required`, `crew_unavailable`, or `not_in_todays_roster`), while Cocktail remains `eligible` (presence companions still count for Cocktail). |
| **Observed** | Cocktail `eligible` as expected; Bar `unavailable` with reason **`not_featured_bar`** because the Cocktail designated bar ≠ today’s featured Bar Bounty bar. Companion-empty reason is not surfaced. |
| **Minimal repro** | Disposable active Day1 noon → `dev_get_current_cocktail_bounty_at` → preview named cocktail at designated bar with companions `[both]` and `bar_eligible_companion_ids: []` → assert `bar.reason`. |
| **Test case** | `tests/integration/scoring.phase3a1.closeout.test.ts` → `ineligible Bar companions still count for Cocktail presence` |
| **Evidence** | `docs/qa/campaign/qa1-results/scoring-closeout-rerun.log`, `batch-g-shipit-void.log`, `batch-f-drinkit-scoring.log` |
| **Likely root cause** | Eligibility short-circuits on featured-bar check before companion/crew evaluation. May be intentional priority; contract test is stricter than server reason ordering. |
| **Blocks further testing?** | No |

---

## Resolved harness issues (not product defects)

### HARNESS-QA1-MO-001

- **Symptom:** Mobile Order solo log + activity-day MO helper asserted `ok:true` but received `ok:false`.
- **Cause:** Tests submitted a **Lido** `offering_id` with `bar_canonical_key=mobile-order` → server `OFFERING_NOT_AT_BAR` (correct).
- **Fix:** Use offerings from `list_drinkit_mobile_order_drinks`. Diag: `QA1_MO_DIAG` in `qa1-results/mo-diag3b.log` shows Lido reject vs MO-list accept.
- **Suites after fix:** 11/11 pass (`batch-d-fixed.log`).

### HARNESS-QA1-DISPOSE-001

- **Symptom:** Bar crew B2/B4 afterEach threw `submissions_author_player_id_fkey` when deleting filler players who had authored submissions.
- **Cause:** `disposePlayers` omitted `submissions` cleanup.
- **Fix:** Delete `submissions` by `author_player_id` before `players` delete.
- **Suites after fix:** B2+B4 13/13 pass (`batch-f-b2b4-fixed.log`). Earlier clean run also had B1+B2 green (`batch-b-drinkit.log`).
