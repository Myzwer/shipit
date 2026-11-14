# Baseline report (Assignment 1 — independently verified)

**Captured:** 2026-11-14T05:02Z (approx)  
**Fact class:** Observed unless marked otherwise.

## Git

| Field | Value |
|---|---|
| Branch | `visual/drinkit-home-v1` |
| HEAD | `80b9add4787c2df83deb4c9082d1a452c30d5122` |
| HEAD subject | `:rocket: Add Plan C Wrapped full-coverage QA fixture` |
| Working tree | **Dirty** — large Visual Fidelity + admin/nav/Wrapped WIP; many untracked docs/scripts/assets |
| Matches Director-reported tip | Yes (`80b9add`) |

**Observed:** Do not stash/reset/commit without organizer approval. Uncommitted Visual Fidelity work must be preserved.

## Build / type / unit (safe)

| Check | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **PASS** (exit 0) |
| Build | `npm run build` | **PASS** (exit 0) |
| Unit tests | `npm test` | **PASS** — 77 files / 388 tests |

**Note (previously documented claim, now re-verified):** Earlier handoff warned of a dirty `buildFinalCards.ts` type error. Current tree typechecks clean.

## Organizer local Supabase (`.env` → `:54321`)

| Field | Observed |
|---|---|
| Label | `development-only` |
| Cruise id | `48fa40c6-e7cd-4f8f-8b81-e3e48d10eb13` |
| `qa:inspect` scenario | `wrapped` |
| Lifecycle | `final`, `finalized: true`, submissions closed |
| Day1 / finale | Day1 `2026-11-07`, finale `2026-11-13T18:34:00+00:00` |
| Roster counts | 22 players / 11 Drink It! / 21 Ship It! / 174 achievements / 60 photos |

## Migrations

| Version | Organizer (`star-princess-local`) | Source present | Notes |
|---|---|---|---|
| … through `10800` | Applied | Yes | Matches Director handoff |
| `10200` (gallery companions) | **Not applied** | Yes (file) | Superseded by companion_names inside `10500` (`list_gallery_feed`) — organizer already has companion_names via 105 |
| `10900` Mobile Order | **Not applied** | Yes | Pending organizer activation (QA-2) |
| `11000` activity-day | **Not applied** | Yes | Pending organizer activation (QA-2) |
| `11100` Plan C LB achievements | **Not applied** | Yes | Source-committed; not on organizer |

**Director claim verified:** organizer through `10800`; `10900`/`11000` pending.  
**Additional observed:** `11100` also pending; `10200` unapplied but functionally covered by `10500`.

## Existing test inventory (high level)

| Layer | Location / scripts | Mutates DB? |
|---|---|---|
| Unit | `npm test` → `tests/unit` | No |
| Integration suites | `test:rls`, `test:auth`, `test:clock`, `test:catalog`, `test:bounty`, `test:crew`, `test:c1`, `test:c2`, `test:integration` | **Yes** (same local stack as cwd `supabase status`) |
| E2E / screenshots | `test:e2e:*`, `screenshots:*` | Often yes |
| QA scenarios | `qa:inspect/list` safe; `qa:prepare/activate/snapshot` destructive | Activate/prepare mutate |
| Demo seed | `demo:seed` | Yes |

## QA snapshots present (gitignored `.local/qa-scenarios/`)

| Slot | Fingerprint | Role |
|---|---|---|
| `wrapped` | `f9f07ab84d988614` | `prepared-fixture-plan-c-full` |
| `wrapped-scenario-c` | `a2e53d5b198488c7` | `scenario-c-safety` |
| `tuesday` | `c765530620fd6b34` | `pre-activate-safety` |
| `precruise` | `aa998fad18234893` | prepared |
| `wrapped-prepared-backup-20261113` | `16d15738fa824fba` | older wrapped backup |

Fingerprints match Director-reported values for `wrapped` and `wrapped-scenario-c`.
