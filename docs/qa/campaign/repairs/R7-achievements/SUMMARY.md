# R7 — Achievements repair summary

**Branch:** `repair/r7-achievements`  
**Baseline:** `cae8cfe` (R1–R5 integration checkpoint)  
**Worktree:** `Ship-It-qa2-reliability` (Agent 2 disposable `:56321` only)  
**Preserved:** `repair/r3-signed-urls` @ `2a617bc`

## Verdict

| Defect / group | Outcome |
|---|---|
| **ACH-003 / REP-ACH-MAP-001** | **Repaired** — production release map covers all **174** FINAL keys; obsolete keys removed |
| **ACH-001 / REP-ACH-FROZEN-001** | **Partially repaired** — `frozen` tag added for menu-evidenced Frozen Aperol Spritz; tropical collections **verification-gated** pending organizer list |
| **ACH-002 / REP-ACH-GAUNT-001** | **Allegation narrowed** — awarding already location-bound in `11000`; **UI covered_count** aligned in **`11400`**; live MO / wrong-bar probes **PASS** |
| **REP-ACH-EMPTY-001** | **Partially repaired** — launch-catalog ingredient key/tag aliases wired for previously missing exact-match / spirit-dark deps; Good Spirits remain gated |

## Release map counts

| Metric | Before | After |
|---|---:|---:|
| Map rows | 140 | **174** |
| `release_enabled` | 129 | **164** |
| Blocked organizer | 3 (incl. obsolete d083) | **2** (d082, d085) |
| Blocked metadata | 8 | **8** (d086–d093) |
| Missing FINAL keys | 37 | **0** |
| Obsolete map keys | 3 | **0** |

## Application / content files modified

- `content/achievements/productionReleaseMapping.json`
- `content/achievements/frozenCollections.json`
- `content/achievements/workingCatalog.json` + `.ts`
- `content/catalogs/launch-candidate-v1.json`
- `content/catalogs/development-preview-v1.json`
- `tests/unit/qa3b-achievements-wrapped/gauntletLocationContract.spec.ts`
- `supabase/migrations/20261105011400_r7_gauntlet_covered_count_location.sql` (**11300 reserved for R6**)

## Tests (this worktree)

| Suite | Result |
|---|---|
| `achievementDefinitionAudit.spec.ts` (ACH-001/003) | **PASS** |
| `gauntletLocationContract.spec.ts` (ACH-002) | **PASS** |
| Other `tests/unit/qa3b-achievements-wrapped` (excl. WRP-001 env) | PASS (WRP-001 remains R6 / organizer apply) |
| Related achievement unit specs | **28/28 PASS** |
| `vue-tsc` typecheck | **PASS** |
| `npm run build` | **PASS** |
| QA-4A `probe/achievements.mjs` on `:56321` | Map **PASS**; ACH-002 family **PASS**; ACH-001 live empty-universe on **schedule fixture** catalog (see FROZEN / REMAINING_RISKS); INT-ACH-01 strict extra `d076` on day-1 clock |

## Not done / out of scope

- No Wrapped ranking / migration `11100` / `11300` changes (R6)
- No organizer `:54321` or Agent 1 `:55321` mutation
- No push / merge
- No fabricated frozen-tropical menu items
- Combined R6+R7 migration testing deferred to post-integration

## Organizer decisions still required

1. Confirm which verified catalog drinks are **both frozen and tropical** for License to Chill / Frozen Concoctions (currently gated; only Frozen Aperol Spritz is objectively frozen and it is **not** tropical).
2. Republish **launch-candidate-v1** (with new `frozen` / `spirit-dark` tags) as the active cruise catalog after schedule-fixture work — qa2 active pointer was on `dev-fixture-schedule-ready-v1` during probes.
3. Existing companion UUID map (d086–d093) and organizer blockers (d082/d085) unchanged.
