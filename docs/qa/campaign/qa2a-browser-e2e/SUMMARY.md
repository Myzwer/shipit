# QA-2A — Authenticated browser E2E summary

**Executed:** 2026-11-14 (local)  
**Branch:** `visual/drinkit-home-v1` @ `94fa2e5` (QA-1 checkpoint) + uncommitted QA-2A harness/reports  
**Backend:** disposable `http://127.0.0.1:55321` only  
**App:** main-tree Vite `http://127.0.0.1:5177` with disposable anon key  
**Organizer `:54321`:** preserved — `lifecycle=final`, `finalized=true`, cruise `48fa40c6-…`  
**`QA_ALLOW_ORGANIZER_MUTATION`:** never set  
**Product repairs:** none

## Verdict

The disposable backend rules from QA-1 **do** show up in the real UI for login, enrollment gates, ordinary Drink It logs, Mobile Order, Daily (Bring a Friend), Ship It submit/race/teammate visibility, JPEG/PNG media, and lifecycle pause/finale presentation.

Gaps that would make guests abandon the app are concentrated in **media reliability (REL-*)** and **bounty claim wizard friction** (long companion lists + prefill races), not in “server rejects valid play.”

## Exact totals (meaningful cases)

| Metric | Count |
|---|---:|
| **Total** | **78** |
| **Passed** | **63** |
| **Failed** | **3** |
| **Blocked** | **10** |
| **Not run** | **2** |

Source: [`TEST_REGISTRY.json`](./TEST_REGISTRY.json)

## Defects (E2E-*)

| Severity | Count | IDs |
|---|---:|---|
| P0 | 0 | — |
| P1 | 3 | E2E-030 (REL-008), E2E-031 (REL-003), E2E-032 (REL-001) |
| P2 | 2 | E2E-011 (ingredient claim E2E), E2E-012 (bar claim E2E flake) |
| P3 | 0 | — |

Do **not** double-count with Agent 2 `REL-*` — E2E-030/031/032 are integration confirmations of those findings.

## Coverage mix

| Method | Role |
|---|---|
| **Real browser + real disposable backend** | Authoritative for this batch (Playwright Chromium mobile emulation) |
| Mocked browser | Not counted as E2E success |
| Unit/static | Used only to link REL-005/007/008 where soak unsafe |
| Physical device | **Still required** — see [`BLOCKED_DEVICE_TESTS.md`](./BLOCKED_DEVICE_TESTS.md) |

## Existing findings independently reproduced

| Finding | Browser/disposable result |
|---|---|
| REL-001 | Double-tap scavenger submit reachable; in-function guard still absent (idempotency may mask score dup) |
| REL-003 | Discard after stage → `photos` row count increased (orphan suspected) |
| REL-008 | No `@error` / refresh timer in gallery card; short-session images OK |
| REL-005 / REL-007 | Integration verification **outstanding** (retained) |
| DEF-QA1-001 | Not re-litigated in browser (Admin preview reason) |

## Top remaining risks (guest abandon)

1. **Gallery images die on long sessions** (REL-008) — ship Wi-Fi + backgrounded tabs.
2. **Draft discard orphans uploads** (REL-003/004) — storage clutter + confusing retries.
3. **Bounty claim UX on large rosters** — friends step can be enormous; continue easy to miss under floating nav (automation friction mirrors guest friction).
4. **Stale open tabs across pause/rotation/grace** — pause needs refresh (E2E-LC-005); long rotation/grace browser waits still blocked.
5. **Unclear retry after accept-then-disconnect** (E2E-NET-008/009 blocked).

## What still needs physical devices

iPhone Safari HEIC, real camera roll, Android Chrome file picker, wrong device clock, multi-hour gallery soak, true multi-device login. Emulation explicitly **does not** claim those.

## Harness added (no app fixes)

- `scripts/qa2a/**` — disposable-only Playwright runner + suites  
- Reports under `docs/qa/campaign/qa2a-browser-e2e/`  
- Evidence under `evidence/` (gitignored)

See [`RUN.md`](./RUN.md) for exact commands.
