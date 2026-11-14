# R1 — Submission Integrity (REP-SUB-001)

**Status:** Repaired and verified on disposable `:55321`  
**Baseline:** `73a19c9` on `visual/drinkit-home-v1`  
**Associated IDs:** E2B-001, REL-001, REL-002, E2E-032

## Verdict

Repeated, interrupted, and navigated-away submits no longer create a second accepted drink row for one intentional action. Scavenger and Daily Challenge now latch in-flight the same way Drink It ordinary logging already attempted to.

## What was wrong

1. **E2B-001** — Leaving mid-submit (or resetting wizard state while `submit_drink` was in flight) cleared the in-memory idempotency key. A second `performSubmit` minted a **new** key even though durable pending still held the first. Server uniqueness is per key → **two accepted rows**.
2. **REL-001 / REL-002 / E2E-032** — Scavenger and Daily relied on button `:disabled` only. After the first `await`, a second invocation could start.

## What changed (product)

- Module-level in-flight coalesce for drink submit (survives `resetAll` / remount in the same JS context).
- `resetAll` preserves idempotency key + pending payload while a submit is in flight.
- `performSubmit` reuses durable pending localStorage key/payload before minting.
- Success path navigates before `resetAll`; terminal `success` short-circuits remint.
- Soft leave during `submitting` allowed without wiping the in-flight key.
- Daily + Scavenger: synchronous `submitting` latch before any await; reuse durable pending key when present.

No database / RPC migrations. Existing `submissions (author_player_id, idempotency_key)` unique constraint remains the authoritative backend guard.

## Verification snapshot

| Check | Result |
|---|---|
| `submitGuards` REL-001/002 (+ BUSY / unknown) | Pass |
| `submissionIntegrity.r1.spec.ts` | Pass (8) |
| Disposable integration `submissionIntegrity.r1.test.ts` | Pass (3) |
| Forced remint race (browser Pinia) | 1 RPC / shared submission id |
| E2B-S07 focused repro | `newSubs=1` |
| `logWizardNavigation.spec.ts` | Pass (20) |
| `typecheck` / `build` | Pass |

Media abandon assertions in `submitGuards` remain expected-red for **R2** (REP-MEDIA-001).

## Docs in this folder

- `ROOT_CAUSE.md` — defect-by-defect cause
- `CHANGES.md` — files touched
- `REGRESSION_RESULTS.md` — before/after + new tests
- `REMAINING_RISKS.md` — residual cruise risks
