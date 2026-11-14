# R1 — Root Cause

## E2B-001 — Duplicate accepted drink logs on navigate-away

**Precise cause:** Client reminted a second idempotency key for the same intentional submit after in-memory wizard state was cleared while the first `submit_drink` RPC was still running (or immediately after a reset that dropped the key).

Reproduction that proves it (disposable `:55321`):

1. `performSubmit()` writes pending LS with key **A** and starts RPC.
2. `resetAll()` (leave / discard / success-path race) cleared `idempotencyKey` and set status `idle` **even while the RPC continued**.
3. Second `performSubmit()` called `ensureIdempotencyKey()` → minted key **B**, overwrote pending, fired a second RPC.
4. Backend unique constraint is `(author_player_id, idempotency_key)` — different keys → **two accepted rows**.

A button `:disabled` guard and the existing BUSY check were insufficient because `resetAll` reopened the idle window. Durable pending in localStorage was not consulted on the normal submit path, so the second call ignored key A.

Navigate-away (`page.goto` / soft leave) is the guest-facing trigger that surfaces this race on flaky ship Wi-Fi; the underlying defect is **key remint after mid-flight state wipe**, not “navigation itself inserts twice.”

Server idempotency was already correct for same-key replay. It cannot stop two different keys.

## REL-001 — Ship It scavenger double-submit re-entry

**Cause:** `ScavengerSubmitView.performSubmit` had no `if (submitting.value) return` before awaits. Guard was UI-only (`:disabled="submitting"`). After the first `await reconcileForeignPending()`, a second tap could enter and start another RPC.

Usually the same UUID still replayed server-side, but pending writes and UX were racey (E2E-032 adjacency).

## REL-002 — Drink It Daily double-submit re-entry

**Cause:** Same pattern in `DailyClaimView.performSubmit` — no in-function latch before work/`await submitDaily`.

## E2E-032 — Browser double-tap reachability

**Cause:** Duplicate of REL-001 (scavenger in-flight guard gap). Not a separate product root.

## Why a frontend button guard alone was not enough

- Vue disables the button only after the reactive flush; same-tick multi-invoke can pass.
- `resetAll` / unmount / success navigation re-enable the idle path with a **new** key.
- Hard navigation can lose the success response while the server already accepted — recovery must reuse the durable key, not mint another.

## What was not the cause

- Missing DB unique constraint (already present).
- Ordinary “one drink per day” server rule (must remain allowed).
- Preview RPC creating submissions.
- Need for companion approval or extra confirmation screens.
