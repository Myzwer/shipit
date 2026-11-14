# Master Defect Register — Consolidated Repair Groups

Stable IDs use prefix `REP-*`. Original campaign IDs are listed under **Associated IDs**.  
Severity reassessed for seven-day cruise autonomy (not copied blindly from campaign labels).

Cruise class:

- **Must** — repair before cruise  
- **Should** — repair if practical before cruise  
- **Optional** — cosmetic / low impact / decide later  

Confidence: `high` | `medium` | `low` based on evidence strength.

---

## REP-SUB-001 — Duplicate / ambiguous drink & claim submits

| Field | Value |
|---|---|
| **Associated IDs** | E2B-001, REL-001, REL-002, E2E-032 |
| **Severity** | **P0** (elevated from P1) |
| **Cruise class** | Must |
| **Features** | Drink It! log submit; Daily claim; Ship It scavenger submit |
| **Expected** | At most one accepted submission per intentional guest action; in-flight re-entry returns early (`BUSY`); navigate-away cancels or idempotently coalesces |
| **Observed** | E2B-S07: Submit then immediate Home nav → `newSubs=2` both `accepted`. Scavenger/Daily lack in-function in-flight guards (UI disable only). |
| **Evidence** | `qa2b-browser-stress/DEFECTS.md` E2B-001; `TEST_REGISTRY.json` E2B-S07; `agent-2-reliability/DEFECTS.md` REL-001/002; `submitGuards.contract.spec.ts`; QA-2A E2E-ME-010 / E2E-032 |
| **Root cause** | Missing client in-flight locks; drink submit path allows second accept on nav-away (server idempotency insufficient for this trigger) |
| **Impact** | Silent score inflation on flaky ship Wi-Fi / tab switching — voyage fairness failure |
| **Repair scope** | Add store/view in-flight guards (Drink + Daily + Scavenger); harden drink submit idempotency/cancel on unmount; regression stress for S07 |
| **Regression tests** | `submitGuards.contract.spec.ts`; QA-2B E2B-S03/S07; browser double-tap + nav-away |
| **Confidence** | high |

---

## REP-MEDIA-001 — Photo stage cancel, discard orphan, empty-blob retry

| Field | Value |
|---|---|
| **Associated IDs** | REL-003, REL-004, REL-005, REL-007, E2E-031, RISK-B |
| **Severity** | **P1** |
| **Cruise class** | Must |
| **Features** | PhotoCapture, Ship It staging, Drink optional photo, Storage upload |
| **Expected** | Discard/Start Over/reset calls `abandonPhotoUpload`; AbortSignal reaches Storage PUT; remount retry never uploads empty Blob |
| **Observed** | Discard clears UI only (photos ledger grows); `upload` omits `signal`; `applyRestore` uses `new Blob()` → retry stages size 0 |
| **Evidence** | REL unit contracts; E2E-ME-009; E2B-M10 abort; QA-2B media stress (orphan path often fixture-blocked but retained) |
| **Root cause** | Wizard discard bypasses PhotoCapture abandon; incomplete abort wiring; restore placeholder without local-bytes guard |
| **Impact** | Confusing retries, storage clutter, failed/corrupt stages mid-voyage |
| **Repair scope** | Wire abandon on all discard paths (incl. Daily if RISK-B confirmed); pass signal to upload; refuse retry without real bytes |
| **Regression tests** | `submitGuards`, `stagePhoto.network`, `PhotoCapture.restore`; E2E-ME-009; E2B-M10 |
| **Confidence** | high |

---

## REP-SIGNED-001 — Gallery / Wrapped signed URL expiry without recovery

