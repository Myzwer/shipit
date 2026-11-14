# DEFECTS — QA-3B Agent 2 (Achievements & Cruise Wrapped)

Defect IDs are stable `ACH-*` / `WRP-*`. No application fixes applied.  
Related prior IDs are linked; underlying problems are not double-counted as new product bugs.

---

## ACH-001 — P1 — License to Chill / Frozen Concoctions unreachable (no `frozen` tags)

- **Feature:** Drink It! frozen tropical collections
- **Expected (FINAL §3.4):** Eligible frozen tropical named cocktails are concrete and reachable from the verified catalog. `License to Chill` = full eligible set; `Frozen Concoctions` = 3 distinct.
- **Observed:** `launch-candidate-v1.json` publishes **zero** drink/offering `frozen` classification tags. Engine conditions require `drink_tag: 'frozen'` (+ `require_tropical: true`). Empty universe is gated (`target=0` / `verification_pending`) so it does not auto-award — but the achievements cannot be earned.
- **Repro:** Inspect launch candidate tags → compose defs `working-drinkit-license-to-chill` / `working-drinkit-frozen-concoctions` → note `frozen-aperol-spritz` is name-only (no tag; ingredients are non-tropical).
- **Evidence:** `achievementDefinitionAudit.spec.ts` (ACH-001 fail); `ACHIEVEMENT_DEFINITION_MATRIX.json` flags `REQUIRES_FROZEN_DRINK_TAG`.
- **Class:** Product + launch classification gap (AMBIGUITIES #9).
- **Related:** Not a duplicate of CAT-*; catalog JSON can stage without frozen drink tags.

---

## ACH-002 — P1 — Bar Gauntlet coverage ignores log location / virtual bars

- **Feature:** Bar Gauntlets / `offering_collection` progress
- **Expected (FINAL §3.4):** Personal gauntlet logs must be recorded **at that bar**; Mobile Order / virtual bars excluded from physical-bar collections.
- **Observed:** `achievement_log_counts_for_collection` and `achievement_collection_covered_count` match by `offering_id` only — no `drink_logs.bar_id = bar_offerings.bar_id`, no `is_virtual` filter. Mobile Order eval patch excludes virtual bars for some distinct/grouped bar subjects but **does not** wrap `offering_collection`.
- **Repro:** Read migrations `08600` / `09200` / `10900`; unit contract expects bar_id + is_virtual guards.
- **Evidence:** `gauntletLocationContract.spec.ts` (ACH-002 fail).
- **Class:** Confirmed product contract failure (integration proof still needed for a live mismatched log).
- **Related:** Campaign AMBIGUITIES watch-list (Mobile Order vs Bar Gauntlets).

---

## ACH-003 — P1 — productionReleaseMapping stale vs FINAL 174

- **Feature:** Production achievement activation path
- **Expected:** Release mapping enumerates all 174 FINAL stable keys (or explicitly marks gated rows).
- **Observed:** `content/achievements/productionReleaseMapping.json` still summarizes interim **140** rows (`release_enabled: 129`). **37** FINAL active keys absent (all Bar Gauntlets, Davids pack, frozen collections, D-094/095/096, …). Three obsolete keys remain in the map.
- **Repro:** Diff composed active keys vs `productionReleaseMapping.rows`.
- **Evidence:** `achievementDefinitionAudit.spec.ts` (ACH-003 fail); matrix `ABSENT_FROM_PRODUCTION_RELEASE_MAPPING`.
- **Class:** Missing launch configuration / stale activation artifact — cruise enablement via `load-production-achievements` would miss FINAL rows.

---

## WRP-001 — P1 — Wrapped Achievements leaderboard blocked until migration `11100`

- **Feature:** Drink It! Wrapped leaderboard → Achievements toggle (Plan C)
- **Expected:** Leaderboard rows include per-player `achievements` so Achievements mode ranks with `count/126`.
- **Observed:** Migration `20261105011100_plan_c_wrapped_leaderboard_achievements.sql` exists in git but is **not applied** to organizer `:54321` or Agent 1 disposable `:55321`. Client correctly hides Achievements mode when `hasAchievementCounts` is false.
- **Repro:** Call `wrapped_drinkit_leaderboard` without 11100 → no `achievements` field → UI omits toggle.
- **Evidence:** `wrappedMetricsAndCarousel.spec.ts` (WRP-001 fail); baseline campaign notes.
- **Class:** Missing launch / DB activation (not a client logic bug). Required disposable proof after apply listed in `BLOCKED_INTEGRATION_TESTS.md`.

---

## WRP-002 — P1 — Wrapped photo cards inherit signed-URL expiry (links REL-008)

- **Feature:** Wrapped featured Polaroid / photo slides
- **Expected:** Refresh before ~3600s expiry and/or `@error` → re-fetch signed URL.
- **Observed:** `WrappedPhotoCard.vue` loads once via `fetchGalleryPhotoSignedUrl` on mount / photo_id change; no `@error` reload, no refresh timer. Gallery API still defaults `expires_in ?? 3600`.
- **Repro:** Open Wrapped photo slide → leave tab >1h → broken image until remount.
- **Evidence:** `awardingAndCrossSystem.contract.spec.ts` (WRP-002 fail).
- **Related:** **REL-008** (GalleryPostCard). Same defect class; tracked here for Wrapped surface coverage — do not fix twice.

---

## Suspected / not independently confirmed as new IDs

| Topic | Notes |
|---|---|
| Companion alias private map | Social/Davids awards fail to load if `private/roster/companion-alias-map.local.json` unresolved (`load-working-achievements` skips). Launch config. |
| Good Spirits gauntlets | Correctly verification-gated with `eligible_count: 0` — not a defect; blocked until price evidence. |
| Banana ingredient alts | `any()` lists keys absent from launch catalog; `banana-flavor` exists → still reachable. |
| Margarita Davids | 7 drinks carry `margarita` tags — reachable if publish persists concept tags. |
| Achievement silent failure | Finalize is in-submit path; no swallow found in finalize itself — needs disposable adversarial proof. |

---

## Severity tally (confirmed this assignment)

| Severity | IDs |
|---|---|
| P0 | — |
| P1 | ACH-001, ACH-002, ACH-003, WRP-001, WRP-002 |
| P2 | — |
| P3 | — |
