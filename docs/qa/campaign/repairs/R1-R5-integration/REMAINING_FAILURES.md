# R1–R5 Integration — Remaining Failures

Rule: do **not** skip, delete, or weaken these to green the suite. They are assigned to later repair batches.

## Expected red (product) — preserve for R6 / R7 / R8

| ID | Suite / assertion | Batch | Notes |
|---|---|---|---|
| WRP-001 | `wrappedMetricsAndCarousel.spec.ts` — achievements LB fields / `11100` contract | **R6** | **Repaired (R6)** — see `docs/qa/campaign/repairs/R6-wrapped-ranking/` |
| ACH-001 | Launch catalog frozen(+tropical) tags | **R7** | Catalog content |
| ACH-002 | Gauntlet `bar_id` + exclude virtual | **R7** | Collection SQL contract |
| ACH-003 | `productionReleaseMapping` 174 keys | **R7** | Mapping still summarizes 140 |
| REL-006 | `processImage.qa2.spec.ts` empty MIME + `.gif` | **R8** | Still accepts → JPEG; expected red |
| DEF-QA1-001 | Bar preview reason | pre-existing | Not in R1–R5 scope |
| E2B-002 | Claim-race stress | REP-CLAIM-001 | Separate from signed URLs |
| CAT-002 polish / QA-4A live probes | Admin probes on `:56321` | deferred | `:56321` protected this assignment |

Post-R3 QA-3B scoreboard: **4 failed / 27 passed / 31 total** (WRP-002 now green).

Post-R3 QA-2 reliability: **1 failed / 85 passed / 86 total** (REL-006 only).

## Harness / environment (not product regressions)

| Item | Classification | Resolution |
|---|---|---|
| `DailyClaimScroll.spec.ts` missing `abandonPhotoUpload` mock | R2 harness lag exposed during legacy sweep | **Fixed** in this checkpoint (mock only) |
| R1 integration red immediately after R5 | Environment — cruise day1 left at `2099-01-03` | Restored `2026-11-14` on `:55321`; R1 re-pass |
| `.local/qa2a-disposable.env` unquoted path with spaces | Shell `source` break | Load via quoted export helper for disposable runs |
| Original `repro-r3-signed-url.mjs` targets `:56321` | Safety | Not re-run; equivalent real-expiry proof on `:55321` |

## Explicit non-claims / deferred coverage

- No automated ≥1 hour Gallery soak (R3 remaining risk; 60s floor used).
- Full Playwright QA-2A/2B browser matrix not re-driven end-to-end in this checkpoint.
- Full independent seven-day voyage rehearsal deferred.
- Migration `11100` ranking not repaired or activated beyond existing file presence.
- Organizer database not migrated.

## Unexpected regressions from R3 import

**None.** All new greens are R3-intended; remaining reds match pre-existing R6/R7/R8 / MIME / claim-race inventory.
