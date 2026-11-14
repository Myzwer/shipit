# February fallback and recovery

## Authoritative February catalog

| Fact | Value |
|---|---|
| Definitive file | `content/catalogs/launch-candidate-v1.json` |
| `catalog_id` | `star-princess-launch-candidate-v1` |
| Schema | `1.1` / `full_snapshot` |
| Offline iPhone copy | `docs/qa/campaign/menu-launch/m1/fixtures/february-fallback-star-princess-launch-candidate-v1.json` |
| SHA-256 | `2b2eb49358c315f219bcd1e9e2c4d136430e31afabfcb6e4f888d7e7c999d5ee` |
| Size | 286 012 bytes |
| Provenance | Built from organizer-approved February research + rankings (`handoff/data/menus`, `content/approvals/rankings-approval-v1.json`) |

**Do not generate a different emergency catalog.**

## Pool sufficiency (verified M1)

| Metric | Value |
|---|---:|
| Cocktail eligible | 79 (≥72) |
| Ingredient eligible | 44 (≥39) |
| Readiness | `ready_for_scheduling` |

## Answers to recovery questions

| # | Question | Answer |
|---|---|---|
| 1 | Where does complete data reside? | Repo file above (+ identical M1 fixture). Published DB versions store `manifest_json` per version. |
| 2 | Authoritative version? | File `star-princess-launch-candidate-v1` is the organizer-approved provisional. Live pointer depends on last publish. |
| 3 | Export/preserve restorable JSON? | **Copy the launch-candidate file** offline. `admin_export_current_game_data` is **not** re-importable. |
| 4 | Re-import via Admin? | **Yes** — stage/preview/publish with a **new unique** `catalog_id` (server rejects reuse of an existing `catalog_id`). |
| 5 | Enough for 125 schedule entries? | **Yes** (79/44 eligible; M1 init 72+39+7+7). |
| 6 | Fresh staging/import fails? | Active pointer unchanged (M1 `BE-PHOTO-FAIL-RETAIN`). |
| 7 | Discard invalid staged? | Stage failure leaves no published version; UI discard-pending clears local lock; restage replaces staged candidate flow. |
| 8 | Failed upload change active? | **No** for failed stage (proven). Only successful publish flips pointer. |
| 9 | Pending/init locks block fallback? | Local pending lock: Admin “Discard pending”. Schedule already initialized: cannot re-init; pre-game can still publish another catalog (rebind future slots) — mid-cruise replace after gameplay is out of scope. |
| 10 | Last safe Plan A vs B moment | **Before gameplay begins.** Prefer decide **before schedule init**. After init but before play, republish February still possible for future slots; after play starts, catalog change is out of launch scope. |

## Tested rehearsal (disposable `:55321`)

**Failed photo-like import → February retained → init 125** — PASS (`BE-FEB-FALLBACK-INIT-125`).

**Alternate valid catalog published → February republished → init 125** — PASS (`BE-RESTORE-FEB-THEN-INIT`).

## Organizer Plan B from iPhone alone?

| Step | iPhone-capable? |
|---|---|
| Keep February JSON in Files app | **Yes** (copy before cruise) |
| ChatGPT validate/audit | **Yes** (separate sessions) |
| Admin → Catalog → choose file → stage → preview → publish | **Yes** (UI exists; physical Files picker not lab-proven) |
| Admin → Initialize Bounty Schedule | **Yes** (R5 Admin UI) |
| Rebuild JSON without February file if never downloaded | **Blocked** — Export ≠ import; need offline file or a prior retired manifest via Rollback UI |

### Rollback note

`admin_rollback_catalog` republishes a **retired** version's manifest as a new `*-rollback-*` id (schema 1.0\|1.1). Useful if February was previously published on this project. Still prefer carrying the offline JSON.

## Ops sequence (Plan B)

1. Open Files → `february-fallback-star-princess-launch-candidate-v1.json`
2. If re-importing after any prior publish of the same id, edit `catalog_id` to a new unique slug (e.g. append `-cruise-fallback-1`) — or use Rollback on a retired February version
3. Admin → Catalog → select file → confirm local `ready_for_scheduling`
4. Stage & preview → Publish
5. Drink It → Bounty Schedule → Initialize
6. Confirm 72 / 39 / 7 / 7
7. Do not replace catalog after gameplay starts
