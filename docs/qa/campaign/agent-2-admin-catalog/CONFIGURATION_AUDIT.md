# CONFIGURATION_AUDIT — QA-3A Agent 2

Classification key:

1. Properly configured and verified (in this worktree / content / contracts)
2. Configured but not functionally verified (needs disposable or organizer confirmation)
3. Missing organizer inputs
4. Invalid or inconsistent configuration
5. Dependencies that could prevent autonomous operation

**No values invented. No configs changed.**

| Dependency | Class | Evidence / notes |
|---|---|---|
| Actual departure date + 7-day itinerary (`cruise_config.day1_ship_date`) | **3** | No Admin UI; only `dev_seed_cruise_clock` (dev-only). Campaign `AMBIGUITIES_AND_GAPS` #1 still open. |
| Ship clock base offset + 3 AM plan | **3 / 2** | Plan UI exists; production values not present in repo. Plan save contract unit-covered elsewhere; not live-verified here. |
| Daily Bar Bounty locations (7 days) | **2** | Campaign notes “present on organizer”; this Agent did not query organizer DB. Launch daily bar keys exist in fixture builders + launch catalog bars. |
| Drink It! participant eligibility / roster | **3** | Local ≠ production Auth. Roster Admin exists (with ADM-001/002 risks). |
| Ship It! teams | **3 / 5** | Admin can **assign** existing teams only — **no team CRUD**. Decorative names still listed as organizer input. Without teams, Ship It! enrollment blocked (`TEAM_REQUIRED`). |
| Daily Challenge definitions | **2** | Seeded content + Admin announcement free-text only; meeting time/location not Admin-editable. |
| Meetup announcements | **3** | All Hands text is Admin free-text; not machine-gated (`AMBIGUITIES` #4). |
| Catalog activation + version | **1** (client) / **2** (live) | `launch-candidate-v1.json` validates + `isReadyToStage` (unit). Live pointer / publish not executed. UI pending defects ADM-008/CAT-001 threaten ops. |
| Achievement eligibility catalog | **2** | Final locked catalog in repo; mapping gaps (`License to Chill`) still in ambiguities. |
| Pricing evidence / Category B / exceptions | **1** (static integrity tests exist in repo) / **2** | Not re-run full phase10 suite this assignment; launch candidate exercises gates via `previewCatalogImport`. |
| Admin permissions / accounts | **3 / 5** | No promote UI; self-lockout via ADM-007; demo aliases hidden from roster. |
| First bounty schedule generation | **5** | Only `dev_generate_bounty_schedule` (service_role + development-only label). Publish rebinds slots but **does not create** the first schedule. |
| Mobile Order menu restriction table | **3** | Optional (`AMBIGUITIES` #5); virtual search works without it. |
| Photo cleanup ops | **3** | Manual/cron unclear. |

## Autonomy blockers (class 5)

1. **Missing production `cruise_config`** — game never leaves pre-cruise correctly without Day 1 date / offset.
2. **Missing Ship It! teams rows** — cannot enroll Ship It! players from Admin alone.
3. **Missing first bounty schedule generation path for production** — catalog publish alone is insufficient if no slots exist.
4. **Admin self-lockout paths** (ADM-007) — can strand the only onboard operator.

## Verified in this assignment (class 1 excerpts)

- Launch candidate JSON schema_version 1.1, catalog_id `star-princess-launch-candidate-v1`, 13 bars, no `mobile-order` bar, ready to stage (client).
- Organizer-authorized exceptions file present.
- Admin surface explicitly lacks cruise_config editors and team creators (gap confirmed, not filled).

## Do not treat as verified

Anything requiring organizer `:54321` reads/writes, Agent 1 `:55321`, or disposable publish/rollback soaks.
