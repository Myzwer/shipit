# DEFECTS — QA-3A Agent 2 (Admin & Catalog)

Confirmed from failing unit/contract tests and static source inspection.  
**No application fixes applied.** Defect IDs: `ADM-*` (Admin), `CAT-*` (Catalog).

---

## ADM-001 — P1 — Roster Check Status treats `in_progress` as failed

- **Feature:** Players & Teams — create/reset reconcile (“Check Status”)
- **Expected:** A ledger row `{ status: 'in_progress' }` without `ok:true` stays `unknown` so the pending lock remains and Check Status can retry.
- **Actual:** `reconcileLedger` in `src/lib/adminRoster.ts` maps any object without truthy `ok` through `asFailed` → `failed`, which clears pending.
- **Repro:** Start create/reset → lose the HTTP response while Auth is still working → tap Check Status while the ledger is `in_progress`.
- **Evidence:** `tests/unit/qa3a-admin-catalog/adminRoster.reconcile.spec.ts` (failed expect `status === 'unknown'`).
- **Affected:** Admin cannot safely reconcile in-flight Auth provisioning; may re-enter create/reset incorrectly.
- **Blocks further testing?** No for unit; blocks confident live roster soak until disposable env.

---

## ADM-002 — P1 — Create player maps HTTP 409 `OPERATION_IN_PROGRESS` to failed

- **Feature:** Admin roster Edge Function create
- **Expected:** 409 `OPERATION_IN_PROGRESS` is `unknown` (request may still complete).
- **Actual:** `invokeRoster` maps any 4xx with a JSON body to `asFailed` → `failed` and clears pending.
- **Repro (mocked proven):** Concurrent create with same request / lease collision returning 409.
- **Evidence:** `adminRoster.reconcile.spec.ts` case B.
- **Affected:** Same family as ADM-001 — false “failed” under concurrency.

---

## ADM-003 — P1 — Bounty skip treats gateway errors as confirmed failure

- **Feature:** Skip Current Cocktail / Ingredient
- **Expected:** Ambiguous transport/gateway errors (`Bad Gateway`, `HTTP 502`) stay `unknown` so pending is retained for reconcile.
- **Actual:** `isTransportOrUnknown` only matches fetch/network/timeout/abort keywords; other 5xx-style messages become `failed` and clear pending even if the skip applied.
- **Repro:** Mock / induce RPC error message `Bad Gateway` or `HTTP 502` on `admin_skip_current_bounty`.
- **Evidence:** `adminBountySkip.errors.spec.ts` (2 failing cases).
- **Affected:** Contingency skip on flaky ship Wi-Fi / proxy; risk of double-skip or abandoned lock recovery.

---

## ADM-004 — P1 — Void maps deterministic RPC errors to unknown

- **Feature:** Void Submission
- **Expected:** Confirmed rejections (`FINALE_LOCKED`, `SUBMISSION_NOT_FOUND`, etc.) are `failed` so the UI clears pending and shows a definitive error.
- **Actual:** `applyVoidSubmission` returns `unknown` for every RPC `error` except `ADMIN_REQUIRED`, locking the section on Retry.
- **Repro:** Void after finale or with a nonexistent UUID such that PostgREST returns an error object (not `ok:false` payload).
- **Evidence:** `adminVoid.errors.spec.ts`.
- **Affected:** Emergency void UX under error conditions; pending stuck until Retry path resolves.

---

## ADM-005 — P1 — Set Ship Time / ±1h confirm has no catch after pending write

- **Feature:** Ship Clock manual correction
- **Expected:** If `applyManualCorrection` throws after the pending record is written, UI shows unknown feedback with Refresh/Retry.
- **Actual:** `confirmManual` in `ShipClockSection.vue` uses `try/finally` with **no `catch`**. An unhandled throw leaves controls locked via pending without recovery buttons (those render only when `feedback.kind==='unknown'`).
- **Repro:** Offline/JWT failure on the pre-apply `fetchAdminClockDiagnostics()` inside `applyManualCorrection` after pending persist.
- **Evidence:** `adminClock.rejection.spec.ts` (source contract fail); characterization mock shows unlisted errors become `unknown` when caught inside apply — the UI catch gap remains.
- **Affected:** Contingency clock ops; can brick Admin clock controls until localStorage pending is cleared manually.

---

## ADM-006 — P2 — Sign-out does not clear Admin pending locks

- **Feature:** Admin session lifecycle
- **Expected:** Sign-out clears Admin pending keys (clock, pause, skip, void, roster, catalog, add-drink) so another admin on the same browser does not inherit locks.
- **Actual:** `session.signOut` only clears Drink / Daily / Scavenger **player** submit pendings. Seven `star-princess.admin.*` keys (plus daily-announcement key) survive.
- **Evidence:** `adminPendingKeys.contract.spec.ts` (5 failing expects).
- **Affected:** Shared devices / organizer handoff; cross-admin lock inheritance.
- **Severity note:** P2 — workaround is clearing site data; still operationally serious aboard ship.

---