| Field | Value |
|---|---|
| **Associated IDs** | REL-008, E2E-030, E2B-L03, WRP-002 |
| **Severity** | **P1** |
| **Cruise class** | Must |
| **Features** | Gallery feed cards; Wrapped Polaroid / photo slides |
| **Expected** | Refresh before ~3600s expiry and/or `@error` → re-fetch signed URL |
| **Observed** | One-shot load on mount; no timer; no `@error` handler; simulated error leaves broken image |
| **Evidence** | `gallerySignedUrl.contract.spec.ts`; E2E-ME-008; E2B-L03; WRP-002 WrappedPhotoCard contract |
| **Root cause** | Client never renews `fetchGalleryPhotoSignedUrl` |
| **Impact** | Broken photos for guests leaving tabs open / browsing finale Wrapped — high abandon risk |
| **Repair scope** | Shared signed-URL composable with refresh + error reload for Gallery + Wrapped |
| **Regression tests** | Gallery/Wrapped contracts; E2B-L03; post-fix optional 1h soak |
| **Confidence** | high |

---

## REP-CAT-LOCK-001 — Catalog stage→preview pending lock

| Field | Value |
|---|---|
| **Associated IDs** | ADM-008, CAT-001, INT-CAT-001L |
| **Severity** | **P0** (elevated — blocks essential admin ops) |
| **Cruise class** | Must |
| **Features** | Admin Catalog Import activation |
| **Expected** | Preview failure clears pending or offers Discard; Check Status never queries never-written publish id |
| **Observed** | Pending rewritten as `publish` with stage request id; UI stuck; Check Status → unknown; DB candidate still recoverable |
| **Evidence** | `adminCatalogPending.contract.spec.ts`; `catalogActivation.contract.spec.ts`; QA-4A probe ADM-008-CAT-001-live |
| **Root cause** | Frontend pending state machine misuse after preview failure |
| **Impact** | Cannot activate replacement menu mid-prep/cruise without clearing site storage |
| **Repair scope** | Clear/rewrite pending correctly; add Discard; Check Status only for real publish ledger ids |
| **Regression tests** | Existing QA-3A contracts + INT-CAT-001L probe |
| **Confidence** | high |

---

## REP-SCHED-001 — No production first bounty schedule generator

| Field | Value |
|---|---|
| **Associated IDs** | INT-SCHED-001, RISK-CAT-D, QA3A-B012 |
| **Severity** | **P0** |
| **Cruise class** | Must |
| **Features** | Bounty schedule bootstrap after catalog import |
| **Expected** | First schedule operable with valid imported catalog (admin/prod path) |
| **Observed** | Only `dev_generate_bounty_schedule` (service_role + development-only); publish rebinds but never creates first schedule |
| **Evidence** | QA-4A CATALOG_INTEGRATION.md; CONFIGURATION_AUDIT class-5 |
| **Root cause** | Missing production RPC / Admin action |
| **Impact** | First production voyage cannot automate bounty exposure without developer/ops workaround |
| **Repair scope** | New admin-gated generator **or** documented one-shot ops runbook + UI affordance; prefer code path for autonomy |
| **Regression tests** | New integration: import → generate → Day1 bounty visible; forbid `dev_*` on non-development label |
| **Confidence** | high |

---

## REP-WRP-RANK-001 — Migration 11100 leaderboard rank regression

| Field | Value |
|---|---|
| **Associated IDs** | INT-WRP-002, WRP-001 (partial) |
| **Severity** | **P1** |
| **Cruise class** | Must (before organizer `11100`) |
| **Features** | Wrapped / Home Drink It leaderboard ranks; Achievements LB mode |
| **Expected** | Ranks by points (stable tie-break); achievements counts available with 11100 |
| **Observed** | 11100 adds counts but join lacks `ORDER BY` → ranks by row position; DI-P03 wrong; WRP-001 counts issue resolved when applied |
| **Evidence** | QA-4A WRAPPED_INTEGRATION.md; probe-wrapped results; DI-P03/P15/C08 failures noted |
| **Root cause** | SQL ranking regression introduced by 11100 |
| **Impact** | Wrong standings / Wrapped Final Rank after enabling achievements metadata |
| **Repair scope** | Patch migration/function: `ORDER BY points desc, first_claim_at, lower(name), id` while keeping achievements; then apply to disposable → organizer |
| **Regression tests** | Wrapped aggregation probe DI-P03; Home LB; Achievements mode /126 |
| **Confidence** | high |

---

## REP-ADM-ERR-001 — Admin ambiguous errors classified as failed/unknown wrongly

