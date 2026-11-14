# R4 — Root causes

## REP-ADM-ERR-001 (ADM-001…004, INT-ADM-001L…004L)

### ADM-001 / INT-ADM-001L
`reconcileLedger` treated any ledger object without truthy `ok` as `asFailed`. An Auth request still `in_progress` therefore cleared pending and showed a false failure, inviting a dangerous re-entry.

**Fix:** Treat `status` / `request_status === 'in_progress'` (and `OPERATION_IN_PROGRESS`) as `unknown`.

### ADM-002 / INT-ADM-002L
`invokeRoster` mapped any 4xx JSON body through `asFailed`. HTTP 409 `OPERATION_IN_PROGRESS` is not a confirmed reject — the Edge work may still complete.

**Fix:** Classify 409 / `OPERATION_IN_PROGRESS` as `unknown` before the generic 4xx failure path.

### ADM-003 / INT-ADM-003L
`isTransportOrUnknown` only matched fetch/network/timeout/abort. Gateway-style messages (`Bad Gateway`, `HTTP 502`) became `failed` and cleared pending even when the skip had applied.

**Fix:** Expand transport detection to gateway / HTTP 5xx patterns.

### ADM-004 / INT-ADM-004L
`applyVoidSubmission` mapped every RPC `error` except `ADMIN_REQUIRED` to `unknown`, locking Retry on confirmed rejects (`FINALE_LOCKED`, `SUBMISSION_NOT_FOUND`, …).

**Fix:** Detect deterministic void rejection messages → `failed` with mapped codes; leave true transport ambiguity as `unknown`.

---

## REP-ADM-LOCK-001 (ADM-005, ADM-007, INT-ADM-007L)

### ADM-005
`confirmManual` used `try/finally` with no `catch`. After pending was persisted, a throw left controls locked without unknown feedback (Retry/Refresh only render for `feedback.kind === 'unknown'`).

**Fix:** Catch → set unknown feedback; pending retained for safe retry.

### ADM-007 / INT-ADM-007L
Router redirected `enabledGames.length === 0` to `/unavailable` **before** `requiresAdmin`. Backend still authorized a zero-game admin; the SPA locked them out.

**Fix:** Skip the empty-games redirect when `to.meta.requiresAdmin` is set; keep the real `isAdmin` gate.

---

## REP-ADM-SESS-001 (ADM-006)

`session.signOut` cleared only player submit pendings. Seven `star-princess.admin.*` keys survived shared-device handoff.

**Fix:** Clear all admin pending modules (clock, catalog, roster×2, void, skip, pause, add-drink) plus daily announcement.

---

## REP-CAT-LOCK-001 (ADM-008, CAT-001, INT-CAT-001L)

After a successful stage, `runStageAndPreview` rewrote pending as `action: 'publish'` using the **stage** request id, then called read-only `previewPublish`. On preview failure it returned without clearing pending. Check Status queried the publish ledger for an id that was never written → permanent `unknown`. Inputs/Stage stayed disabled.

Backend remained healthy (candidate staged; pointer untouched) — lock was client-only.

**Fix:**
1. Clear stage pending after successful stage; do not mint publish pending with the stage id.
2. On preview failure, clear pending and reset the in-memory ref.
3. Add explicit **Discard Pending** for stuck / legacy locks.
4. Check Status only for `publish` / `rollback` actions.
5. `runPublish` refuses while `pending` exists (also covers ADM-009 double-tap).

Authoritative publish/rollback semantics and scoring rules were not changed.
