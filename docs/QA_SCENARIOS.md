# QA scenario runbook (final integrated QA)

Development-only harness for three restorable review scenarios:

| Slot | Meaning | Demo seed alias |
|---|---|---|
| `tuesday` | Active midgame (organizer review default) | live snapshot (default) / `tuesday` with `--reseed` |
| `precruise` | Before Day 1 gameplay (`lifecycle=pre_cruise`) | `precruise` |
| `wrapped` | After Friday 6 PM finale | `wrapped` (optional `--plan-c-full` for 15/15 + 12/12 featured coverage) |
| `wrapped-scenario-c` | Safety copy of organizer Scenario C Wrapped review DB | snapshot only (not seedable) |

**CRITICAL:** Tuesday/midgame must remain the active organizer review environment unless the organizer explicitly authorizes a switch. `qa:prepare` for `precruise` / `wrapped` always restores the Tuesday snapshot before exit.

This is **not** an alternate production lifecycle. Ordinary Ship Clock edits are **not** a substitute for restoring the correct dataset + Auth + Storage.

Related: [`docs/DEMO_SCENARIOS.md`](./DEMO_SCENARIOS.md), [`docs/qa/QA-ACH-GALLERY-001.md`](./qa/QA-ACH-GALLERY-001.md).

## Architecture

Snapshots live under gitignored `.local/qa-scenarios/<name>/`:

| Artifact | Contains |
|---|---|
| `postgres.dump` | Local Postgres **`public` schema** (cruise/clock/gameplay/roster, `photos` rows + framing, functions) |
| `storage-objects.dump` | **`storage.objects` data-only** (signed-URL metadata; dumped/restored as `supabase_admin`) |
| `storage.tar.gz` | Local Storage volume **files** (`game-photos`, etc.) |
| `manifest.json` | Fingerprint, restore semantics, counts (no passwords) |
| `inspect.json` | Clock / membership / lifecycle probe at save time |

### Restore replaces

- Local Postgres **`public` table data** (TRUNCATE CASCADE, then `pg_restore --data-only --disable-triggers` as `supabase_admin`). Schema/migrations stay in place — required because Storage RLS policies reference `public.photos` and block `DROP TABLE`.
- **`storage.objects` rows** (`session_replication_role=replica` delete + data-only restore as `supabase_admin`; bypasses `storage.protect_delete`)
- Local Supabase Storage **file** bytes for the project volume

Failed restores throw (`QA_SAFETY`) instead of printing a success-looking summary.

### Restore does not replace / not captured

- Remote / production databases
- Auth schema rebuild — scenarios **share** provisioned Auth identities (`db:provision` / private roster)
- `storage.buckets` DDL / ownership (bucket `game-photos` expected to already exist)
- Git working tree (Visual Fidelity WIP stays untouched)
- `private/roster/` or `private/photos/` source folders
- Vite env files

**Media completeness:** volume files alone are insufficient. Signed URLs need `storage.objects` rows matching `photos.storage_path`. Snapshots missing `storage-objects.dump` are rejected. Cropped presentation uses `photos.crop_*` in public (not separate thumbnail objects).

## Preflight

```bash
open -a Docker
npx supabase status   # API_URL must be http://127.0.0.1:54321
npm run qa:inspect    # expect tuesday / cruise_day 4 / lifecycle active / finalized false
```

Confirm `cruise_config.label = development-only`. Never point these commands at a remote URL (hard-blocked).

Destructive commands require:

```text
--confirm-env=local-development-only
```

Password: `LOCAL_TEST_PASSWORD` (or gitignored `.local/runtime-qual-password.txt`). Never commit passwords.

## Inspect active QA state

```bash
npm run qa:inspect
npm run qa:list
```

## Prepare scenarios (safe)

