# Repair Execution Matrix (Authoritative)

Post-integration baseline on `visual/drinkit-home-v1`. Application repairs have **not** started.

## Batch ownership

| Batch | Theme | REP-* groups | Owner worktree | Parallel-safe with |
|---|---|---|---|---|
| **R1** | Submission integrity | REP-SUB-001 | Main | R3, R6, R7 (not R2) |
| **R2** | Media pipeline | REP-MEDIA-001 (+ RISK-B check) | Main after R1 | R3, R6, R7 |
| **R3** | Signed URL refresh | REP-SIGNED-001 | Main or parallel from main | R1/R2 if files disjoint; R4; R6; R7 |
| **R4** | Admin classification & lockout | REP-ADM-ERR-001, REP-ADM-LOCK-001, REP-ADM-SESS-001, REP-CAT-LOCK-001 | Prefer **new** repair worktree from integrated main | R3, R6, R7 (not R5) |
| **R5** | Schedule + catalog publish | REP-SCHED-001, REP-CAT-PUB-001 (+ optional CAT-MO/VAL) | Same as R4 after CAT-LOCK | R3, R6, R7 |
| **R6** | Wrapped SQL ranks + MO venue | REP-WRP-RANK-001, REP-WRP-MO-001 | Main or parallel — **SQL-only** | R1–R5 Vue; R7 content |
| **R7** | Achievements content / release map | REP-ACH-MAP-001, REP-ACH-FROZEN-001, REP-ACH-EMPTY-001; investigate REP-ACH-GAUNT-001 | Parallel OK (JSON/content) | R6 if no shared SQL |
| **R8** | Polish & triage | REP-CLAIM-001, REP-CRW-001, REP-CLK-001, REP-PREVIEW-001, REP-MIME-001, REP-CAT-ERR-001, REP-AUTH-001 | Main residual | After must batches |

## Detailed matrix

### R1 — Submission integrity (P0)

| Field | Value |
|---|---|
| **Original IDs** | E2B-001, REL-001, REL-002, E2E-032 |
| **Likely sources** | Drink submit store/views, `DailyClaimView`, `ScavengerSubmitView`, related composables |
| **Failing tests** | `tests/unit/qa2-reliability/submitGuards.contract.spec.ts` (in-flight); QA-2B E2B-S03/S07 |
| **Dependencies** | None |
| **Regression** | submitGuards green; E2B-S07 cannot create two accepted logs |
| **Shared risk** | Overlaps R2 photo/submit views — **serialize R1→R2** |

### R2 — Media pipeline (P1)

| Field | Value |
|---|---|
| **Original IDs** | REL-003, REL-004, REL-005, REL-007, E2E-031, RISK-B |
| **Likely sources** | `PhotoCapture`, `stagePhoto`, scavenger/drink reset/discard |
| **Failing tests** | `stagePhoto.network.spec.ts`, `PhotoCapture.restore.spec.ts`, submitGuards abandon expects |
| **Dependencies** | Prefer after R1 |
| **Regression** | E2E-ME-009; E2B-M10 |

### R3 — Signed URL refresh (P1)

| Field | Value |
|---|---|
| **Original IDs** | REL-008, E2E-030, E2B-L03, WRP-002 |
| **Likely sources** | `GalleryPostCard`, `WrappedPhotoCard`, shared signed-URL helper |
| **Failing tests** | `gallerySignedUrl.contract.spec.ts`; WRP-002 in `awardingAndCrossSystem.contract.spec.ts` |
| **Dependencies** | None |
| **Parallel** | OK vs Admin (R4) and SQL (R6) if file ownership held |

### R4 — Admin classification & lockout (P1 / includes P0 CAT-LOCK)

