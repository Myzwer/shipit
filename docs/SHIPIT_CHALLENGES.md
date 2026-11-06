# Ship It! challenges & team progress (Phase 4A + 4B2)

Server-authoritative scavenger catalog, team completion ledger, player reads, and **photo-required `submit_scavenger`**.

## Schema

| Table | Role |
|---|---|
| `scavenger_challenges` | 50 enabled tasks; five categories × 10; points 100/200/300/400/500; `photo_required` always true |
| `scavenger_completions` | Team-scoped ledger; partial unique active `(team_id, challenge_id)`; immutable snapshots |
| `submissions` | `kind` includes `scavenger_completion`; optional `team_id` |
| `photos` | Staged → bound to submission in the same transaction as completion |

Category points: Classic 100, Food 200, Quirky 300, Interactive 400, Creative 500. Team max 15,000. No team-size multiplier.

## Submit contract

`submit_scavenger(p_payload jsonb)` (authenticated Ship It! members):

```json
{
  "idempotency_key": "<uuid>",
  "challenge_id": "<uuid>",
  "photo_id": "<staged photo uuid>",
  "caption": "optional"
}
```

Server derives player, team, receipt time, Ship Clock day, and challenge points. Client `points` / `team_id` / timestamps are rejected (`FORGED_FIELDS`).

Atomic in one Postgres transaction: gallery event → submission → completion → photo `bound`. Storage upload remains a prior step (not cross-service atomic).

| Code | Meaning |
|---|---|
| `ACCEPTED` | New completion |
| `TEAM_CHALLENGE_DONE` | Another teammate already completed — loser’s photo stays staged |
| `IDEMPOTENCY_PAYLOAD_MISMATCH` | Same UUID, different payload |
| `GAME_ENDED` | After Friday 6 PM Ship Time / latched finale |
| `PHOTO_*` | Missing, wrong owner/game/purpose, not staged, fixture, already bound |

Drink It! Pause does **not** block Ship It!. Same UUID replays return the original result (including after finale).

## Read contracts

| RPC | Notes |
|---|---|
| `get_my_shipit_home()` | Progress + leaderboard from active completions |
| `get_my_shipit_challenges()` | `submission_ready` true when incomplete and lifecycle accepting |
| `get_my_shipit_submission(id)` | Same-team stub post |
| `create_shipit_photo_signed_url(photo_id)` | Authorize path; client signs via Storage API |

Bound scavenger objects are readable by teammates via Storage policy (no public URLs).

## Player UI

Incomplete challenge → `/shipit/challenges/:id/submit` → PhotoCapture (required) → optional caption → Review → Submit → `/shipit/gallery?submission=…` stub. Pending UUID recovery mirrors Drink It!.

## Tests

```bash
npm run test:integration   # includes shipit.phase4b2.submit + media.phase4b2.gates
npm run test:e2e:phase4b2
```

Manual: rear-camera launch on a real phone (Playwright file injection is not proof).

## Admin Void (Phase 5B / 5C)

- `admin_void_submission` soft-voids the scavenger `submissions` row and the team’s active `scavenger_completions` row
- Points leave team totals (sums of active completions only)
- Challenge reopens for **that team** (partial unique active index); other teams unchanged
- Gallery suppressed; photo retained for audit; member Storage/signed reads denied while voided
- Drink It! Pause does **not** block Ship It! void
- Finale Friday 6 PM / latch rejects new voids
- Same UUID player retry never resurrects the completion
- **Fingerprint (5C):** request identity includes normalized reason (`void_submission:v2:…`). Same UUID + identical payload replays; changed reason/submission/status mismatches. Legacy Phase 5B fingerprints remain replayable when stored reason still matches.
- Achievement recompute via `achievement_on_void_submission` (Phase 7A)

## Out of scope (later)

Achievement catalog, Awards Mode / Wrapped, production challenge content, media sweeper.
