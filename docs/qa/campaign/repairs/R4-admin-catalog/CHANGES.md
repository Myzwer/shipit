# R4 — Production Changes

## Files modified

| File | Change |
|---|---|
| `src/lib/adminRoster.ts` | `in_progress` / `OPERATION_IN_PROGRESS` → `unknown` on reconcile; Edge 409 in-progress → `unknown` |
| `src/lib/adminBountySkip.ts` | Expand `isTransportOrUnknown` for gateway / HTTP 5xx |
| `src/lib/adminVoid.ts` | Deterministic RPC rejects → `failed`; transport stays `unknown` |
| `src/features/admin/ShipClockSection.vue` | `confirmManual` catch → unknown feedback |
| `src/app/router.ts` | Exempt `requiresAdmin` from empty `enabledGames` redirect |
| `src/stores/session.ts` | signOut clears all admin (+ daily announcement) pending keys |
| `src/features/admin/CatalogImportSection.vue` | Stage clear before preview; preview-failure clear; Discard; publish pending guard; stage Check Status messaging |
| `src/ui/copy.ts` | Discard / stage-pending catalog copy |
| `tests/unit/qa3a-admin-catalog/catalogActivation.contract.spec.ts` | Characterization updated: no publish rewrite with stage id |

## Diagnostic / proof scripts (non-product)

| File | Purpose |
|---|---|
| `scripts/qa2b/repro-r4-admin-catalog.mjs` | Real `:55321` proof: preview-fail clear, Discard, publish guard, publish+rollback |

## Docs

| Path | Purpose |
|---|---|
| `docs/qa/campaign/repairs/R4-admin-catalog/*` | This repair package |
| `docs/qa/campaign/consolidation/KNOWN_FAILURE_MANIFEST.md` | Mark R4 groups repaired |

## Intentionally untouched

- Migrations / RPCs / ship-time mathematics / Friday finale latch
- Scoring / void revocation rules
- R5 first bounty schedule generator (`INT-SCHED-001`)
- Gallery / Wrapped signed URLs (R3)
- Wrapped `11100` ranks (R6)
- Achievement release maps (R7)
- CAT-002 / mobile-order validator polish
- Organizer `:54321`, Agent 2 `:56321` (no mutations)
- Agent 2 worktree / repair branch

## Behavior notes

- Preview is read-only; a failed preview must never leave a publish ledger reconcile handle.
- Discard clears **local** pending only — does not mutate the active catalog pointer. A staged DB candidate can be replaced by staging again.
- Publish pending guard prevents minting a second request id while an unresolved publish/rollback/stage marker exists.
- Backend authorization for Admin is unchanged; router only stops self-lockout for real admins.