| Field | Value |
|---|---|
| **Associated IDs** | ADM-001, ADM-002, ADM-003, ADM-004, INT-ADM-001L, INT-ADM-002L, INT-ADM-003L, INT-ADM-004L |
| **Severity** | **P1** |
| **Cruise class** | Must |
| **Features** | Roster Check Status; bounty skip; void submission |
| **Expected** | In-flight / 409 / gateway → `unknown` (retain pending); deterministic RPC rejects → `failed` |
| **Observed** | `in_progress`/409 → failed (clears pending); 502 after successful skip → failed; some void errors → unknown lock (narrowed live) |
| **Evidence** | QA-3A unit contracts; QA-4A live probes |
| **Root cause** | Over-aggressive `asFailed` / incomplete transport detection / void error mapping |
| **Impact** | False failure UX; double-skip risk; stuck Retry; unsafe Auth re-entry |
| **Repair scope** | Unify admin result classification helper; cover roster/skip/void |
| **Regression tests** | Existing qa3a specs + live INT-ADM-* probes |
| **Confidence** | high |

---

## REP-ADM-LOCK-001 — Admin self-lockout and clock confirm brick

| Field | Value |
|---|---|
| **Associated IDs** | ADM-007, ADM-005, INT-ADM-007L |
| **Severity** | **P1** |
| **Cruise class** | Must |
| **Features** | `/admin` routing; Ship Clock manual correction |
| **Expected** | Admins reach Admin with zero game enrollments; clock confirm catch → unknown + Retry |
| **Observed** | Empty `enabledGames` redirects to `/unavailable` before `requiresAdmin`; `confirmManual` try/finally without catch |
| **Evidence** | `adminAccess.contract.spec.ts`; `adminClock.rejection.spec.ts`; INT-ADM-007L |
| **Root cause** | Router ordering; missing catch after pending write |
| **Impact** | Only onboard operator locked out or clock panel bricked — no in-app recovery |
| **Repair scope** | Exempt `requiresAdmin` from empty-games redirect; add catch + recovery UI |
| **Regression tests** | Access + clock contracts; live self zero-game probe |
| **Confidence** | high |

---

## REP-CAT-PUB-001 — Publish double-tap / pending ignore

| Field | Value |
|---|---|
| **Associated IDs** | ADM-009, INT-ADM-009L |
| **Severity** | **P2** |
| **Cruise class** | Should |
| **Features** | Catalog publish |
| **Expected** | Refuse new publish request id while pending exists |
| **Observed** | `runPublish` ignores pending; second publish can succeed server-side while UI shows failure |
| **Evidence** | `adminCatalogPending.contract.spec.ts` B; INT-ADM-009L |
| **Root cause** | Missing pending guard |
| **Impact** | Lost reconcile handle; STALE_ACTIVE_VERSION risk |
| **Repair scope** | Guard + reconcile UX |
| **Regression tests** | Contract B + live double-tap probe |
| **Confidence** | high |

---

## REP-ADM-SESS-001 — Sign-out leaves Admin pending locks

| Field | Value |
|---|---|
| **Associated IDs** | ADM-006 |
| **Severity** | **P2** |
| **Cruise class** | Should |
| **Features** | Admin session lifecycle |
| **Expected** | Sign-out clears admin pending keys |
| **Observed** | Only player submit pendings cleared; seven `star-princess.admin.*` keys survive |
| **Evidence** | `adminPendingKeys.contract.spec.ts` |
| **Root cause** | Incomplete signOut cleanup |
| **Impact** | Shared-device / organizer handoff inherits locks |
| **Repair scope** | Clear admin keys on signOut |
| **Regression tests** | Existing contract |
| **Confidence** | high |

---

## REP-ACH-MAP-001 — Production achievement release map incomplete

