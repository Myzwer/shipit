# ADMIN_REPORT — QA-3A Agent 2

**Scope:** Exhaustive Admin UI / client / RPC contract diagnostics.  
**Not in scope:** Agent 1 authoritative clock/gameplay DB work; organizer `:54321` mutations; disposable `:55321`.  
**App source modified:** No.

## Access & lifecycle

| Control | Backend | Test posture | Result |
|---|---|---|---|
| Login → `get_my_session_profile` → `is_admin` | RPC | Inspected + prior unit coverage | Contract OK |
| `/admin` `requiresAuth` + `requiresAdmin` | Router | `adminAccess.contract.spec.ts` | Pass |
| Empty `enabledGames` before admin check | Router | Same | **FAIL → ADM-007** |
| Sign-out clears Admin pending | `session.signOut` | `adminPendingKeys.contract.spec.ts` | **FAIL → ADM-006** |
| Admin promote / demote UI | — | Inventory | **Missing** (SQL only) |
| KeepAlive section shell | `AdminView.vue` | Inventory | Stale Overview risk (documented) |

## Inventory of Admin sections (complete)

| Section | Sub-controls | Primary RPCs / Edge | Autonomous need |
|---|---|---|---|
| Overview | Counts, clock summary, pause status, Retry | `admin_overview_summary`, clock diagnostics, pause status | OPT read (latch risk) |
| Players & Teams | List, Add, Reset password, Edit access, Check Status | `admin_list_roster`, `admin_list_teams`, `admin_set_player_access`, Edge `admin-roster` | PRE |
| Drink It! → Game Status | Pause / Resume / Reconcile / Retry | `admin_set_drinkit_paused`, find-by-id | CONT |
| Drink It! → Bar Bounty Crews | Refresh list | `admin_list_bar_bounty_crews` (**ensure on read**) | OPT / RISK |
| Drink It! → Daily Announcements | Save/Clear all_hands text | `admin_set_daily_challenge_announcement` | OPT |
| Drink It! → Skip bounty | Skip cocktail/ingredient | `admin_skip_current_bounty` | CONT |
| Drink It! → Void | Preview + Void | `admin_void_submission` | CONT |
| Ship Clock | ±1h, Set Ship Time, 7-day plan, Refresh/Retry | clock apply/preview/plan RPCs | CONT / PRE plan |
| Catalog → Add Drink | Preview/Save/Deactivate manual | `admin_add_drink` family | OPT |
| Catalog → Export | Download JSON | `admin_export_current_game_data` | OPT |
| Catalog → Import | Stage/Preview/Publish/Rollback | stage/preview/publish/rollback | PRE |

**Game start / finale:** No Admin “Start game” or “End game” button. Start is derived from `day1_ship_date` midnight; finale is a monotonic latch from clock/Set Time.

**Ship It! pause:** Not available (hard-coded unaffected).

**Team CRUD / cruise_config / admin promote:** Not in Admin UI.

## Executed vs mocked vs inspected

| Mode | What |
|---|---|
| **Executed (real client code)** | Error classification helpers, pending key inventory, router/source contracts, Vue SFC structure asserts |
| **Mocked RPC / Edge** | Roster reconcile/create, bounty skip, void, clock apply characterization — all labeled `[MOCKED …]` |
| **Inspected only** | SQL function bodies, edge function Auth flow, finale latch side effects of reads |
| **Not executed** | Any mutating Admin RPC against a database |

## Control-by-control findings (high signal)

### Ship Clock
- Atomic plan save exists (`admin_save_ship_clock_plan`); legacy per-day upsert still granted.
- Pending pattern for ±1h / Set Time is solid when apply returns structured outcomes.
- **ADM-005:** uncaught throw after pending write can lock UI without recovery buttons.
- Set Time can permanently latch finale (no dedicated guard) — RISK-ADM-A.
- Plan save swallows detailed error body in UI.

### Pause / Resume
- Request-id ledger + FINALE_LOCKED handling present.
- Recovery buttons gated on `status` load — if status fetch fails while pending, recovery UI may be hidden (inspected risk).
- Does **not** pause Ship It!.

### Roster
- Optimistic fingerprint on access edits; password length 12–128.
- **ADM-001 / ADM-002:** in-progress / 409 misclassified as failed.
- Reset-password retry may keep original password on Edge replay (inspected; blocked for live prove).
- No Discard for stuck pending Auth/Access panels.
- Self-edit can remove all game enrollments → **ADM-007**.

### Announcements
- Display-only meetup location; free-text announcement only.
- No server request-id ledger → last-write-wins (RISK-ADM-C).

### Skip / Void
- Skip: **ADM-003** gateway misclassification.
- Void: **ADM-004** unknown-on-deterministic-error; no submission search UI (RISK-ADM-D).

### Catalog Admin
- Runtime activation without redeploy is supported by design (pointer flip).
- **ADM-008 / CAT-001 / ADM-009** pending/publish recovery defects.
- Export is not the import schema (documented in client header).

### Bar Bounty Crews
- Opening/refreshing can permanently lock that day’s crews (`bar_bounty_ensure_crews_at`) — RISK-ADM-B. Not live-proven here.

## Autonomy assessment

| Need | Admin required during cruise? |
|---|---|
| Scoring, bounties, scavenger, gallery | No — autonomous if config/catalog/roster seeded |
| Clock drift | Contingency Admin (±1h / Set Time / plan) |
| Pause Drink It! | Contingency |
| Skip exhausted / bad bounty | Contingency (exact 72/39 → zero reserves) |
| Void | Emergency only |
| Catalog replace | Pre-cruise / mid-cruise ops; **must work** for real menu JSON |

## Defects from this report

ADM-001 … ADM-009 (see `DEFECTS.md`). Catalog-facing duplicate: CAT-001.
