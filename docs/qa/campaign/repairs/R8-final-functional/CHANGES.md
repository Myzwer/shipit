# R8 — Changes

## Application

| File | Change |
|---|---|
| `src/lib/media/constants.ts` | `unreliableInputMime` + `rejectedInputExtensions` |
| `src/lib/media/processImage.ts` | Empty/generic MIME extension denylist (REL-006) |
| `src/features/admin/BarBountyCrewsSection.vue` | Idle + confirm before generate/lock (INT-CRW-001) |
| `src/features/admin/ShipClockSection.vue` | Finale-latch acknowledgement gate (INT-CLK-001) |
| `src/lib/shipClockFormat.ts` | `shipLocalToUtcMs` / `proposedTimeAtOrPastFinale` helpers |
| `src/lib/adminCatalogImport.ts` | Map malformed scalar Postgres errors → failed invalid_payload |
| `src/stores/session.ts` | `signOut({ scope: 'global' })` + AUTH residual comment |
| `src/ui/copy.ts` | Crew generate/confirm copy; finale warn/ack/apply copy |

## Tests

| File | Change |
|---|---|
| `tests/unit/qa2-reliability/processImage.qa2.spec.ts` | REL-006 + generic MIME / empty BMP-PDF / empty PNG-WebP cases |
| `tests/unit/shipClockFormat.spec.ts` | Finale helper unit coverage |
| `tests/unit/ShipClockSection.spec.ts` | Finale ack disables apply until checked |
| `tests/unit/BarBountyCrewsSection.spec.ts` | **New** — no mount RPC; confirm before first load |
| `tests/unit/adminCatalogImport.spec.ts` | INT-CAT-007 malformed scalar mapping |
| `tests/integration/scoring.phase3a1.closeout.test.ts` | Accept `not_featured_bar` for DEF-QA1-001 |

## Harness / repro (not product scoring)

| File | Change |
|---|---|
| `scripts/qa2b/run-stress.mjs` | E2B-S14: don’t click `selected`; assert object-shaped categories |
| `scripts/qa2b/investigate-bounty-flakes.mjs` | Same selected-row fix |
| `scripts/qa2b/repro-e2b-002-claim-categories.mjs` | **New** disposable triage proof |

## Explicitly not changed

- Backend claim eligibility / scoring RPCs
- Finale latch SQL mathematics
- `admin_list_bar_bounty_crews` ensure semantics (UI gate only)
- Organizer / Agent 2 databases
- R1–R7 repaired surfaces beyond regression verification
