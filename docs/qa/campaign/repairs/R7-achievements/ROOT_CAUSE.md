# R7 — Root causes

## ACH-003 / REP-ACH-MAP-001 — Stale production release map

**Cause:** `productionReleaseMapping.json` was frozen at the interim **140**-row working catalog. FINAL packs (Bar Gauntlets, Drinking with Davids, frozen collections, D-094/095/096) were composed into the **174** active set but never added to the activation map. Three retired keys (`d032`, `d035`, `d083`) remained.

**Repair:** Regenerated map from `composeWorkingAchievements()` active rows. Preserved blocked_organizer (d082/d085) and blocked_metadata (d086–d093). Dropped obsolete keys.

## ACH-001 / REP-ACH-FROZEN-001 — Missing frozen classification + empty tropical set

**Cause:** Engine correctly requires `drink_tag: 'frozen'` (+ tropical ingredient/concept evidence when `require_tropical`). Launch JSON published **zero** `frozen` tags. Menu source names exactly one frozen cocktail: **Frozen Aperol Spritz** (Aperol/Prosecco/orange — **not tropical**). No menu line identifies a frozen tropical set. Definitions were enabled without `verification_required`, so they appeared earnable while resolving to `target=0`.

**Repair:**

1. Tag `frozen-aperol-spritz` with approved `frozen` drink classification (name + beverage source evidence) → unblocks D-033 *Stuck in Colder Weather*.
2. Set `verification_required: true` on License to Chill / Frozen Concoctions so empty tropical universes stay explicitly gated.
3. **Do not** invent tropical-frozen offerings. Organizer must supply the eligible set.

## ACH-002 / REP-ACH-GAUNT-001 — Stale static contract vs live SQL

**Cause (QA-3B):** Static test inspected migrations `08600` / `09200`, which matched collections by `offering_id` only.

**Cause (actual production path):** Migration **`11000`** already rewrote `achievement_log_counts_for_collection` to require `d.bar_id = bo.bar_id` and `bars.is_virtual is false`. Awarding uses `covered_ids` → that helper. QA-4A INT-ACH-09 did **not** reproduce MO gauntlet progress.

**Remaining gap:** `achievement_collection_covered_count` (`09200`) still lacked location guards, so **live progress UI** could disagree with awards for MO logs.

**Repair:** Migration **`11400`** aligns `covered_count` with `11000` guards. Contract test now asserts authoritative `11000` + `11400`. Live probes: physical complete PASS; MO excluded PASS; wrong-bar PASS.

**Disproven:** “MO always advances gauntlets via offering_id-only match” on a DB with `11000` applied.

## REP-ACH-EMPTY-001 — Catalog key / tag vocabulary drift

**Cause:** Several FINAL exact_match / tag_match defs used idealized keys (`pineapple`, `amaretto`, `spirit-dark`, …) while launch-candidate uses mapped keys/tags (`pineapple-flavor`, `amaretto-disaronno`, `rum-style-dark`, `tanqueray-gin` for the sole olive-oil-washed Lilypad line).

**Repair:** Added evidence-based alternates / `spirit-dark` on dark-rum ingredients. No new menu items invented.
