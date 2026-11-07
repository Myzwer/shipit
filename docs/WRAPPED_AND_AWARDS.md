# Awards Mode & Cruise Wrapped (Phase 8)

Post-finale experience for Drink It! and Ship It!. Authority: `handoff/02-UX-Behavior.md` §9, `handoff/03-Technical-Spec.md` §12, `handoff/04-UI-Content-and-Icons.md` §9.

## Finale source of truth

| Piece | Role |
|---|---|
| `finale_at_utc(cruise_config, …)` | Day 7 Friday **6:00 PM** Ship Time (config `final_hour` / `final_minute`) with iterative offset refine |
| `ensure_finale_latched(at)` | Monotonic `game_control.finalized_at_utc` for **both** games together |
| `get_ship_clock_state` / `ship_clock_state_at` | Player-facing lifecycle (`lifecycle: final`, `accepting_submissions: false`) |
| `drinkit_lifecycle_at` / `shipit_lifecycle_at` | Aligned to `finale_at_utc` (Phase 8) — no second cutoff clock |

No admin “end game” switch. No grace after 6 PM. Pre-cutoff accepted requests remain valid (idempotent replay).

## Awards Mode navigation

When the server reports finale:

- Bottom nav becomes **Wrapped · Gallery · Achievements**
- Wrapped is Home (`/drinkit/wrapped`, `/shipit/wrapped`)
- Log / Daily / Challenges / submit routes remap to Wrapped
- Gallery and Achievements are **not** forcibly interrupted at the cutoff
- Mid-form cutoff shows **The Games Have Ended** + **View Wrapped**

Frontend uses the shared `awardsMode` store (Ship Clock poll ~15s). Device local time never authorizes Awards Mode.

## Wrapped reveal storage

Table: `wrapped_reveals (player_id, game, revealed_at_utc)`  
PK: `(player_id, game)`.

- Per **viewer account** × game (Ship It! teammates do **not** share a reveal flag)
- RPCs: `get_my_wrapped(game)`, `reveal_my_wrapped(game)` (idempotent)
- Membership required; no cross-game access
- Reveal does not change scores, achievements, Gallery, or leaderboards

## Canonical results

| Game | Owner | Stats from |
|---|---|---|
| Drink It! | Player | Active `bounty_claims`, accepted `drink_log` / `daily_completion` submissions, companions, achievements |
| Ship It! | Team | Active `scavenger_completions`, team achievements |

Leaderboards:

- Drink It!: `drinkit_player_score_rows` → ranks **1, 1, 3** (`get_my_drinkit_leaderboard` / Wrapped)
- Ship It!: existing `shipit_team_score_rows` (reused)
- Secondary order is visual only (first claim / completion time) — not a competitive tiebreaker
- No achievement points; no team-size multiplier

## Group awards (TEST / PROVISIONAL)

Table: `wrapped_award_definitions` — seeded Phase 8 rows are clearly `[TEST]` / `[PROVISIONAL]`.

Selection rules: `max` | `min` | `complete_all`. All tied winners returned. All-zero max → **No winner** unless `allow_zero_win`. Genuine personal zeros display **0**.

### Later creative content still needed

Organizer must supply final:

- Award titles, quips, and which metrics count as superlatives
- Personal named-result cards (favorite liquor / ingredient style jokes)
- Section flavor copy beyond the approved structural headings
- Whether any zero-stat awards are intentionally meaningful

Do **not** invent the final humorous catalog in product code. Edit source-controlled definitions (migration seed or content file) before launch.

## Achievement finale

Existing `achievement_is_finale` / list RPCs unmask secret titles and public funny titles after finale. Opening Wrapped does not grant awards. Working catalog remains `test_only`.

## Gallery after finale

Reactions (`set_gallery_reaction`) stay open. No new activity submissions. No Wrapped announcement posts.

## Development rehearsal

```bash
npx supabase db reset
LOCAL_TEST_PASSWORD='…' npm run db:provision
npm run db:seed-bounty-now
# optional: npm run db:load-working-achievements
LOCAL_TEST_PASSWORD='…' npx vitest run --fileParallelism=false tests/integration/wrapped.phase8.test.ts
LOCAL_TEST_PASSWORD='…' npm run test:e2e:phase8
```

Timed RPCs: `dev_get_my_wrapped_at`, `dev_reveal_wrapped_at` (service_role + `development-only` cruise).

## Out of scope (still)

Final humorous award catalog, production achievement publish, deployment, visual fidelity pass, social share/export.
