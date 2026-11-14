# R1–R5 Integration — Merge Details

## Pre-flight verification

| Worktree | Path | Branch | HEAD | Match? |
|---|---|---|---|---|
| Main | `/Users/josh/Documents/Web Projects/Vue/Ship It` | `visual/drinkit-home-v1` | `bd7dff5` | Yes |
| Agent 2 (R3) | `/Users/josh/Documents/Web Projects/Vue/Ship-It-qa2-reliability` | `repair/r3-signed-urls` | `2a617bc` | Yes |

Preserved dirty (not stashed/cleaned):

- `docs/qa/wrapped-plan-c-full/coverage-report.json` (modified)
- `all-stats-preview.html` (untracked)
- `src/dev/` (untracked)

## Integration method

**Safe reviewable procedure:** `git cherry-pick 2a617bc`

Why cherry-pick (not merge of Agent 2 branch tip):

- R3 parent is exactly `9f4a48a` (post R1/R2).
- Main already had R4 (`535686f`) and R5 (`ad8c27a`, `bd7dff5`) on top of that parent.
- All overlapping product files still matched the R3 parent blob → no content divergence.
- `git merge-tree` reported **no conflicts**.

Resulting import commit on main:

```
bfba315 :rocket: Recover Gallery signed URLs on expiry
```

(same tree as `2a617bc`, new commit hash on `visual/drinkit-home-v1`)

Agent 2 worktree/branch left at `2a617bc` with no modifications.

## R3 commit contents (imported)

18 files / +1391 / −82, including:

- `src/lib/gallery/signedPhotoLifecycle.ts` (new)
- `src/lib/gallery/useSignedPhotoUrl.ts` (new)
- Gallery / Wrapped / PhotoViewer / FramedPhoto wiring
- `tests/unit/qa2-reliability/signedPhotoLifecycle.r3.spec.ts` (new)
- Contract updates for REL-008 / WRP-002
- `docs/qa/campaign/repairs/R3-signed-urls/*`
- `scripts/qa2b/repro-r3-signed-url.mjs` (Agent 2 `:56321` probe — not re-run; `:56321` protected)

## Conflict policy applied

- No conflicted paths.
- Did not overwrite newer R4/R5 files with older R3 versions (none overlapped).
- No product decisions required.

## Post-import harness fix (integration only)

`tests/unit/DailyClaimScroll.spec.ts` mocked `@/lib/media/stagePhoto` without `abandonPhotoUpload`. R2’s Daily Claim unmount cleanup calls that export, so unmount threw in VTU. Minimal mock addition only — no product logic change. Classified as R2 harness lag, not an R3 functional regression.

## Migration compatibility (inspected, not applied)

Ordered sequence remains:

1. `10900` — Mobile Order / `is_virtual` / `bar_is_physical`
2. `11000` — 5 AM activity-day reporting (extends Wrapped helpers; MO exclusions)
3. `11100` — Wrapped achievement leaderboard metadata (**known R6 ranking defect — untouched**)
4. `11200` — `admin_initialize_bounty_schedule` (depends on `10900` physical-bar flag; **independent of `11100`**)

No migration edits in this assignment. Organizer DB not migrated.

## Safety

| Target | Action |
|---|---|
| Organizer `:54321` | Not mutated |
| Agent 2 `:56321` | Not mutated (R3 original repro not re-run) |
| Agent 1 `:55321` | Used for R1/R5 integration + R3 real expiry |
| `QA_ALLOW_ORGANIZER_MUTATION` | Never set |
| Push / deploy | Not performed |
