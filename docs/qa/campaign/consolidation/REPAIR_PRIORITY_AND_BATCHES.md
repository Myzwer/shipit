# Repair Priority & Batches

## Priority principles

Reassessed for **seven-day cruise without developer intervention**:

1. Anything that loses submissions, duplicates scores, or breaks voyage automation  
2. Anything that blocks essential Admin ops (catalog, roster, clock, void/skip)  
3. Anything that makes core media/gallery unusable on ship Wi-Fi  
4. Achievement/Wrapped correctness at finale  
5. Polish, diagnostics, menu-agent hardening  

Do **not** speculative-refactor. Prefer minimal, test-backed fixes.

---

## Must repair before cruise

| Order | Group | Why |
|---|---|---|
| 1 | REP-SUB-001 | Duplicate accepted logs / score integrity |
| 2 | REP-MEDIA-001 | Upload cancel/orphan/empty-blob — submission reliability |
| 3 | REP-SIGNED-001 | Gallery/Wrapped photos die after ~1h |
| 4 | REP-CAT-LOCK-001 | Catalog activation UI lock |
| 5 | REP-SCHED-001 | First production bounty schedule |
| 6 | REP-ADM-ERR-001 | False-failed Auth/skip/void under ship network |
| 7 | REP-ADM-LOCK-001 | Admin self-lockout / clock brick |
| 8 | REP-WRP-RANK-001 | Fix ranks before organizer `11100` |
| 9 | REP-ACH-MAP-001 | Incomplete production achievement enablement |
| 10 | REP-ACH-FROZEN-001 | Unearnable or wrongly visible frozen achievements |

## Should repair if practical

| Group | Why |
|---|---|
| REP-CAT-PUB-001 | Publish pending ignore / double-tap |
| REP-ADM-SESS-001 | Sign-out leaves admin locks |
| REP-CAT-MO-001 | Menu-agent / MO publish safety |
| REP-CAT-VAL-001 | Stage validation |
| REP-WRP-MO-001 | Wrapped venue accuracy (pair with R6) |
| REP-CRW-001 | Accidental crew lock |
| REP-CLK-001 | Accidental finale latch |
| REP-CLAIM-001 | Triage bounty success vs points |
| REP-ACH-EMPTY-001 | Empty/missing eligible sets |
| REP-ACH-GAUNT-001 | Wrong-bar investigation (MO leak not live) |

## Optional / decide

| Group | Why |
|---|---|
| REP-PREVIEW-001 | Product decision on reason priority |
| REP-MIME-001 | Rare GIF empty-MIME |
| REP-CAT-ERR-001 | Structured Admin errors |
| REP-AUTH-001 | JWT residual after signOut |

---

## Batch definitions

### R1 — Submission integrity (P0)

| Field | Value |
|---|---|
| **Scope** | REP-SUB-001 (E2B-001, REL-001, REL-002, E2E-032) |
| **Dependencies** | None |
| **Worktree** | Main `visual/drinkit-home-v1` |
| **Likely files** | Drink submit store/views, `DailyClaimView`, `ScavengerSubmitView`, related composables |
| **Must pass** | `tests/unit/qa2-reliability/submitGuards.contract.spec.ts`; QA-2B E2B-S03 + E2B-S07; scavenger/daily double-tap E2E |
| **Conflicts** | Overlaps R2 (submit/photo views) — **serialize before R2** |
| **Done when** | Nav-away cannot create two accepted drink logs; in-flight guards present; contracts green |

### R2 — Media pipeline (P1)

| Field | Value |
|---|---|
| **Scope** | REP-MEDIA-001 (+ RISK-B Daily discard check) |
| **Dependencies** | Prefer after R1 |
| **Worktree** | Main |
| **Likely files** | `PhotoCapture`, `stagePhoto`, scavenger/drink reset/discard paths |
| **Must pass** | `stagePhoto.network`, `PhotoCapture.restore`, `submitGuards` abandon expects; E2E-ME-009; E2B-M10 |
| **Conflicts** | R1 |
| **Done when** | Discard abandons Storage/ledger; abort cancels PUT; empty-blob retry refused |

### R3 — Signed URL refresh (P1)

| Field | Value |
|---|---|
| **Scope** | REP-SIGNED-001 |
| **Dependencies** | None |
| **Worktree** | Main (or parallel worktree branched from main) |
| **Likely files** | `GalleryPostCard`, `WrappedPhotoCard`, shared signed-URL helper |
| **Must pass** | `gallerySignedUrl.contract.spec.ts`; WRP-002 contract; E2B-L03 |
| **Conflicts** | Low — avoid editing same files as R2 PhotoCapture |
| **Done when** | `@error` and/or refresh renews URL on Gallery + Wrapped |