| Field | Value |
|---|---|
| **Associated IDs** | ACH-003, INT-ACH-003 |
| **Severity** | **P1** |
| **Cruise class** | Must (for FINAL 174 enablement) |
| **Features** | `load-production-achievements` / release mapping |
| **Expected** | Map enumerates all 174 FINAL keys (or explicit gates) |
| **Observed** | Interim 140 rows; 37 active keys absent; 3 obsolete keys remain |
| **Evidence** | `achievementDefinitionAudit.spec.ts`; QA-4A matrix 127/10/37 |
| **Root cause** | Stale activation artifact |
| **Impact** | Cruise ships incomplete achievement catalog |
| **Repair scope** | Regenerate `productionReleaseMapping.json`; remove obsolete; mark gated |
| **Regression tests** | Definition audit + INT-ACH-003 probe |
| **Confidence** | high |

---

## REP-ACH-FROZEN-001 — Frozen tropical achievements unreachable

| Field | Value |
|---|---|
| **Associated IDs** | ACH-001, INT-ACH-001 |
| **Severity** | **P1** |
| **Cruise class** | Must (or explicitly gate + guest-facing omit) |
| **Features** | License to Chill; Frozen Concoctions |
| **Expected** | Eligible frozen tropical set reachable from launch catalog |
| **Observed** | Zero `frozen` tags on launch candidate; engine awards when tags injected |
| **Evidence** | Definition audit; QA-4A temporary tag proof |
| **Root cause** | Catalog classification content gap |
| **Impact** | Two achievements permanently unearnable unless gated |
| **Repair scope** | Tag eligible frozen tropicals in catalog **or** keep verification-gated and remove from guest-visible active set |
| **Regression tests** | INT-ACH-10; matrix REQUIRES_FROZEN_DRINK_TAG |
| **Confidence** | high |

---

## REP-ACH-GAUNT-001 — Bar Gauntlet location contract (unverified product)

| Field | Value |
|---|---|
| **Associated IDs** | ACH-002 |
| **Severity** | **P2** (downgraded — MO leak not live) |
| **Cruise class** | Should (investigate; do not speculative rewrite) |
| **Features** | Bar Gauntlet / offering_collection |
| **Expected** | Progress requires log at that physical bar; exclude virtual |
| **Observed** | Static SQL contract expects `bar_id` + `is_virtual` guards. QA-4A: MO logs did **not** advance gauntlet; cross-bar physical rejected. Wrong-bar physical same-offering path **not** proven failing live. |
| **Evidence** | `gauntletLocationContract.spec.ts` fail; ACHIEVEMENT_INTEGRATION INT-ACH-09 PASS (MO excluded) |
| **Root cause** | Unknown — possible alternate server guards; static vs live mismatch |
| **Impact** | If wrong-bar path exists, incorrect gauntlet progress; currently unverified |
| **Repair scope** | Disposable repro for physical offering logged at wrong bar; only then change SQL. Do not “fix” MO leak that was not reproduced. |
| **Regression tests** | INT-ACH-09; new wrong-bar physical case |
| **Confidence** | medium |

---

## REP-ACH-EMPTY-001 — Active defs with empty/missing eligible sets

| Field | Value |
|---|---|
| **Associated IDs** | INT-ACH-004 |
| **Severity** | **P2** |
| **Cruise class** | Should |
| **Features** | Achievement reachability on launch catalog |
| **Expected** | Active defs have non-empty eligible sets or are explicitly gated |
| **Observed** | 4 empty collection + 9 missing catalog dependency unreachable |
| **Evidence** | QA-4A ACHIEVEMENT_INTEGRATION.md |
| **Root cause** | Content/activation mismatch |
| **Impact** | Dead achievements / guest confusion |
| **Repair scope** | Gate or fix content; align with release map |
| **Regression tests** | Reachability matrix |
| **Confidence** | high |

---

## REP-CAT-MO-001 — Mobile Order catalog publication hazards

| Field | Value |
|---|---|
| **Associated IDs** | CAT-002, INT-CAT-006, INT-CAT-004 |
| **Severity** | **P2** |
| **Cruise class** | Should (before menu-agent phase) |
| **Features** | Catalog import validation; MO menu concepts |
| **Expected** | Reject/special-case `mobile-order` as normal bar; preserve MO menu concepts across publish |
| **Observed** | Cocktail candidates at mobile-order accepted; MO menu concepts not carried on apply |
| **Evidence** | catalogValidate characterization; QA-4A catalog integration |
| **Root cause** | Client/server validation gaps; publish apply omission |
| **Impact** | Operator confusion; MO search may silently widen after replace |
| **Repair scope** | Validator reject + publish apply carry concepts |
| **Regression tests** | CAT contracts + INT-CAT-006/004 |
| **Confidence** | high |