| Field | Value |
|---|---|
| **Original IDs** | ADM-001…008, CAT-001, INT-CAT-001L, INT-ADM-001L/002L/007L |
| **Likely sources** | `adminRoster.ts`, void/skip helpers, `ShipClockSection.vue`, router, catalog import pending, session signOut |
| **Failing tests** | `tests/unit/qa3a-admin-catalog/*` listed in KNOWN_FAILURE_MANIFEST; live probes on `:56321` |
| **Dependencies** | Diagnostics integrated (this commit) |
| **Shared risk** | Catalog pending state shared with R5 — **finish CAT-LOCK before R5** |
| **Supabase** | No migration required for lock/error classification; do not touch organizer |

### R5 — Schedule bootstrap & catalog publish (P0/P1)

| Field | Value |
|---|---|
| **Original IDs** | INT-SCHED-001, RISK-CAT-D, QA3A-B012, ADM-009 (+ optional CAT-002/VAL) |
| **Likely sources** | New/prod schedule RPC + Admin UI; `runPublish` pending guard; catalog validators |
| **Failing tests / probes** | INT-SCHED-001 in `probe/admin-catalog.mjs`; ADM-009 contract |
| **Dependencies** | R4 catalog pending fixed |
| **Shared Supabase** | May add admin-gated RPC / migration — **coordinate with R6**; never apply to organizer until reviewed |
| **Parallel** | Not with R4 |

### R6 — Wrapped SQL (P1)

| Field | Value |
|---|---|
| **Original IDs** | INT-WRP-002, WRP-001 (migration), INT MO venue |
| **Likely sources** | Migration amending `wrapped_drinkit_leaderboard` / rank CTE |
| **Failing tests / probes** | `probe/wrapped-aggregation.mjs` DI-P03; venue exclusion DI-P15/C08 |
| **Dependencies** | None for coding; organizer `11100` **after** rank fix |
| **Shared Supabase** | Migration-owned — **do not parallel another migration author**; Vue batches OK |

### R7 — Achievements content (P1)

| Field | Value |
|---|---|
| **Original IDs** | ACH-001, ACH-003, empty sets; ACH-002 investigate |
| **Likely sources** | `productionReleaseMapping.json`, launch catalog tags |
| **Failing tests** | `achievementDefinitionAudit.spec.ts`; INT-ACH-001/003 probes |
| **Dependencies** | None for map/tags |
| **Parallel** | OK vs R6 if R7 stays out of Wrapped SQL |

### R8 — Polish (P2/P3)

Per-group tests in `REPAIR_PRIORITY_AND_BATCHES.md`. Product decision required for REP-PREVIEW-001.

## Independence rules (do not assume Vue-file distance = safe)

| Pair | Safe? | Why |
|---|---|---|
| R1 ∥ R2 | **No** | Shared submit/photo Vue + pending state |
| R4 ∥ R5 | **No** | Catalog pending → publish/schedule |
| R3 ∥ R4 | Yes | Gallery/Wrapped vs Admin libs |
| R6 ∥ R7 | Yes | SQL vs content JSON |
| R1 ∥ R4 | Yes if no shared session/pending utilities |
| R5 ∥ R6 | **Caution** | Both may touch Supabase migrations/RPCs — serialize schema ownership |

## Clean baseline for a second repair worktree

1. Keep existing Agent 2 archive worktree `Ship-It-qa2-reliability` @ `f4c1dce` **read-only** (do not reset/remove yet).
2. After this integration commit lands on `visual/drinkit-home-v1`, create a **new** worktree from that commit, e.g.:
   - `git worktree add ../Ship-It-repair-admin visual/drinkit-home-v1`
   - Branch: `repair/admin-catalog-r4` (or similar)
3. Point Admin/catalog mutating work at `:56321` (qa2) or a fresh disposable — **not** organizer `:54321` or Agent 1 `:55321` unless explicitly handed off.
4. Main continues R1→R2 (and optionally R3/R6/R7).

## Recommended first repair assignment

**R1 — REP-SUB-001** on main: fix navigate-away / double-submit accepted duplicates; prove with `submitGuards.contract.spec.ts` + disposable E2B-S07. Highest cruise fairness risk; unblocks clean R2 media work on the same surfaces.