## ADM-007 — P1 — Admin with zero game enrollments cannot open `/admin`

- **Feature:** Admin routing / roster self-edit
- **Expected:** `requiresAdmin` routes remain reachable for admins even if Drink It! and Ship It! are both disabled.
- **Actual:** Router redirects `enabledGames.length === 0` to `/unavailable` **before** the `requiresAdmin` check. An admin who removes their own game access (or is provisioned with none) is locked out of Admin.
- **Evidence:** `adminAccess.contract.spec.ts` case B.
- **Affected:** Lifecycle / roster ops; possible self-lockout with no in-app recovery (SQL required).

---

## ADM-008 — P1 — Catalog stage→preview failure leaves non-discardable publish pending

- **Feature:** Catalog Import stage + server preview
- **Expected:** If `previewPublish` fails after a successful stage, pending is cleared or a Discard control exists; Check Status must not look up a publish id that was never written.
- **Actual:** `runStageAndPreview` rewrites pending as `action:'publish'` with the **stage** request id, then on preview failure returns without `clearPendingAdminCatalogImport`. Inputs/Stage stay disabled. Check Status queries the publish ledger for a never-used id → stuck `unknown`.
- **Evidence:** `adminCatalogPending.contract.spec.ts` A; `catalogActivation.contract.spec.ts` (3 fails). Same root cause as **CAT-001**.
- **Affected:** Launch catalog activation path; organizer can be locked out of import UI mid-cruise prep.

---

## ADM-009 — P2 — Catalog `runPublish` ignores existing pending lock

- **Feature:** Catalog publish
- **Expected:** Publish refuses to mint a new request id while a pending publish/stage record exists.
- **Actual:** `runPublish` only guards `candidateId`, `payloadHash`, and `busy` — not `pending`. A second publish overwrites pending and can yield `STALE_ACTIVE_VERSION` after a lost first response.
- **Evidence:** `adminCatalogPending.contract.spec.ts` B.
- **Affected:** Concurrent / double-tap publish recovery.

---

## CAT-001 — P1 — Catalog import pending lock on preview failure (activation UX)

- **Feature:** Catalog import activation (Admin UI contract)
- **Expected:** Preview failure after stage must not leave a non-recoverable pending publish marker.
- **Actual:** Same mechanism as ADM-008; catalog-facing severity because it blocks activation of replacement menus without clearing site storage.
- **Evidence:** `catalogActivation.contract.spec.ts`.
- **Note:** Dual-tagged with ADM-008; count once for severity rollups if preferred — both IDs retained for Admin vs Catalog registries.

---

## CAT-002 — P2 — Catalog validator accepts `mobile-order` as a normal bar

- **Feature:** Catalog import validation vs Mobile Order virtual bar
- **Expected:** Import schema/business rules reject or specially handle `mobile-order` so a generated replacement menu cannot designate bounty candidates there.
- **Actual:** Client `previewCatalogImport` accepts a `mobile-order` bar and even cocktail candidates designated at it. Bounty exclusion is DB-only (`virtual_order_source` / `is_virtual`). A bad JSON could stage content that confuses operators even if live eligibility still blocks.
- **Evidence:** `catalogValidate.replacement.spec.ts` (passing characterization); Mobile Order contracts in `adminSideEffects.contract.spec.ts`.
- **Affected:** Future menu-generation agent safety; not a live scoring bypass by itself.

---

## Risks / not confirmed as ADM/CAT defects (see CONFIGURATION_AUDIT & BLOCKED)

| ID | Item | Class |
|---|---|---|
| RISK-ADM-A | Set Ship Time past finale irreversibly latches games | Design + missing UI guard |
| RISK-ADM-B | Opening Drink It! crews Admin **mutates** day crews via ensure | Mutating read |
| RISK-ADM-C | Daily announcement request id not ledgered server-side | Last-write-wins |
| RISK-ADM-D | Void requires pasted UUID; no search UI | Usability |
| RISK-CAT-A | No catalog payload size / maxItems limit | DoS / operator mistake |
| RISK-CAT-B | TS-only validation bypassable via direct RPC + crafted `p_validation` | Authz assumes admin trust |
| RISK-CAT-C | Add Drink vs publish advisory-lock race (overlay on retired version) | Needs disposable reproduce |
| RISK-CAT-D | First bounty schedule only via `dev_generate_bounty_schedule` | Launch dependency |
| RISK-CFG-A | No Admin UI for `cruise_config` / team CRUD / admin promote | Missing organizer tooling |

---

## Severity tally (confirmed)

| Severity | Count | IDs |
|---|---|---|
| P0 | 0 | — |
| P1 | 8 unique themes | ADM-001, 002, 003, 004, 005, 007, 008/CAT-001, (+ADM-002 family) |
| P2 | 3 | ADM-006, ADM-009, CAT-002 |
| P3 | 0 | — |

**Unique confirmed defect IDs filed:** ADM-001…ADM-009, CAT-001, CAT-002 (11 IDs; ADM-008 and CAT-001 share one root cause).