### R4 — Admin classification & lockout (P1)

| Field | Value |
|---|---|
| **Scope** | REP-ADM-ERR-001, REP-ADM-LOCK-001, REP-ADM-SESS-001, REP-CAT-LOCK-001 |
| **Dependencies** | Integrate Agent 2 qa3a tests first |
| **Worktree** | Prefer **secondary** branch from main after test integration (keeps Admin ownership clear) |
| **Likely files** | `adminRoster.ts`, void/skip helpers, `ShipClockSection.vue`, router, catalog import pending, session signOut |
| **Must pass** | All failing `tests/unit/qa3a-admin-catalog/*` for those IDs; INT-CAT-001L / INT-ADM-001L/002L/007L probes |
| **Conflicts** | R5 shares catalog pending/publish — finish CAT-LOCK inside R4 before R5 publish/schedule |
| **Done when** | Pending classification correct; `/admin` reachable with zero games; clock catch present; catalog preview failure recoverable |

### R5 — Schedule bootstrap & catalog publish hardening (P0/P1)

| Field | Value |
|---|---|
| **Scope** | REP-SCHED-001, REP-CAT-PUB-001, optionally REP-CAT-MO-001 / REP-CAT-VAL-001 |
| **Dependencies** | R4 catalog pending fixed |
| **Worktree** | Same as R4 (Admin/catalog ownership) |
| **Likely files** | New/prod schedule RPC + Admin UI; `runPublish` pending guard; catalog validators/apply |
| **Must pass** | Import → first schedule without `dev_*` on prod label; ADM-009 contract; CAT-002/INT-CAT-006 if in scope |
| **Conflicts** | Menu-agent later phase — keep validators compatible |
| **Done when** | Documented autonomous path exists for first schedule; publish cannot mint over pending |

### R6 — Wrapped SQL ranks + MO venue (P1/P2)

| Field | Value |
|---|---|
| **Scope** | REP-WRP-RANK-001, REP-WRP-MO-001 |
| **Dependencies** | None (SQL). Organizer apply of 11100 **after** this fix |
| **Worktree** | Main or parallel — **SQL-only** ownership |
| **Likely files** | Migration amending `wrapped_drinkit_leaderboard` / rank CTE |
| **Must pass** | QA-4A wrapped probe DI-P03; Achievements LB counts still present; DI-P15/C08 exclude MO |
| **Conflicts** | None with Vue batches if migration-only |
| **Done when** | Ranks correct with achievements metadata; MO excluded from venue metrics |

### R7 — Achievements content & release map (P1)

| Field | Value |
|---|---|
| **Scope** | REP-ACH-MAP-001, REP-ACH-FROZEN-001, REP-ACH-EMPTY-001; investigate REP-ACH-GAUNT-001 |
| **Dependencies** | None for map/tags; gauntlet needs disposable repro |
| **Worktree** | Parallel OK (content/JSON ownership) |
| **Likely files** | `productionReleaseMapping.json`, launch catalog tags, optionally SQL only if gauntlet proven |
| **Must pass** | `achievementDefinitionAudit.spec.ts`; INT-ACH-001/003 probes; INT-ACH-09 remains green |
| **Conflicts** | Avoid touching Wrapped SQL owned by R6 |
| **Done when** | Map covers FINAL set; frozen either tagged or explicitly gated; empty defs gated |

### R8 — Polish & triage (P2/P3)

| Field | Value |
|---|---|
| **Scope** | REP-CLAIM-001, REP-CRW-001, REP-CLK-001, REP-PREVIEW-001, REP-MIME-001, REP-CAT-ERR-001, REP-AUTH-001 |
| **Dependencies** | After Must batches; product decisions for PREVIEW |
| **Worktree** | Main residual |
| **Must pass** | Per-group listed tests |
| **Conflicts** | Low |
| **Done when** | Accepted as fixed or explicitly deferred with owner note |

---

## Recommended execution order

```
Integrate Agent 2 diagnostic tests (see WORKTREE_INTEGRATION_PLAN.md)
        │
        ├─► R1 → R2          (main; player submit/media)
        ├─► R3               (parallel OK)
        ├─► R4 → R5          (admin/catalog worktree)
        ├─► R6               (parallel OK; SQL)
        └─► R7               (parallel OK; content)
                │
                └─► R8 polish + device acceptance + launch checklist
```

## What not to do in repair campaign

- Weaken failing diagnostic assertions to go green  
- Apply `11100` to organizer before R6  
- Merge speculative architecture refactors  
- Treat ACH-002 MO leak as confirmed  
- Mark physical-device gaps complete because Chromium passed  
