# DEFECTS — QA-4A backend integration (`INT-*`)

Preserves prior `ADM-*` / `CAT-*` / `ACH-*` / `WRP-*` / `REL-*` findings. New IDs use `INT-` and link roots when reproducing the same problem. One ID per underlying defect.

## Confirmed new / live defects

### INT-CAT-001L — P1 — CAT-001/ADM-008 live pending lock

- **Expected:** Preview failure after stage clears pending or offers Discard; Check Status must not query a never-written publish id.
- **Actual:** Pending rewritten as publish with stage request id; UI stuck; backend candidate still staged/recoverable.
- **Layer:** Cross-system (frontend pending; backend OK).
- **Blocks:** Catalog activation ops until site storage cleared.
- **Links:** ADM-008, CAT-001.
- **Evidence:** `probe-admin-catalog-integration-results.json` ADM-008-CAT-001-live.

### INT-ADM-001L — P1 — ADM-001 live

- **Actual:** Real `reconcileAuthRequest` reports `failed` for durable `in_progress` ledger.
- **Layer:** Frontend classification; backend ledger correct.
- **Links:** ADM-001.

### INT-ADM-002L — P1 — ADM-002 live

- **Actual:** Real `createPlayer` maps Edge 409 `OPERATION_IN_PROGRESS` → `failed`.
- **Links:** ADM-002.

### INT-ADM-003L — P1 — ADM-003 live

- **Actual:** Skip applied; forged 502 afterward → client `failed`.
- **Layer:** Cross-system.
- **Links:** ADM-003.

### INT-ADM-007L — P1 — ADM-007 live

- **Actual:** `admin_set_player_access` allows self zero-game; backend still authorizes admin; router locks `/admin`.
- **Layer:** Cross-system.
- **Links:** ADM-007.

### INT-SCHED-001 — P1 — No production first bounty schedule path

- **Expected:** First schedule generation operable with a valid imported catalog (not only `dev_*`).
- **Actual:** Only `dev_generate_bounty_schedule` (service_role + development-only); publish never creates first schedule.
- **Layer:** Backend gap / missing RPC.
- **Blocks:** First-time production schedule without ops workaround.
- **Links:** QA3A-B012.

### INT-WRP-002 — P1 — Migration 11100 rank regression

- **Expected:** Leaderboard ranks by points (stable tie-break).
- **Actual:** Join without `ORDER BY`; ranks by row position; DI-P03 wrong.
- **Layer:** Backend (introduced by 11100).
- **Blocks:** Correct Wrapped/Home standings after enabling Achievements mode.
- **Links:** WRP-001 (counts fixed; ranks newly broken).

### INT-ACH-001 — P1 — Frozen achievements unreachable on launch catalog

- **Actual:** Zero `frozen` tags; License to Chill / Frozen Concoctions cannot unlock. Engine OK when tags present.
- **Layer:** Catalog content / publishing data.
- **Links:** ACH-001.

### INT-ACH-003 — P1 — Production release map incomplete vs 174 defs

- **Actual:** 37 active defs missing from map; 10 blocked; 3 map keys non-active.
- **Layer:** Content/config.
- **Links:** ACH-003.

### INT-ADM-004L — P2 — ADM-004 narrowed live

- Malformed submission UUID → `unknown` + Retry lock; documented FINALE/NOT_FOUND payload paths classify correctly.
- **Links:** ADM-004.

### INT-ADM-009L — P2 — ADM-009 live double-tap publish

- Backend may succeed; UI shows failure and drops reconcile handle.
- **Links:** ADM-009.

### INT-CAT-003 — P2 — Non-enum tier stages then publish raw-fails

### INT-CAT-004 — P2 — MO menu concepts not carried on publish apply

### INT-CAT-006 — P2 — Cocktail candidates at mobile-order accepted (CAT-002 live)

- **Links:** CAT-002.

### INT-CRW-001 — P2 — `admin_list_bar_bounty_crews` mutates/locks day crews

### INT-CLK-001 — P2 — Set Ship Time past finale latches with no backend confirmation

### INT-WRP-003 — P2 — Mobile Order counted as Favorite/Most Popular bar venue

### INT-ACH-004 — P2 — Definitions with empty/missing eligible sets on active catalog

### INT-CAT-007 — P3 — Raw Postgres errors for some malformed stage scalars

### INT-AUTH-001 — P3 — Access JWT remains valid after client signOut until expiry

## Prior defects independently reproduced live

| Prior | Reproduced? |
|---|---|
| ADM-001 | Yes → INT-ADM-001L |
| ADM-002 | Yes → INT-ADM-002L |
| ADM-003 | Yes → INT-ADM-003L |
| ADM-004 | Partially (narrowed) → INT-ADM-004L |
| ADM-005 | Frontend-only confirmed (INFO; backend OK) |
| ADM-006 | Frontend-only confirmed (INFO) |
| ADM-007 | Yes → INT-ADM-007L |
| ADM-008 / CAT-001 | Yes → INT-CAT-001L |
| ADM-009 | Yes → INT-ADM-009L |
| CAT-002 | Yes (server path) → INT-CAT-006 |
| ACH-001 | Yes → INT-ACH-001 |
| ACH-002 | **Not reproduced** on qa2 backend (MO correctly excluded from gauntlet) |
| ACH-003 | Yes → INT-ACH-003 |
| WRP-001 | **Resolved by 11100** for counts; new INT-WRP-002 ranks |

## Not inflated

Related live confirmations share one INT id when they are the same root as a prior ADM/CAT id (suffix `L` = live backend confirmation). Catalog tier/MO/menu issues remain separate roots.