```bash
# 1) Capture the live Tuesday organizer review DB+Storage (no reseed)
npm run qa:prepare -- tuesday --confirm-env=local-development-only

# 2) Build Pre-Cruise fixture in isolation, then auto-restore Tuesday
npm run qa:prepare -- precruise --confirm-env=local-development-only

# 3) Build Wrapped fixture in isolation, then auto-restore Tuesday
npm run qa:prepare -- wrapped --confirm-env=local-development-only

# 3b) Plan C full featured-slide coverage (15 Drink It! + 12 Ship It!)
# If live is already Wrapped (Scenario C), saves wrapped-scenario-c first,
# verifies coverage, snapshots wrapped, then restores Scenario C (not Tuesday).
npm run qa:prepare -- wrapped --plan-c-full --confirm-env=local-development-only
npm run qa:wrapped-plan-c-coverage   # re-check against whatever is live
```

After steps 2–3, `npm run qa:inspect` must still show Tuesday midgame (unless step 3b restored Scenario C).

To deliberately rebuild Tuesday from `demo:seed` (destructive):

```bash
npm run qa:prepare -- tuesday --reseed --confirm-env=local-development-only
```

## Activate a scenario (organizer authorization required)

```bash
npm run qa:activate -- tuesday --confirm-env=local-development-only
npm run qa:activate -- precruise --confirm-env=local-development-only
npm run qa:activate -- wrapped --confirm-env=local-development-only
```

`activate` changes the **live** local DB. Do **not** activate Pre-Cruise or Wrapped until the organizer authorizes leaving Tuesday.

Manual snapshot aliases:

```bash
npm run qa:snapshot -- save tuesday --confirm-env=local-development-only
npm run qa:snapshot -- restore tuesday --confirm-env=local-development-only
```

## Failed / partial switch

Signs:

- `qa:inspect` `inferred_scenario` ≠ expected
- `lifecycle_ok: false` in restore output
- Missing Storage photos while DB rows remain
- Login aliases from `.local/test-identities.json` fail Auth

Recovery:

```bash
npm run qa:activate -- tuesday --confirm-env=local-development-only
npm run qa:inspect
```

If the Tuesday snapshot is missing or corrupt, stop and restore from the newest `organizer-review-baseline` / `pre-activate-safety` slot notes in `manifest.json`. Do **not** `supabase db reset` while Visual Fidelity review depends on the live Tuesday dataset unless the organizer accepts a full rebuild via `demo:seed -- --scenario tuesday`.

## What each scenario should show

### Tuesday (active review)

- Cruise day 4, accepting submissions, finale **not** latched
- Private roster capacity: ~22 guests / 11 Drink It! / 21 Ship It! across six teams + one unassigned
- Published launch-candidate catalog, daily challenges, bounties, Gallery, achievements
- App: `npm run dev` → typically `http://127.0.0.1:5173`
- Login: name selector from private roster (password from local env — **not** documented here)

Navigate: Drink It! Home / Log / Daily / Gallery / Achievements / Leaderboard; Ship It! Home / Challenges / Gallery; Admin overview + Ship Clock.

### Pre-Cruise (prepared only until authorized)

- `lifecycle=pre_cruise`; `evaluate_submission_acceptance` → `PRE_CRUISE`
- Memberships + catalog + achievement catalog visible; no seeded claims/scavenger/Gallery history from midgame
- Starting screen / Home opening copy and countdowns

### Wrapped (prepared only until authorized)

- Finale latched via real lifecycle (`ensure_finale_latched` path in seed)
- Awards Mode / `/drinkit/wrapped` + `/shipit/wrapped` using the final 80-stat builders
- Submissions closed; scores from accepted event ledgers

## Safety tests (non-mutating preferred)

```bash
npx vitest run tests/unit/qaScenarioSafety.spec.ts tests/unit/achievementAnnouncement.spec.ts
npm run typecheck
```

Do **not** run mutating integration suites against the live Tuesday DB without a fresh Tuesday snapshot and a restore plan.

## Issue tracker

- [`docs/qa/QA-ACH-GALLERY-001.md`](./qa/QA-ACH-GALLERY-001.md) — generic Gallery achievement announcement
