# Ship It! challenges & team progress (Phase 4A)

Server-authoritative scavenger catalog, team completion ledger, and player read contracts. **Photo-required submission is not enabled yet** — that depends on the shared media pipeline (Phase 5).

## Schema

| Table | Role |
|---|---|
| `scavenger_challenges` | 50 enabled tasks; five categories × 10; points 100/200/300/400/500; `photo_required` always true; `content_source` marks development-only seed |
| `scavenger_completions` | Team-scoped ledger; partial unique active `(team_id, challenge_id)`; snapshots title/instructions/points; void-compatible `status` |
| `submissions` | Extended `kind` for future `scavenger_completion` and development `scavenger_dev_fixture` parents; optional `team_id` |

Category labels (exact):

1. Classic Ship Landmarks — 100  
2. Food & Drink Discoveries — 200  
3. Quirky Details & Hidden Artifacts — 300  
4. Interactive Crew & Activity Challenges — 400  
5. Creative Team & Action Shots — 500  

**Team max:** 15,000 points. No team-size multiplier. Different teams may complete the same challenge independently.

Content may be replaced later without rewriting history — completions store immutable snapshots.

## Read contracts (authenticated Ship It! members only)

| RPC | Returns |
|---|---|
| `get_my_shipit_home()` | Lifecycle, caller’s team (from membership — never a client team id), five category progress rows, overall `/50`, leaderboard with member names / completed / points / tied ranks |
| `get_my_shipit_challenges(p_category text)` | Enabled challenges grouped by category (or one category); team completion flags; `submission_available=false` until photo pipeline |

Drink It!-only / anonymous callers are denied. Direct table writes are revoked for `authenticated`. Other teams’ aggregate leaderboard rows are visible; private submission details are not exposed.

## Lifecycle

`shipit_lifecycle_at` / home payload `lifecycle`:

- **active** before noon and while Drink It! is paused  
- **finale** at Friday 6:00 PM Ship Time (`read_only`, no new submissions)  
- **unconfigured** / **pre_cruise** when clock/config is missing or before Day 1  

## Local fixtures

Development-only seed inserts 50 `[DEV]`-prefixed challenges (`content_source = 'development-only'`). Source review text lives in `handoff/data/challenges/` and is **not** auto-approved production content (`Victory Dance` is photo-only in the seed).

Service-role fixture helper (never a player path):

```bash
# via integration tests / service client
dev_fixture_scavenger_completion(team_id, canonical_key, submitting_player_id, completed_at_utc)
```

Creates a `scavenger_dev_fixture` submission with `photo_storage_key = 'development-only/fixture-photo'` — labeled fixture only, not a fake media UUID accepted by future player submit.

Timed inspection: `dev_get_shipit_home_at(at_utc, player_id)`.

## UI

- `/shipit` — live Home progress + leaderboard  
- `/shipit/challenges` — 50-task list, All / category filter, completed cards inert  
- Unfinished cards show a clear “photo submission coming soon” notice — **no pretend completion**

## Remaining (blocked on shared photo pipeline)

- Player `submit_scavenger` with required staged photo + caption  
- Gallery posts / reactions for Ship It!  
- Admin void of scavenger completions  
- Production challenge content import (replace development-only seed)  
- Daily Challenge Claim It (separate Phase 4 track)
