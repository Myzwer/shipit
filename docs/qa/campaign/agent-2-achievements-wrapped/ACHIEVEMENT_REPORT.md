# ACHIEVEMENT_REPORT — QA-3B definition audit

## Authority sources

| Source | Status in worktree |
|---|---|
| `content/achievements/finalAuthority.json` (snapshot of FINAL MD, 2026-11-10) | Present — **used** |
| `/Users/josh/Downloads/.../STAR_PRINCESS_ACHIEVEMENTS_FINAL_STANDALONE.md` | Present on disk (outside repo) — cross-checked counts/§3 |
| `STAR_PRINCESS_ACHIEVEMENTS_FINAL_STANDALONE(1).md` as repo file | **Not in worktree** (path referenced by assignment name) |
| Composed packs: `workingCatalog` + Davids + gauntlets + frozen | Present |
| Engine SQL migrations `06900`–`09900`, `10900` | Present (inspected; not applied here) |

## Counts

| Metric | Value |
|---|---|
| Authority rows audited | **174 / 174** |
| Drink It! / Ship It! | 126 / 48 |
| Implementation mapped (unique stableKey) | **174 / 174** |
| Functionally award-verified end-to-end | **0** (blocked — no disposable DB mutation) |
| Condition types all known | Yes |
| Exclusive Ship It! First to Find | 9 |
| Drink It! exclusives | 0 (correct) |

## Definition → implementation (summary)

Machine-readable matrix: `ACHIEVEMENT_DEFINITION_MATRIX.json`.

Every authority name/trigger/icon/secret/category maps to a composed definition. Categories match approved order; Bar Gauntlets last for Drink It!.

### Flagged families (not all are defects)

| Flag | Count | Verdict |
|---|---:|---|
| `ABSENT_FROM_PRODUCTION_RELEASE_MAPPING` | 37 | **ACH-003** |
| `REQUIRES_FROZEN_DRINK_TAG` | 2 | **ACH-001** |
| `REQUIRES_TROPICAL` | 2 | with ACH-001 |
| `REQUIRES_MARGARITA_DRINK_TAG` | 1 | OK — 7 drinks tagged `margarita` in launch candidate |
| `VERIFICATION_GATED` | 2 | Good Spirits — intentional until price evidence |
| `INGREDIENT_ABSENT_OR_ALT` | 17 | Mostly banana alts inside `any()`; `banana-flavor` present |

## Specialized systems (definition-level)

**Bar Gauntlets (26 + Good Spirits gated):** 13 personal / 13 collective; bar keys exist in launch catalog; Good Spirits `eligible_count: 0` / `verification_required`. Coverage SQL location gap → **ACH-002**.

**Frozen collections:** Definitions wired; catalog tags missing → **ACH-001**.

**Social / Davids:** Conditions use companion aliases + concepts/tags; private alias map required at DB load (launch config). Margarita kickoff tag present on catalog drinks.

**Ship It!:** Team ownership; 9 exclusive First to Find; challenge spotlight / progress defs present.

**Time-sensitive:** `cruise_day` / `ship_time_window` primitives remain in engine; activity-day (`11000`) does not rewrite `cruise_day` eval (contract test). Live boundary proofs blocked.

## Competitive points

No achievement definition carries award/bounty points fields. Awards are collectible-only per FINAL §1 / §3.5 (source audit).

## What this report does **not** claim

Per-definition unlock success, void/revoke races, exclusive reassignment under concurrency, or production `test_only=false` evaluation on a real cruise label — see `ACHIEVEMENT_AWARDING_REPORT.md` and `BLOCKED_INTEGRATION_TESTS.md`.