---

## REP-CAT-VAL-001 — Non-enum tier stages then publish raw-fails

| Field | Value |
|---|---|
| **Associated IDs** | INT-CAT-003 |
| **Severity** | **P2** |
| **Cruise class** | Should |
| **Features** | Catalog stage validation |
| **Expected** | Invalid tier rejected at stage with structured error |
| **Observed** | Stage accepts; publish fails raw; no ledger row |
| **Evidence** | QA-4A hostile stage set |
| **Root cause** | Incomplete server stage validation |
| **Impact** | Operator friction; not a scoring bypass |
| **Repair scope** | Enum validation at stage |
| **Regression tests** | Hostile stage cases |
| **Confidence** | high |

---

## REP-CAT-ERR-001 — Raw Postgres errors for malformed stage scalars

| Field | Value |
|---|---|
| **Associated IDs** | INT-CAT-007 |
| **Severity** | **P3** |
| **Cruise class** | Optional |
| **Features** | Catalog stage error UX |
| **Expected** | Structured error codes |
| **Observed** | Raw Postgres exceptions |
| **Evidence** | QA-4A DEFECTS |
| **Root cause** | Missing input coercion/guards |
| **Impact** | Poor Admin diagnostics |
| **Repair scope** | Structured catches |
| **Regression tests** | Malformed scalar cases |
| **Confidence** | high |

---

## REP-WRP-MO-001 — Mobile Order counted as Favorite/Most Popular bar

| Field | Value |
|---|---|
| **Associated IDs** | INT-WRP-003 |
| **Severity** | **P2** |
| **Cruise class** | Should |
| **Features** | Wrapped DI-P15 / DI-C08 |
| **Expected** | Virtual MO bar excluded from venue popularity |
| **Observed** | `group by l.bar_id` includes MO |
| **Evidence** | WRAPPED_INTEGRATION.md failing DI-P15, DI-C08 |
| **Root cause** | Missing `is_virtual` / virtual_order_source filter |
| **Impact** | Misleading Wrapped stats |
| **Repair scope** | Exclude virtual bars in those metrics (with R6 SQL pass) |
| **Regression tests** | Wrapped probe DI-P15/C08 |
| **Confidence** | high |

---

## REP-CRW-001 — Admin crew list mutates/locks day crews

| Field | Value |
|---|---|
| **Associated IDs** | INT-CRW-001, RISK-ADM-B |
| **Severity** | **P2** |
| **Cruise class** | Should |
| **Features** | `admin_list_bar_bounty_crews` |
| **Expected** | Read should not permanently lock day crews without intent |
| **Observed** | Opening Admin Drink It crews ensure-mutates and locks |
| **Evidence** | QA-4A ADMIN_INTEGRATION B008 |
| **Root cause** | Mutating read / ensure-on-list |
| **Impact** | Organizer surprise locks before intentional crew edits |
| **Repair scope** | Separate ensure action from list; or warn + undo path |
| **Regression tests** | B008 probe before/after roster change |
| **Confidence** | high |

---

## REP-CLK-001 — Set Ship Time past finale latches without confirmation

| Field | Value |
|---|---|
| **Associated IDs** | INT-CLK-001, RISK-ADM-A |
| **Severity** | **P2** |
| **Cruise class** | Should |
| **Features** | Admin Ship Clock |
| **Expected** | Explicit confirmation before irreversible finale latch |
| **Observed** | Backend applies with no confirmation gate |
| **Evidence** | QA-4A B011 |
| **Root cause** | Missing UI/backend confirm |
| **Impact** | Accidental end-of-game latch |
| **Repair scope** | UI confirm + optional server guard |
| **Regression tests** | Clock admin probe |
| **Confidence** | high |

