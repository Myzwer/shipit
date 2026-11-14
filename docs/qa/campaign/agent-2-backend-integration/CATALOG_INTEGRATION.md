# CATALOG INTEGRATION — publication pipeline

**Purpose:** Prove the existing Admin import contract before a future onboard menu-import agent is built.  
**Migration state:** qa2 with 10900–11100.

## Happy path (live)

1. Stage valid replacement JSON — **works** (`admin_stage_catalog_import`).
2. Preview staged changes — **works** (`admin_preview_catalog_publish`, read-only).
3. Activate — **works**; pointer moves only on full success (B001).
4. New menu available without frontend rebuild — **yes** (active pointer + RPC reads).
5. Bounty candidates rebound on publish — **yes** (schedule rebind counts in publish receipt).
6. Rollback — **works**; restores prior playable catalog as new audited revision (B002).
7. Historical logs remain meaningful across replace — **yes** (B013 awards/progress survive).

## CAT-001 / ADM-008 (pending lock)

**Confirmed live (INT-CAT-001L):**

- Stage succeeds → server preview fails → frontend pending rewritten as `action:'publish'` with the **stage** request id.
- Inputs/Stage stay disabled; Check Status looks up a publish ledger id that was never written → stuck `unknown`.
- **Backend** candidate remains staged and is recoverable via discard/restage RPCs.
- **Impact:** frontend-only lock relative to DB authority; blocks normal Admin catalog ops until site storage cleared.
- No working in-UI recovery without clearing pending / Discard path (missing).

## Malformed / hostile inputs

28 hostile payloads exercised against `admin_stage_catalog_import` (forged validation). Findings:

- **INT-CAT-003 (P2):** Non-enum tier accepted at stage; publish then fails with raw RPC error and no ledger row.
- **INT-CAT-007 (P3):** Some malformed scalars return raw Postgres exceptions instead of structured codes.
- Server-side validation still blocks many forged “ready” validations (POOL_SHORTAGE etc. — covered in vitest).

## Mobile Order / CAT-002

- Migration 10900 virtual bar present.
- **INT-CAT-006 (P2):** Stage/publish can accept Cocktail candidates designated at `mobile-order` (CAT-002 reaches live slots).
- **INT-CAT-004 (P2):** Publish apply does not carry `mobile_order_menu_concepts` forward — verified MO menu can silently revert to unrestricted search after replace.

## First-time production schedule (B012)

**INT-SCHED-001 (P1):** Only `dev_generate_bounty_schedule` (service_role + development-only) exists. Publish never creates the first schedule. A valid newly imported catalog alone is **not** enough for first production schedule generation without a new admin/prod RPC or ops path.

## Concurrent / partial failure

- Concurrent stage/publish for same `catalog_id` serializes on advisory lock (B004 PASS).
- Apply-time shortage is fully transactional (B003 PASS).
- Double-tap publish after lost response: backend may succeed while UI loses reconcile handle (ADM-009 / INT-ADM-009L).