---

## REP-CLAIM-001 — Cocktail claim UI success without claimed_categories

| Field | Value |
|---|---|
| **Associated IDs** | E2B-002 |
| **Severity** | **P2** |
| **Cruise class** | Should (triage first) |
| **Features** | Drink It bounty claim |
| **Expected** | Enabled Claim + review available → accepted includes cocktail category |
| **Observed** | E2B-S14 `cats=[] points=0` under stress / possible fixture exhaustion |
| **Evidence** | qa2b SUBMISSION_STRESS / DEFECTS |
| **Root cause** | Unknown — eligibility inconsistency vs exhausted same-day claims |
| **Impact** | Confusing “success” without bounty points |
| **Repair scope** | Repro with isolated fixtures; fix only if product path confirmed |
| **Regression tests** | Isolated E2B-S14 |
| **Confidence** | medium |

---

## REP-PREVIEW-001 — Bar preview reason short-circuit

| Field | Value |
|---|---|
| **Associated IDs** | DEF-QA1-001 |
| **Severity** | **P3** |
| **Cruise class** | Optional / decide |
| **Features** | Drink It preview categories |
| **Expected** | Companion-empty reason when `bar_eligible_companion_ids` empty (per contract test) |
| **Observed** | `not_featured_bar` short-circuits first |
| **Evidence** | scoring.phase3a1.closeout (1 fail); QA1_DEFECTS |
| **Root cause** | Reason priority vs stricter test |
| **Impact** | Admin/debug clarity only |
| **Repair scope** | Product decision: change server order **or** relax contract |
| **Regression tests** | Closeout case |
| **Confidence** | high |

---

## REP-MIME-001 — Empty MIME GIF bypass

| Field | Value |
|---|---|
| **Associated IDs** | REL-006 |
| **Severity** | **P3** |
| **Cruise class** | Optional |
| **Features** | `processImageFile` |
| **Expected** | Reject unsupported formats when MIME blank |
| **Observed** | Empty type skips gate; GIF may upload as JPEG |
| **Evidence** | `processImage.qa2.spec.ts` |
| **Root cause** | MIME-empty path |
| **Impact** | Low on cruise |
| **Repair scope** | Extension denylist when MIME empty |
| **Regression tests** | Existing unit |
| **Confidence** | high |

---

## REP-AUTH-001 — Access JWT remains valid after client signOut

| Field | Value |
|---|---|
| **Associated IDs** | INT-AUTH-001 |
| **Severity** | **P3** |
| **Cruise class** | Optional |
| **Features** | Auth session |
| **Expected** | Post-signOut requests unauthorized (or documented residual) |
| **Observed** | JWT valid until expiry after client signOut |
| **Evidence** | QA-4A DEFECTS |
| **Root cause** | Client-only signOut; no server revoke |
| **Impact** | Shared device residual access until expiry |
| **Repair scope** | Document + optional revoke; not speculative auth rewrite |
| **Regression tests** | Probe after signOut |
| **Confidence** | high |

---

## Severity rollup (repair groups)

| Severity | Groups |
|---|---|
| P0 | REP-SUB-001, REP-CAT-LOCK-001, REP-SCHED-001 |
| P1 | REP-MEDIA-001, REP-SIGNED-001, REP-WRP-RANK-001, REP-ADM-ERR-001, REP-ADM-LOCK-001, REP-ACH-MAP-001, REP-ACH-FROZEN-001 |
| P2 | REP-CAT-PUB-001, REP-ADM-SESS-001, REP-ACH-GAUNT-001, REP-ACH-EMPTY-001, REP-CAT-MO-001, REP-CAT-VAL-001, REP-WRP-MO-001, REP-CRW-001, REP-CLK-001, REP-CLAIM-001 |
| P3 | REP-CAT-ERR-001, REP-PREVIEW-001, REP-MIME-001, REP-AUTH-001 |

**Total repair groups: 24.** Authoritative machine-readable copy: `MASTER_DEFECT_REGISTER.json`. Cruise class is per-row **Cruise class** field (Must=10, Should=10, Optional=4).
