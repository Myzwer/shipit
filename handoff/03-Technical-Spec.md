# Star Princess — Technical Implementation Specification

**Version:** 1.1 · Consolidated engineering baseline · November 4, 2026  
**Status:** Ready for Cursor implementation planning; **not** permission to replace the approved gameplay, UX, or mockups.  
**Product:** One private, mobile-first web application containing **Drink It!** (individual bounty competition) and **Ship It!** (team photo scavenger hunt).  
**Delivery priority:** A reliable seven-day family game that its organizer can enjoy rather than maintain. Favor correct results, minimal operational burden, and deterministic recovery over elaborate infrastructure.

> **Source-of-truth contract**  
> 1. Latest explicitly approved organizer decisions govern later changes.  
> 2. `01-Game-Rules.md` governs gameplay, validity, scoring, timing, ownership.  
> 3. `02-UX-Behavior.md` governs interaction, navigation, loading, error states, presentation.  
> 4. Final mockups and revisions govern visual design; their sample data are not real game data.  
> 5. **This document** governs implementation, storage, security, testing, and deployment.  
> Do not treat historical draft audits or old mockups as newer instructions. If source documents genuinely conflict, stop only the affected piece, report the conflict, and proceed with independent work. Do not silently reinterpret game rules.
> 6. `04-UI-Content-and-Icons.md` governs player-facing strings, accessible labels, and Font Awesome Pro icon assignments. It cannot override rule/behavior requirements.
> 7. `design/README.md` distinguishes the original mockup export from three later replacement screenshots, and notes that a promised newly re-rendered full ZIP has not yet been uploaded. Do not claim unseen image assets are included.

## 1. Executive decision record

| Concern | Selected implementation | Rationale |
|---|---|---|
| Frontend | **Vue 3 + TypeScript + Vite** | Familiarity, straightforward private SPA; no SSR requirements |
| Router | **Vue Router** | `/`, `/drinkit`, `/shipit`, `/admin` and internal routes |
| UI state | **Pinia** | Session, current game, wizard; avoid globalizing every local form field |
| CSS | **Tailwind CSS** with central semantic design tokens | Build from approved mockups, two theme variants |
| Backend | **Supabase** | Managed Postgres, Auth, private Storage, optional Edge Functions |
| Data | **PostgreSQL**, migrations, row-level security, transactional RPCs | Prevent duplicate/partial scores; enforce ownership and firsts |
| Authentication | **Supabase Auth**, preprovisioned accounts | Name dropdown + password without building a custom auth system |
| Media | **Supabase Storage**, private bucket, client-side optimization | One downloadable original-aspect optimized photo per post |
| Privileged HTTP tasks | **Supabase Edge Functions**, selectively | Admin Auth operations, catalog import/preview, signed media if useful |
| Authoritative game writes | **Postgres RPCs/functions in a single transaction per submission** | Strong consistency and uniqueness guarantees |
| Hosting | **Vercel** static SPA (Cloudflare Pages/Netlify are acceptable substitutes) | Simple continuous deployment; no dedicated app server |
| Code repository | One Git repo; one Vue application with shared modules | One auth system and one UX component system; two separate game scopes |
| Menu data | **Versioned database content; strict full-snapshot JSON imports** | Saturday catalog replacement without Git/Cursor/redeploy |
| Menu recovery reasoning | **External agent + human review**, not code in the app | Agent interprets menu photographs and ranks content; app validates structure |
| Cruise clock | **Server/DB time + centrally administered ship-time offset timeline** | All devices agree; manual adjustments and optional overnight schedule |
| Connectivity | Online submission only; **idempotent Retry** | No offline queue/sync engine; retain open form after errors |
| Development/testing | Supabase CLI/local DB; Vitest, Playwright, SQL integration tests | Test all 7 days, concurrent actions, failures, and catastrophic import |

**Not selected:** WordPress, React, Nuxt SSR, custom password databases, microservices, dedicated websocket infrastructure, public signups, push notifications, native mobile binaries, streaming uploads, real-time multiplayer sessions, general CMS for drinks, and full offline synchronization.

**Libraries:** Use current stable compatible releases at project initialization; lock versions in the package lockfile. Minimize dependencies. Suggested core: Vue, Vue Router, Pinia, `@supabase/supabase-js`, Tailwind, Font Awesome icons, Zod for JSON/input validation, Vitest, Playwright. A small query/cache helper is optional; do not introduce one without a demonstrated benefit. Do not hardcode package versions from this document.

---

## 2. System boundaries and request flow

```text
Player's mobile Safari/Chrome
  └─ Vercel: static Vue SPA + shared design system
       ├─ Supabase Auth: login / session refresh
       ├─ Supabase read APIs or narrow read RPCs: Home, Catalog, Gallery, Achievements
       ├─ Private Supabase Storage: direct scoped photo upload and permitted reads
       ├─ Transactional Postgres RPCs: submit / claim / react / mark-read / clock evaluation
       └─ Admin Edge Functions: user provisioning, catalog validation/import, privileged tasks

Supabase Postgres
  ├─ Membership, bar catalog, ranked bounty pools and fixed daily content
  ├─ Ship Clock timeline + seven-day adjustment plan + Drink It! pause state
  ├─ Shared active/played bounty slot ledger and per-player claims
  ├─ Immutable submission records, score sources, Gallery events and reactions
  ├─ Achievement definitions / awards / progress and unread cursors
  └─ Versioned catalog snapshots, imports, organizer audit log

Outside application (only when menus are inaccurate):
  Human photographs → prepared Menu Reconstruction Agent → complete JSON + review report
  → Admin import preview → atomic publish → app consumes revised future data
```

**Separation of responsibility:**
- Vue decides *presentation* and carries in-progress form state. It may display a countdown based on server-provided time, but **never decides final eligibility, points, exclusivity, or the cutoff**.
- Postgres decides *membership, current ship-day/slot, valid claims, scoring, first-to ownership, and submission ordering*. Use DB constraints and transactions for anything that must never race.
- Edge Functions handle tasks that legitimately need a privileged API key, secret, multipart processing, or orchestration. They must not separately implement a second scoring engine.
- A recovery agent interprets photographed menus and **produces data**. It cannot execute arbitrary DB writes or change rules.

**Deployment principle:** Content changes, team changes, ship-time changes, emergency skips, pausing, and menu imports require **no Vercel deployment**. Frontend/backend code changes still go through reviewed migrations and CI/CD.

### 2.1 Repository layout (recommendation)

```text
star-princess/
  README.md
  package.json / lockfile
  vite.config.ts / tailwind config or CSS theme file
  vercel.json
  src/
    app/                 # bootstrap, router, Pinia, auth guards
    components/shared/   # nav, card, pills, popup, progress, photo, skeleton
    themes/              # Drink It! / Ship It! semantic tokens
    features/drinkit/    # Home, five-step wizard, Daily, bounties
    features/shipit/     # team Home, challenge list, completion
    features/gallery/    # shared renderer and reactions, game-scoped queries
    features/achievements/
    features/wrapped/
    features/admin/
    lib/                 # Supabase client, typed API wrappers, formatting
    types/               # generated DB types and shared runtime schemas
  supabase/
    migrations/          # reproducible versioned SQL
    functions/           # narrow privileged Edge Functions
    seed/                # fake players and sample catalogs, never live secrets
    tests/               # DB constraints, RPC and concurrency tests
  tests/
    unit/ e2e/ fixtures/
  content/
    schemas/             # catalog-import JSON schema and examples
    source/              # original research (not production database state)
    samples/             # SMALL fake/test datasets
  handoff/
    01-Master-Game-Rules-v1.1.md
    02-UX-Behavior-Spec-v1.0.md
    03-Technical-Implementation-Spec-v1.0.md
    design/              # verified mockup exports and supplemental revisions
```

Generate TS types from the deployed/migrated database; do not let duplicate hand-written SQL and TypeScript interfaces drift. Use explicit `game` discriminators (`drinkit`, `shipit`) throughout.

---

## 3. Authentication, identity and authorization

### 3.1 Player login

- Admin provisions all accounts in advance with **Supabase Auth Admin APIs** (called exclusively from a privileged server environment). No public signup, verification email, invitation email, password-recovery page, or account profile editor.
- Present the user-approved **dropdown of known player display names** plus password. Maintain a safe mapping from a stable `player_id` / login alias to the corresponding Auth login identifier. Internal email identifiers can be application-owned, non-personal aliases; **never put Supabase secret/service-role keys or other users' passwords in the frontend**.
- On login, resolve the selected alias through an allowlisted public login directory (display name, login handle/identifier only) and call Supabase Auth sign-in with the password. Rejection is generic (“Name or password isn't right”), not an account-enumeration oracle.
- Disable open registrations and anonymous Auth sign-ins. Preconfirm Admin-created identities as supported by Supabase's Auth Admin API. Test actual login using these identities before production.
- Use server-enforced password limits and auth rate limiting; create unique nontrivial passwords, distribute directly to players. No plaintext credentials in Git, import packages, logs, or a client-readable `players` table.
- Persist Supabase refresh sessions in the standard SDK; do not demand reauthentication each morning. Handle expired sessions by returning to login without losing server-side saved posts. Logging out invalidates the local session and routes to Login.
- Supabase Auth ID is **not** the UI display name. `players.auth_user_id` is unique and references Auth. Player ID is stable even if display name or internal login identifier changes.

### 3.2 Membership, teams and admin

- `players` includes `is_admin` (or separate server-checked role). **Never trust a client-supplied admin flag**. Check organizer permission inside every privileged RPC/Edge Function, not just via router visibility.
- `game_memberships` controls each player's enabled game access. A Ship It! member must be assigned exactly one current team. Drink It! membership is not inferred from Ship It! membership.
- `/` only shows the two-game chooser to dual-game members; single-game users redirect into their assigned Home. Unauthorized direct URLs return to allowed game or a clear unavailable screen. Admin operations cannot be invoked via URL spoofing.
- The small game-switch icon opens the other game's Home without reauthentication, only when member of both.
- Ship It! team membership is fixed during normal play. Admin edits are possible before start or for corrections; never silently reassign historical submissions or past team points. Store the `team_id` of each accepted completion.
- Admin account creation/reset may be provided through one small protected Edge Function with server-side service key. Public SPA sees only the expected response; the key never leaves Supabase secrets.

### 3.3 RLS and least privilege

- Enable RLS on every game-owned table and explicit policies on private Storage. Normal players can read their game-scoped roster/leaderboard/activity but **cannot read another game's private Gallery by changing query parameters**.
- Regular players cannot directly `INSERT` scoring claims, modify their own `points`, grant achievements, create bounty slots, edit menu records, or call admin methods.
- Put sensitive mutations behind narrowly granted transactional RPCs that determine the acting player via `auth.uid()`. For `SECURITY DEFINER` RPCs, explicitly set `search_path`, schema-qualify relations, revoke broad `EXECUTE` privileges, and recheck game membership and role in the function body.
- For a private Storage bucket, grant only authenticated access consistent with gallery membership. Upload paths must be namespaced to the authenticated user; download/signed-URL generation must verify the caller's membership in the photo's game. Do not expose a public bucket simply because photos are for family.
- RLS is defense in depth; server functions must still validate all ownership, day, quota, and game-state conditions. Log privileged changes with admin ID and UTC time.

---

## 4. Database model (logical contract)

Use UUID primary keys unless a small `integer` is more appropriate for a fixed enumeration. Add FK constraints, nonnull checks, bounded enums, `created_at`/`updated_at` where relevant, and indexes on hot queries. Names below are recommended, not a demand to copy them byte-for-byte. **Do not replace this normalized core with unstructured JSON blobs.** JSONB is appropriate for versioned catalog snapshots and immutable display evidence, not for bypassing relational claim constraints.

| Group | Suggested tables / critical fields | Key guarantees |
|---|---|---|
| Identity | `players(id, auth_user_id, display_name, login_alias, is_admin, active)`; `game_memberships(player_id, game, enabled)` | Auth user maps to one player; no duplicate membership |
| Teams | `teams(id, name, color?)`; `team_memberships(player_id, team_id, active_from, active_to?)` | At most one active Ship It! team per player; historical submissions keep team ID |
| Game | `cruise_config(id, day1_ship_date, default_ship_offset_minutes, final_day=7, final_hour=18)`; `game_control(game, status, paused_at_utc, paused_by)` | One active config; Drink It! can pause independently; finale cannot be reopened |
| Clock | `ship_clock_events(id, effective_at_utc, offset_minutes, source, schedule_key, actor_id)`; `ship_clock_plan(day_number, delta_minutes, enabled)` | One stable effective adjustment per planned day; manual corrections audited |
| Bars/menu | `bars(id, canonical_key, name, deck, enabled)`; `drink_concepts(id, canonical_key, display_name, type)`; `bar_drinks(id, bar_id, drink_id, ...)`; `ingredients(id, canonical_key, display_name, family?)`; `bar_drink_ingredients(...)` | A drink offering exists at an exact bar; ingredient variants normalized without conflation |
| Catalog version | `catalog_versions(id, schema_version, base_version_id, payload_hash, manifest_json, status, imported_at, activated_at)`; `active_catalog_pointer`; `catalog_source_notes` | Only one active version; prior versions remain to explain historical records |
| Player corrections | `ingredient_corrections(bar_drink_key, ingredient_key, confirmed_by, source_submission_id, active)` | Exact bar + exact drink; duplicate confirmations idempotent; doesn't change tiers |
| Objective candidates | `cocktail_candidates(catalog_version_id, drink_concept_key, bar_key, tier, points, eligible)`; `ingredient_candidates(catalog_version_id, ingredient_key, coverage_count, tier, points, eligible)` | Imported classifications authoritative for **future** slots; uniqueness/nonrepeat enforced across versions |
| Rotations | `bounty_slots(id, game_day, category, slot_start_ship, slot_end_ship, current_offer_id, state)`; `bounty_slot_offers(id, slot_id, candidate_key, assigned_at_utc, replaced_at_utc, reason)` | One active offer per slot; retains skip/import history; no past slot rewrite |
| Fixed daily content | `bar_bounties(day_number, bar_id)`; `daily_challenges(day_number, title, instructions, ...)`; `scavenger_challenges(id, category, title, instructions, points, ordering)` | Exactly seven daily assignments and 50 Ship It! challenges by production launch |
| Submission parent | `submissions(id, idempotency_key, author_player_id, game, kind, team_id?, received_at_utc, ship_day, status, photo_id?, caption, display_snapshot_json)` | One accepted request key per author; immutable snapshots for historical Gallery/score |
| Drink-specific | `drink_logs(submission_id, bar_id, bar_drink_key?, custom_name?, generic_type?)`; `drink_log_companions(submission_id, companion_player_id)` | A log belongs to one bar; companions distinct and enrolled |
| Scored claims | `bounty_claims(id, submission_id, player_id, game_day, category, slot_id?, points, status)` | **Partial unique** valid claim per player/day/category; voids release the claim safely |
| Scavenger completions | `scavenger_completions(id, submission_id, team_id, challenge_id, points, status)` | **Partial unique** valid completion per team/challenge |
| Media | `photos(id, storage_key, owner_id, game, width, height, mime_type, byte_size, used_by_submission_id?)` | Only one photo per allowed submission; private uncropped source preserved |
| Social | `gallery_events(id, game, owner_player_id?, owner_team_id?, kind, submission_id?, achievement_award_id?, created_at_utc, active)`; `reactions(event_id, player_id, emoji)` | One reaction per player/event; no cross-game leaks |
| Achievements | `achievement_definitions(id, game, owner_type, visibility, exclusive, condition_type, condition_config_json, ...)`; `achievement_awards(id, definition_id, player_id?, team_id?, source_submission_id?, awarded_at_utc, status)` | One shared award per owner+definition; one active exclusive award per definition |
| Read states | `read_cursors(player_id, game, gallery_seen_at_utc, achievements_seen_at_utc)`; `wrapped_reveals(owner_id, game, revealed_at_utc)` | Separate dots per game; Wrapped reveal persists |
| Audit | `admin_audit_log(id, action, actor_id, target_type, target_id, before_json, after_json, at_utc)`; `import_jobs(...)` | Explain destructive/admin/data changes; idempotent imports |

Implementation can combine closely related tables where warranted, **provided every invariant above remains enforceable**. Avoid maintaining mutable “total score” as the only source of truth. Leaderboards can be computed as sums of active claims/completions (small cohort), with a cached view if profiling later demonstrates the need. If cached, derive from the canonical ledger and test invalidation.

### 4.1 Hard constraints / indexes

1. `UNIQUE(submissions.author_player_id, submissions.idempotency_key)`. Reuse of a key with a different payload must reject rather than overwrite the original action. A stable client-generated UUID is created **once per submission intent**, retained across retries.
2. Unique valid `bounty_claims(player_id, game_day, category)` for `status='active'` with a partial unique index. Daily Challenge occupies the fourth category, using the same one-per-day rule.
3. Unique valid `scavenger_completions(team_id, challenge_id)` for `status='active'`.
4. Unique active `achievement_awards(definition_id, owner)` for shared awards; unique active `achievement_awards(definition_id)` **for exclusive definitions**. Build the exclusion safely (one canonical unique winner row for exclusives or database constraint), not a best-effort application check.
5. Unique `reactions(event_id, player_id)`; `emoji` restricted to Heart/Laugh/Hang Loose enum.
6. Stable IDs for bars, canonical drink concepts, specific bar offerings, and normalized ingredients across catalog versions. Import **must not confuse a same-named drink at two bars** or create new IDs for unchanged objects.
7. Use foreign keys from claim records to actual slot/offer revisions so a later skip or import cannot change the interpretation of a previous claim.
8. Backed by server-side access checks, all voids transition a record to inactive/voided state without deleting evidence needed to recompute awards before finale.

### 4.2 Historical snapshots and versioning

A saved drink log keeps **bar name, drink name/type, selected companions, recorded menu/version identity, selected claims, awarded points, submission timestamp, and an optional ingredient/recipe snapshot** at time of acceptance. A later import may rename or remove that drink from the current picker but cannot silently rewrite what the player posted or earned.

Current catalog is versioned and replaces **future use**. Past menu versions, past slot IDs, and point values remain queryable. Player ingredient confirmations add a narrow enrichment overlay for current-and-future selection; they do not retroactively alter points, rarity, old screenshots, or earned achievements.

---
## 5. Server-authoritative Ship Clock and game lifecycle

### 5.1 Ship Clock representation

**Never use the phone's time, timezone, or current port to authorize gameplay.** A timer on the client is visual only. Every scoring read/write uses the same clock calculation driven by authoritative server UTC.

Implement the clock as an **anchored offset timeline**, not a `+1 hour` update to a mutable clock once per browser refresh:

- `base_ship_offset_minutes`: difference between server UTC and the ship's displayed local clock at a known reference instant, configured by admin before sailing.
- `ship_clock_plan`: seven optional daily deltas (`-120`, `-60`, `0`, `60`, `120` minutes). Each takes effect at **3:00 AM of the applicable ship-local cruise day**, computed using the offset **in force immediately before** that change.
- `ship_clock_events`: manual corrections, each with a real UTC effective instant and an incremental adjustment. A “Set Ship Time” operation calculates the necessary delta from the currently computed clock; future schedule changes add to that corrected baseline rather than resetting it.
- Effective offset at a UTC instant = initial offset + prior planned deltas + prior manual deltas. Recompute future plan effective UTC instants when an admin changes future settings. **Keep already-applied historical segments immutable.**
- Derive the *displayed ship date/time* and *cruise day number* from that timeline and the configured sailing-day anchor. A scoring day is the designated Day 1–7; a backward adjustment must not create an eighth day, repeat yesterday's daily quota, or reopen Friday after the finale.

**No cron dependency for clock correctness.** The read/submit path evaluates a deterministic timeline. The 3 AM scheduled change is a unique event with a stable `(cruise_id, day_number)` key; it cannot apply twice even if the displayed 2–3 AM hour repeats. Admin can inspect current computed ship time, upcoming changes, and manual event history. Test a forward and backward shift and two shifts in the same direction.

**Normal operation:** The organizer changes the schedule in advance and corrects unexpected ship announcements overnight. If an admin makes an adjustment during active hours, warn that visible timers may change; **preserve already-shown slot IDs, completed claims, fixed day numbering, and real submission ordering**. Do not silently reassign historical offers. Clock changes are not a way to reset attempts or extend Friday's hard stop.

### 5.2 Slots, grace and exact final deadline

- Day 1 = **Saturday**, Day 7 = **Friday**. Store the actual day-1 ship calendar date as launch configuration. Ship It! is available during the cruise starting Day 1, including before noon; Drink It! ordinary logging may happen at any time during the active cruise **except while Drink It! is administratively paused** and after finale.
- Drink It! Cocktail public slots on Days 1–6: **12:00, 13:00 … 22:00**, each 60 minutes, 11/day; Day 7: **12:00–17:00**, 6 slots. **72 theoretical slots.**
- Ingredient public slots Days 1–6: **12:00, 14:00, 16:00, 18:00, 20:00, 22:00**, 6/day; Day 7: **12:00, 14:00, 16:00**, 3 slots. **39 theoretical slots.**
- The featured Bar and Daily Challenge each have **one designated assignment per day** and may score only inside the Drink It! noon-to-daily-end window (and only once per player per category/day).
- Every rotating offer remains privately eligible for **15 minutes after the public end**, including 11:00–11:15 PM on Days 1–6. **No private grace at all after Friday 6:00 PM.** Public UI continues to show the newly current slot or “See You Tomorrow”; never reveal grace as a countdown or general hint.
- If during 15-minute overlap both previous and current objectives qualify in the **same category**, provide one choice; award at most one active claim in that category on that day. Never grant two Ingredient claims just because one drink has both ingredients.
- A slot cannot be claimed merely because a form was opened while it was active. Server checks actual qualifying **server receipt time** at submission. If eligibility changed, return a **recoverable eligibility-changed response** without partial writes, preserve Review, and show correct remaining options.

### 5.3 Accurate receipt-time semantics at the finale

At exactly **6:00 PM Friday Ship Time**, both games stop accepting **new** submissions, including unscored Drink It! logs. This is a hard server boundary and cannot be reopened.

- Complete image upload **before** sending the final scoring request; starting an upload at 5:59 is **not** equivalent to sending the actual submission by 5:59.
- Capture `received_at_utc` using a **database/server timestamp at the start of the scoring request**, before potentially expensive evaluation. The client-supplied timestamp is never authoritative. Requests that actually reach the scoring service before cutoff may complete after cutoff; requests reaching it afterward are rejected.
- A retry with the **same idempotency key** after cutoff returns the result of the already-accepted request if it was accepted earlier. A *new* request after cutoff cannot forge an earlier receipt timestamp.
- The final scoreboard should not publish a misleading half-complete snapshot while a small number of pre-cutoff accepted requests are still finishing. The UI may briefly show a “Finalizing results” loading state, then publish final calculations. Awards Mode and the three-tab UI appear at the deadline regardless.
- Finale status is **monotonic/latching**. A later manual clock correction cannot reopen submissions or admin voiding. No post-finale void, adjustment, rescoring, or claim repair is exposed.

### 5.4 Administrative Drink It! pause/resume

**New approved post-UX requirement:** One organizer-only global **Pause Drink It! / Resume Drink It!** control. It applies to **all Drink It! players**; it **does not pause Ship It!**.

- Pause takes effect immediately via server flag. Home and bounty cards show friendly paused messaging; **disable all Drink It! logging and Daily submissions, not merely point claims**. Reject any newly received Drink It! submission while paused with a specific resumable error.
- Existing saved logs, Gallery, achievements, and scores remain visible. Ship It! continues normally. Players in a form keep their draft in the live page on pause/rejection, but cannot submit until resumed; no persistent offline drafts required.
- Menu export, catalog preview/import, admin Add Drink and skip tools can remain accessible to organizer while paused; other normal players cannot import content. Require admin confirmation to pause or resume.
- **Resume is manual**, not scheduled at a guessed 2:00/3:00 PM. Restore normal access using the **current Ship Time slot**; do not shift future slot boundaries or Friday finale.
- Rotating objectives that were **never shown because the game was paused** are not counted as played and can remain unused candidate inventory. Windows missed while paused are **not backfilled** with retroactive scoring. The expected number of exposed slots may therefore be lower than the theoretical 72/39.
- To avoid ambiguity, define the activation/exposure ledger on the server: a paused interval does not mark slots played; an offer becomes “shown” when an authorized active read actually serves that slot to players, or when the server opens that slot for resumed play. Slot IDs and candidate reservations are durable and unique. After a large catalog rebuild, regenerate only allowable future/unshown assignments.
- Pausing does not alter Ship Clock adjustments, daily challenge schedule, actual ship day, or final 6 PM deadline. If still paused at the finale, the game still enters Awards Mode.

**Before-departure readiness:** Admin can pre-pause Drink It! before its first Saturday opening. This supports the organizer's planned menu reconnaissance without building a different onboarding flow. If menus match, resume normally. If not, import a revised dataset, verify, then resume.

---

## 6. Bounty candidates, selection, skips and eligibility

### 6.1 Pool content versus playing schedule

Keep these concepts separate:

1. **Catalog:** The available named drinks at specific bars and their known ingredients.
2. **Curated eligible bounty pool:** Imported candidate cocktails (each with one designated qualifying bar, oddity tier and fixed points) and ingredient objectives (normalized key, bar-coverage ranking and fixed points).
3. **Time-slot ledger:** The actual offers made to players at particular ship-local intervals, including skip history and any private grace overlap.

The external menu agent supplies **the catalog and rankings**. The application assigns **random, nonrepeating** candidates to future slots from that pool, with durable selections shared by everyone. It does not rerank novelty/rarity during gameplay, rely on a language model at runtime, or guarantee a jackpot tier. The initial schedule may be generated in one server-side operation; **it must not be re-randomized on page refresh**.

The server must track an offer as consumed for rotation purposes once **shown**, even if no player claims it. Candidate selection across new catalog versions respects stable keys for previously shown cocktail identities and ingredient objectives; no repeat by merely reimporting the item under a new version ID.

### 6.2 Eligibility checks — Drink It!

For a normal drink log, in **one authoritative transaction**:

1. Check authenticated identity, Drink It! membership, game not paused/final, legitimate bar, and alcoholic drink type.
2. Resolve named bar offering or permitted unlisted/generic entry. **No soda, water, mocktail** logging option.
3. Normalize supplied companion IDs: distinct, cannot include self, all enrolled in Drink It!. Physical presence and Bar Bounty companion eligibility are **honor-system claims**, not facial recognition or mandatory matching uploads. In particular, do not penalize one member just because companions in the same outing happened to press Submit earlier.
4. Resolve time-eligible offers (current and previous grace, if relevant) from the **server Ship Clock** and authoritative slot ledger.
5. Determine each category's eligibility based on exact drink and designated bar for **Cocktail**, named-menu ingredient association for **Ingredient**, and the day's featured bar + alcoholic beverage + eligible companions for **Bar**. A named item absent from the catalog may use approved unlisted-drink/missing-ingredient honor confirmation.
6. Remove already-used daily categories from selectable eligibility. Use imported point tiers for Cocktail/Ingredient and current valid companion count for Bar. Compute Bar points as **`min(95, 25 + 10 * N)`**, where `N` is the number of additional eligible people together as honestly reported; at least one companion is necessary to claim. No cross-account confirmation.
7. Compare the client's explicitly selected category/slot IDs to validated eligibility. **All eligible categories are preselected in the UI by default**; the user may deselect. Server must never auto-award a category omitted from the final selection. If an invalid selection is presented, return an eligibility-change response instead of silently awarding different points.
8. Commit log + elected claims + applicable player ingredient correction + achievement changes + Gallery events atomically, or roll back all DB scoring effects.

**Important:** Do not use different stored bar names or aliases as a loophole for designated Cocktail-Bounty location. Stable `bar_id` matching is mandatory. For a generic Beer/Wine/Other Alcoholic Beverage record, **only** ordinary logging/Bar eligibility applies automatically; it must not spontaneously qualify as a named cocktail or hidden Ingredient objective.

**Important companion nuance:** The master rules say a person who already used that day's Bar Bounty before the outing should not enlarge another group's multiplier. The UI does not collect the exact moment they ordered, and the honor system intentionally avoids synchronization. Store the selected qualifying companions as the submitter's assertion and calculate from it; do **not** infer the physical gathering sequence from who clicked Submit first. The human rule remains in the player-facing How to Play content.

### 6.3 Review state and submit confirmation

- The server supplies a **preview eligibility response** for Review, derived from authoritative current state. Vue displays selected/unselected/already-claimed states using the approved colors and labels.
- **All** eligible claims begin selected; none are earned until final submit. If any claim was deliberately unselected, show a single **“You have an unclaimed bounty available. Submit anyway?”** confirmation. No warning for zero eligible claims or when all remain selected.
- Review includes drink/bar, friends, photo preview or branded placeholder, caption or “No caption provided”. The final button is **Submit Drink**. Back to earlier steps recalculates and clears now-invalid selections.
- An optional photo **is not** a prerequisite for ordinary Drink It! logs. It **is** mandatory for Daily Challenges and Ship It! completions.

### 6.4 Missing drink / ingredient correction

- A player may submit a genuinely named **on-menu** alcoholic cocktail not present in the catalog. Collect only name and broad type, plus whether it contains the currently offered Ingredient objective. Do not ask for full recipe reconstruction, photos of a printed menu, or administrator approval.
- If an existing catalog drink at a particular bar lacks the active Ingredient objective, the Review link asks **“Does [drink] contain [ingredient]?”**. Confirming Yes makes that category eligible (provided other rules hold) and **on successful final submission** persists a narrow correction for that exact bar + drink + normalized ingredient. Repeat Yes from two users is idempotent.
- Player corrections must **not** modify historical logs, already awarded achievements, current point tiers, bar-count hints, or past/future bounty selection identities. Admin can remove an erroneous correction. Permanent bulk menu replacement supersedes base catalog details according to import rules; separately stored player corrections need a defined merge/review policy to avoid resurrecting an invalid ingredient.
- Admin Add Drink creates new normal logging/Ingredient eligibility content for one or more bars. It **does not automatically add a Cocktail candidate** to an already established rotation. Only the deliberate full-catalog recovery import can rebuild the curated future Cocktail pool.

### 6.5 Shared admin skip — current slot only

- Admin may **Skip Current Cocktail** or **Skip Current Ingredient**, after confirmation, while Drink It! is in an applicable active window. No Skip Bar or Skip Daily.
- Transaction chooses a random **unused and unallocated** reserve candidate of that category, stores it as a new offer revision for the **same slot**, and retires the skipped offer permanently from the cruise's rotation inventory. Time remaining and hidden grace follow the original slot boundary; future scheduled slots are unchanged.
- Retain already awarded points and past slot/offer audit records. Do **not** create a special grace claim for the skipped objective. Requests after skip must validate against the replacement or other legitimately eligible current/previous window, not the retired objective.
- Display **replacement candidates remaining** (not an arbitrary number of admin skip tokens). If none are available, disable the skip and explain why. Ensure concurrent admin taps cannot consume two reserves for the same skip intent.

---

## 7. Submission pipeline, atomicity and safe retries

### 7.1 One logical submit request

Use separate purpose-built server operations, all with a stable client-generated UUID idempotency key:

| Operation | Input (representative, not arbitrary client-trusted values) | Success |
|---|---|---|
| `preview_drink_claims` | bar, named offering/custom name/type, companions, optional ingredient confirmation | Current valid, already-used, and eligible category/offer choices with point previews; **does not score** |
| `submit_drink` | request UUID; bar/drink; companions; selected claim offer IDs; optional photo path; caption; optional confirmed missing ingredient | One immutable log, selected scoring claims, achievement awards and Gallery event IDs |
| `submit_daily` | request UUID; daily challenge ID; required uploaded photo; optional caption | One 50-point daily claim + Gallery/achievement changes |
| `submit_scavenger` | request UUID; challenge ID; required photo; optional caption | One team completion with fixed 100–500 points + Gallery/achievement changes |
| `set_reaction` | Gallery event + emoji or null | One stored reaction state for this account on this post |
| `mark_gallery_seen` / `mark_achievements_seen` | game + last actually loaded event/award cursor | Clear correct dot without hiding unseen concurrent events |

Do not accept `score`, `team_id`, `owner_player_id`, `ship_time`, `timestamp`, or `is_admin` from the client as authoritative. Server derives these. If the front end supplies a previously displayed points estimate, compare with server result; never trust it as the awarded number.

### 7.2 Transactional sequence

At final submit, the scoring RPC must:

1. Authenticate and derive `player_id` using `auth.uid()`, derive game membership/team, and evaluate pause/finale and server receipt timestamp.
2. Check whether `(author, idempotency_key)` already has a committed result. If yes, return **the original immutable result** (including originally earned achievement IDs); never score again. If same key has different canonical request payload, reject.
3. Acquire minimal consistent locks (e.g., a player/day claim lock; team/challenge lock where relevant) and validate actual current offers and unspent daily categories. Do not rely only on prior Review preview.
4. Verify uploaded photo authorization and requirements; photo must belong to this user's permitted upload path, have allowed media format, and not already back another submission.
5. Insert canonical submission, typed details, selected valid claims/completion, derived scores, resulting achievement awards/events, and correction overlay if used; maintain all-or-nothing DB transaction for these **DB effects**.
6. Return a structured receipt (`submission_id`, `received_at_utc`, `awarded_points`, `claimed_categories`, `gallery_event_id`, `new_achievement_ids`, optional `already_completed`) with no secrets.

For concurrent races, use DB unique indexes as the final guard. Database conflict is an expected **domain result** (“Already completed”) where appropriate, not a raw SQL error. Consistent lock ordering prevents deadlocks when a submit qualifies for multiple achievements.

### 7.3 Storage is not in the same DB transaction

Supabase Storage writes and Postgres writes are separate systems. Do **not** claim they can literally commit atomically together.

**Recommended user-visible all-or-nothing workflow:**
1. The mobile client optimizes the chosen image and uploads it to a **private, per-user staging key** (with retries as needed). The photo is **not** a public Gallery post yet.
2. The client calls its final submission RPC referencing that staged photo. The RPC validates the object/path and commits or rejects **all scoring and Gallery DB records together**.
3. If the RPC fails or the response is lost, the wizard remains open; the client retains the image or uploaded staged path and retries **the same request UUID**. No duplicate photo or scored row. If the first submit actually succeeded, return its saved result.
4. A small maintenance routine/admin engineering job may clean unreferenced staged objects after a conservative delay. **Never** delete media referenced by an accepted submission. Orphan cleanup is not a player-facing interface and need not block game launch.

For ordinary Drink It!, permit removing a failed image and submitting without it. Ship It! and Daily cannot submit until a valid photo is staged. If post-upload DB scoring fails, **don't falsely show success**. If the photo has already uploaded, do not force an expensive second upload on the next Retry.

### 7.4 Failure categories shown to players

| Domain code | Player behavior |
|---|---|
| `NETWORK_RETRY` / `TIMEOUT_UNKNOWN` | Keep Review, keep image/form, offer **Retry with same request key** |
| `PHOTO_UPLOAD_FAILED` | Keep photo locally, Retry upload; normal Drink It! may remove photo |
| `ELIGIBILITY_CHANGED` / `BOUNTY_EXPIRED` | Refresh Review choices and explain; do not silently drop selected points |
| `ALREADY_CLAIMED` | Show claimed status; permit valid unscored log or re-review as appropriate |
| `TEAM_CHALLENGE_DONE` | Tell teammate their team already completed it; no new score |
| `GAME_PAUSED` | Friendly paused message; stay on form, Retry after resume |
| `GAME_ENDED` | Friendly end message and route to Awards after acknowledgment |
| `SESSION_EXPIRED` | Prompt login; prevent accidental double-submit on return |
| `INVALID_MEDIA` | Explain format/size; retain other form choices |
| `UNAVAILABLE` | Keep loaded content if safe; allow retry; do not invent score or active bounty |

No successful save is acknowledged until the server returns an accepted receipt or a retry verifies the previously committed result.

---
## 8. Catalog content and Saturday menu-recovery import

This is a **critical resilience feature**, not a broad in-app menu CMS. The organizer plans to distribute bar-menu checks among family on Saturday, send menu photos to a prepared AI agent, and decide whether to use the original dataset or upload a fresh version. The agent handles menu interpretation; **the app only validates and publishes structured content**.

### 8.1 Normal operation versus rebuild

**Menus sufficiently accurate:** Keep playing from the original imported catalog. Minor differences use existing bar-specific ingredient confirmations, Admin Add Drink, or a current-bounty skip. No need to reclassify the whole game.

**Menus significantly inaccurate / holiday menus:** The organizer collects new photos from affected bars (including separate seasonal sheets). The external agent receives the **current exported catalog and played-slot status** plus those images. It treats **fresh, verified pages as authoritative only for the coverage they actually show**. Unphotographed or partially unphotographed offerings carry forward their prior data with explicit uncertainty in the report. It outputs:

1. **One complete replacement catalog JSON**: all bar identities, current known menu offerings, normalized ingredients, Cocktail candidate pool with one designated bar per bounty, Ingredient candidate pool with current rarity/bar coverage and point tiers, version/source metadata.
2. **One separate human-readable reconstruction report**: what changed; which photos support which menu entries; unchanged/unverified bars; seasonal additions; unsupported/unknown prices; ambiguities; candidate counts and any shortage; required human review.

The server **must not** perform OCR, AI classification, rarity recalculation, cocktail novelty scoring, or ingredient inference from the images. The agent does this upstream using the later **Menu Reconstruction Agent Brief**. Do not invent an LLM API dependency in the production app.

### 8.2 Stable import format — logical schema

Author and version a real JSON Schema in `content/schemas/catalog-import.schema.json` **before** building the importer. The following is the intended shape, not a full ready-to-use data file:

```json
{
  "schema_version": "1.0",
  "catalog_id": "star-princess-2026-saturday-audit",
  "base_catalog_id": "initial-catalog-v1",
  "mode": "full_snapshot",
  "source_notes": {
    "verified_bar_keys": ["wake-view"],
    "carried_forward_bar_keys": ["other-bar-key"],
    "uncertainty_flags": []
  },
  "bars": [
    { "key": "wake-view", "name": "Wake View", "deck": null, "active": true }
  ],
  "ingredients": [
    {
      "key": "orgeat",
      "name": "Orgeat",
      "aliases": ["almond syrup (orgeat)"],
      "family": "syrup"
    }
  ],
  "drinks": [
    {
      "key": "mai-tai",
      "name": "Mai Tai",
      "kind": "named_cocktail",
      "bar_offerings": [
        {
          "bar_key": "wake-view",
          "ingredient_keys": ["orgeat"],
          "display_ingredients": ["Orgeat"],
          "price_usd": null,
          "price_status": "unverified",
          "evidence_reference": "photo-or-source-id"
        }
      ]
    }
  ],
  "cocktail_candidates": [
    {
      "drink_key": "some-verified-cocktail",
      "designated_bar_key": "wake-view",
      "tier": "interesting",
      "points": 50
    }
  ],
  "ingredient_candidates": [
    {
      "ingredient_key": "orgeat",
      "known_bar_count": 4,
      "distinct_qualifying_drinks": 8,
      "tier": "hard_to_find",
      "points": 75
    }
  ]
}
```

**This snippet is intentionally illustrative and incomplete**: it must not be imported as production game data, and it deliberately leaves price unverified. The real schema must additionally require the actual candidate to exist, its bar offering to be valid, correct type/price eligibility, complete referenced keys, and enough future candidates. Seasonal-only drinks should have an availability marker if supported by the evidence. Store source **references**, not private user photos, in the importable menu JSON.

**Data safety:** The exported agent input includes the menu snapshot, stable identifiers, candidate pool, already-shown cocktail/ingredient keys, remaining slot counts, and current catalog version. It does **not** need player passwords, private photos, full rosters, or scores.

### 8.3 Agent-side classification (not runtime app logic)

- **Cocktail rankings:** `familiar` 25, `interesting` 50, `unusual` 75, `adventurous` 100. Based on recipe novelty/ingredients, **never alcohol strength**.
- **Ingredient rankings:** Rank primarily by the number of **distinct bars** carrying at least one qualifying named alcoholic cocktail with that ingredient; secondarily by distinct qualifying cocktails. Working tiers: 11–13 bars → 25; 7–10 → 50; 4–6 → 75; 2–3 → 100. A one-bar-only ingredient is generally excluded from the bounty pool. Merge aliases consistently; do not group materially different ingredients.
- **Named and priced:** Cocktail candidate must be a real named on-menu cocktail at its designated bar, and a qualifying offer must be confirmed within the Princess Plus **$15-or-less** limit. A confirmed over-$15 item is excluded from the bounty pool; **unknown price is flagged for review, not confidently treated as qualifying**. Wine, beer, and generic alcohol may remain in logging/Bar eligibility when appropriate, but do not become invented Cocktail or Ingredient candidates.
- **Limited hints:** Ingredient cards show count of known bars, not bar names or matching drinks. Picker does not display searchable recipe ingredient lists. Public Cocktail card may show truthful layperson glosses such as `Cointreau (orange liqueur)` where curated.
- The agent must be allowed to report **insufficient evidence** or **not enough candidates** instead of inventing filler ingredients or holiday cocktails.

### 8.4 Import/preview/publish contract

A small organizer-only Admin panel provides:

1. **Export Current Game Data** — downloadable JSON with current catalog and already-exposed objectives/remaining windows, safe for the agent.
2. **Import Replacement JSON** — phone file picker. Server checks authentication, organizer authorization, file size, JSON schema/version, base catalog version, cross-references and data type limits.
3. **Preview** — changed/new/retired bar offerings, ingredient aliases, candidate count and rank changes, unverified items, missing bar/menu coverage, conflicts with played candidates, number of remaining valid Cocktail/Ingredient offers, and whether the publish is safe.
4. **Publish** — explicit confirmation, one atomic database transaction that activates the new catalog and reassigns **only future/unshown eligible slots** as needed. All clients read the new active version after refresh; no redeploy.
5. **Rollback Catalog** — guarded emergency restore of the previous active version for future use only. Does not delete or rewind any legitimate logs, claims, achievements, or score history created under the more recent version.

**Required validation:**
- JSON schema valid, no duplicate keys, all bar/ingredient/drink references resolve, canonical identities don't collide, offered drinks truly belong to claimed bars, tier/point pairs are valid.
- Candidate eligibility and known prices are internally consistent. The app cannot verify the photographs; the agent's evidence report is for human review.
- Previously shown Cocktail identities and Ingredient objective keys are excluded from the future nonrepeating pool, even across catalog versions.
- Remaining future slots and reserves are **actually fillable** under nonrepetition. If not, **fail safe with a clear shortage report**; never silently invent drinks, reuse objectives against the rules, or auto-change scoring windows.
- Imports are **idempotent**, keyed by content hash/version. Reject attempts based on a stale `base_catalog_id` rather than overwriting an intervening organizer change; provide a re-export instruction.
- Preserve the *current active offer* until its natural slot expiration if importing mid-day, unless Admin separately skips it. Already exposed/past slots and awarded points do not change. If the import occurs Saturday before start while paused, there may be **no played slots**, so virtually the whole future pool can be rebuilt.
- Player-confirmed ingredient corrections persist as separate overlays. During publish, reconcile them only with still-valid matching bar/drink keys; flag conflicts in preview. Never silently attach a retired bar's ingredient correction to an unrelated new same-named drink.

**Important nuance:** Importing new Cocktail candidates for a full recovery is an **explicit administrative exception** to routine Add Drink not modifying the original rotation. The new import rebuilds future eligible rotations; an ordinary per-drink edit does not.

### 8.5 Scope limit

Do **not** build: in-app image parsing, photo-to-JSON AI prompts, an ingredient-rarity editor, a visual drag-and-drop rotation composer, a generic menu CMS, dynamic per-player menu classification, automatic holiday-menu monitoring, or GitHub commits on a player's phone. This feature is a strict **validated import/publish pipeline** and tiny manual correction tools.

### 8.6 Saturday launch procedure (operational, not app code)

1. Optionally pre-pause Drink It! before noon. Ship It! can start independently.
2. Ask assigned family members to photograph every page of the bars they check, including limited-time holiday inserts.
3. If menus broadly match, **do not import**. Resume the original game.
4. If they differ, give photos + export to the prepared agent; inspect both complete JSON and human report; ask for clearer photos where evidence is insufficient.
5. Import; review preview and any candidate shortage; publish; confirm live Cocktail and Ingredient cards; Resume Drink It! manually.
6. Continue normal play. The process should be rehearsed with deliberately bad sample menus before embarkation.

The Menu Reconstruction Agent's **separate future brief** must include the actual catalog schema and normalized ingredient/ranking methodology. Final photo-scanning results are **content work**, not a prerequisite for application coding.

---

## 9. Photos and file handling

- Exactly **one optional photo** for ordinary Drink It! logs; **one required photo** for Daily and Ship It!. No video or multi-image carousels.
- Optimize on the phone **before upload**, preserving aspect ratio and orientation. Starting target: longest side around **2000 pixels**, JPEG/WebP at suitable quality, with a pragmatic upload-size ceiling (e.g., around **3–5 MB optimized**). These are **initial engineering defaults** to test on actual iPhones and Androids, not permanent user-visible constraints.
- Verify camera capture, gallery selection, HEIC/HEIF conversion where necessary, iOS portrait orientation, poor connectivity, and oversized originals. If browser conversion cannot handle a format, show a useful format error rather than silently uploading an unusable file.
- Square Gallery/review thumbnails use **presentation-only crop** (`object-fit: cover` or equivalent). Save one good-quality **uncropped optimized** photo. Tapping opens a full-aspect viewer with **Download** in upper-right. Prefer download of that optimized original rather than tiny thumbnail. Photo storage stays private; accessible only to authorized game members using scoped storage policies/signed downloads.
- Preserve image choice during wizard steps, network retry, and temporary Safari backgrounding as long as the page survives. A full browser/tab discard does not require restoration.
- Store original filename only if needed; sanitize file names and metadata. Strip EXIF GPS when practical to avoid shipping personal location metadata in downloadable pictures. Never execute image processing from arbitrary uploaded content as code.
- Use bounded upload retries (not endless invisible background retries), progress/busy indicator, staged-file reuse for submit retry, and large touch-friendly Remove/Replace choices before submit.

---

## 10. Gallery, reactions and lightweight freshness

### 10.1 Scope and rendering

- The Gallery is game-specific: Drink It! displays only Drink It! logs, Daily submissions and achievements; Ship It! only team scavenger submissions and relevant awards. There is **no merged cross-game social feed**.
- **Everyone** is default. Drink It! **My Gallery** = entries authored by current player; Ship It! **My Team** = entries credited to current team, including other teammates' uploads. Use the shared approved visual renderer with game theme swapped.
- Newest-first stable ordering by `(accepted_at_utc DESC, event_id DESC)`, not client clocks. Use **keyset pagination** and ~**5 posts per page**, not an ever-growing unbounded query. Skeleton while loading, “End of Posts” when exhausted, truthful empty and error states.
- Posts include the immutable drink/bar/team/challenge snapshot appropriate to the game. Achievement announcements show titles/icons, but do not produce a **separate bounty-claim announcement** that spoils Ingredient locations.
- Gallery photo tap → full uncropped image viewer → Download icon. Ordinary Drink It! without photo displays the designed branded placeholder. Ship It! and Daily can never have a successful photo-less post.

### 10.2 Reactions

- Use exactly three codes: `heart` (❤️), `laugh` (😂), `hang_loose` (🤙). Enforce one reaction per account per event with a composite unique key.
- Tap same reaction to remove; another reaction to replace; show aggregated counts and current user's selection. Own posts can be reacted to. Reactions remain available after finale and **never change score or create notification dots**.
- Favor a small optimistic UI update. If server save fails, roll back the displayed count/selection and show a small retryable toast. Server checks membership in event's game.

### 10.3 Refresh and notification dots

- While Gallery is visible, **poll gently** (initial recommendation: roughly every **20–30 seconds**, configurable) and revalidate on foreground/reentry. Suspend polling in hidden tabs and avoid overlapping requests. Do not build mandatory WebSocket/Realtime subscriptions.
- If new posts arrive while reading/scrolled down, show **“N New Posts”** pill; don't jerk scroll to top. Opening the pill loads the new items and scrolls to top. Entering Gallery after own successful submission places the newly saved post first without a separate success screen.
- Gallery unread: **new activity submitted by another player** (including a teammate posting for Ship It!) or other owner's achievement announcements since the last successfully loaded **Everyone** view. Reactions/own posts never trigger a Gallery dot. Opening **My Gallery/My Team** alone does not clear it.
- Track the latest **actually delivered event cursor** when clearing Everyone, rather than blindly setting `last_seen_at = server_now()`. Otherwise a simultaneous incoming post can be accidentally marked viewed before it was shown.
- Achievement dot: newly awarded achievement for current player/team that this account has not viewed in **My Achievements**; popup dismissal **does not** clear it. For Ship It!, each teammate maintains their own read state even though the achievement belongs to the team. Game dots are independent. Binary dots only, not unread counts.
- On read errors, preserve the existing posts and indicators; don't erase visible content or falsely clear unread markers.

---

## 11. Achievement engine and exclusivity

### 11.1 Definitions as data, engine as code

Store actual achievement catalog as **structured definitions**, inserted later. Do not hardcode all names and thresholds into Vue components, but **do not implement a general arbitrary-code expression evaluator** either.

A bounded condition schema should cover:

- Event counts (all drink logs, category claims, Ship It! completions, awarded points).
- Distinct sets (bars, drinks, spirits/ingredient families, companions, challenge categories, cruise days).
- Exact-item matches (catalog drink, ingredient, specified challenge), with stable canonical keys.
- Same-submission combinations (e.g., multiple bounty categories claimed with one logged drink).
- Day/time conditions (before noon logs, particular cruise day), based on authoritative ship-time snapshot.
- Completion sets (all tasks in category, all bounty categories, collections).
- Composite `all` / `any` of **approved known condition types** with explicit nesting and evaluation-size limits.
- Exclusive **first-to** one condition / threshold.

Each definition includes `game`, `owner_type` (person or team), `group` (Milestones/Firsts/Other), `title`, `display_description`, `secret`, `exclusive`, `icon_key`, `condition_type`, and typed `condition_config`. Unknown condition types fail validation; Cursor must not invent substitute requirements. Counter progress for secret numeric achievements may show an unexplained `X/Y` per approved UX.

Only catalog-confirmed/recorded drink metadata can support spirit/ingredient statistics. Generic beer/wine/unlisted logs must **not** receive guessed rum/gin/tequila ounces. Any inferred alcohol units in a later creative catalog are clearly labeled estimates, not measured consumption. Avoid implementing achievements that incentivize rapid or excessive alcohol intake by default.

### 11.2 Awarding, multiple unlocks and replay after void

- On successful submission, evaluate affected definitions **in the same scoring transaction**, insert new awards once, create award Gallery events, and return newly awarded IDs to submitting client.
- If several unlock, Vue presents **one combined celebration popup** over the Gallery, with one-time light animation. Submitter only; teammates see unread Achievement dot, not an interrupting modal. Popup **See It/See Them** opens My Achievements; dismissal stays in Gallery. Don't replay popup on refresh.
- For an exclusive achievement, determine winner by earliest **valid accepted server receipt timestamp**, tie-break only on immutable submission ID when timestamps coincide for deterministic storage; the UI does not present this as a game tiebreaker. Use locking/uniqueness so only one active exclusive owner exists.
- Pre-finale Admin Void removes the invalid source and recomputes **dependent** achievement conditions and exclusives from remaining valid submissions, with appropriate Gallery event changes. For complex composite conditions, a small-scope deterministic recompute across the owner/game is preferable to fragile hand-maintained counters; roster is tiny.
- Preserve historical event evidence for audit. Never keep two exclusive winners after a regrant. No admin void/award reshuffle after Friday 6 PM.

### 11.3 Achievement display/reveal

- My Achievements = earned by player/current team, newest first. All Achievements = catalog grouped Milestones, Firsts, Other.
- Public unearned cards show requirement/progress but mask funny title. Secret unearned cards mask both title and condition; allow unexplained numeric progress for appropriate counters only. Completed cards show name/icon/time. Claimed-by-someone-else exclusive cards show actual owner and claimed state.
- At Friday 6 PM, all achievement **definitions** become publicly viewable even when unearned; preserve earned status and exclusive winner. Achievements grant **no score**.

---

## 12. Final Awards Mode and Wrapped

- Games finish automatically on Friday **6 PM Ship Time**, no admin switch. Update nav to **Wrapped/Awards, Gallery, Achievements**; remove Plus and active submission actions. Don't yank a player away from a photo viewer at precisely 6 PM—new navigation and writes become unavailable, while they finish viewing.
- `wrapped_reveals` tracks whether the current player (Drink It!) or **specific team viewer account** (Ship It!, to avoid one teammate spoiling another's intro) has pressed **Start**. The intro is shown once per account/game, not once per visit. One small nonlooping reveal animation is appropriate.
- Wrapped derives final statistics from immutable valid history, not frontend randomization or the user's reveal time. Separate personal/owner numbers, funny word cards, group awards, and final rankings. Display numeric 0 truthfully; if a category has no qualified winner, show **No winner**. Group superlative ties show all qualifying winners. Exact stats/quip content are later content configuration.
- The leaderboard uses points from actual claims/completions only (no achievement points). Competition ties share ranks **1, 1, 3**; to preserve visual incumbency, stable-sort tied participants by when they first reached the tied current total (then persistent display order), **not** by an invisible winner tiebreaker.
- Final Gallery and achievements remain readable/downloadable; reactions may still change. **No new Drink It!/Ship It! submissions and no admin edits/voids after finale.**

---
## 13. Organizer/Admin scope — deliberately small

Admin is in the **same SPA**, at organizer-only routes, linked below Home rules/account information. Reuse the visual component language rather than designing an unrelated dashboard. Guard on both client route and server role.

| Admin capability | Required actions | Intentionally omitted |
|---|---|---|
| Roster | Create account; reset password; enable/disable Drink It!/Ship It! membership; assign one Ship It! team | Public registration, self-service profiles, email recovery |
| Ship Clock | View server-calculated ship time/day; planned 7-day adjustments; ±1 h; set exact displayed time; confirm; history | Route tracking, port API, automatic location inference |
| Drink It! pause | Pause/Resume all Drink It! users; confirm; show current status | Auto-resume timer, pause Ship It! inadvertently |
| Emergency bounty skip | Skip active Cocktail or Ingredient from unused reserve; show count and impact | Editing past scoring, skipping Bar/Daily |
| Small menu fixes | Add named drink at selected bar(s), supply ingredients; remove erroneous user-added ingredient | Full in-app rarity editor or recipe CMS |
| Full catalog recovery | Export current menu/played-slot state; import strict JSON; preview/validate; publish; guarded rollback | OCR or AI inside the app; hand-written code deployment |
| Void before finale | Find accepted submission; preview score/achievement effect; confirm Void | Edit/photo replacement/bounty claim amendment; all post-finale voids |
| Diagnostics (minimal) | Current published catalog version; game/pause/finale status; DB connectivity; content readiness report | 24/7 operator control center, support tickets, public moderation |

**Server-side audit log** records each admin action. Destructive actions require one human confirmation; routine actions need not trigger several. Do not implement a production “Reset Cruise” control. Data clearing is a protected engineering launch command with environment guard and backup.

---

## 14. UI implementation contract for Cursor

Do not produce novel screen designs to compensate for missing mockups. The shared Vue component library should implement the **existing** visual design tokens and interaction patterns. Public game names and route spelling are fixed: **Drink It!**, **Ship It!**, `/drinkit`, `/shipit`.

### 14.1 Component/theme map

| Shared component or pattern | Drink It! use | Ship It! use |
|---|---|---|
| Header/game-switch | Teal/magenta scheme, title | Blue/gold scheme, team context |
| Floating bottom nav | Home, Log, Gallery, Achievements | Home, challenge list, Gallery, Achievements |
| Home sections | Four-card infinite swipe carousel; individual leaderboard | Category progress; team leaderboard with members |
| Wizard | Bar → Drink → Friends → Photo → Review | Task → Photo → Review using reused photo/review components |
| Daily submission | Separate did-it + required photo + review | N/A |
| Gallery renderer | Individual drink/Daily/achievement posts | Team challenge/achievement posts |
| Achievement cards | Player ownership | Team ownership |
| Popup | Combined achievement unlock, errors, confirmations | Same structure, recolored |
| Awards | Individual stats + shared awards | Team-specific stats/awards |
| Admin | Shared simple controls | Same Admin area, where applicable |

Use the supplied mockups as authoritative for typography, layout, gradients, rounded corners, shadows, pill treatments, and hierarchy. Existing design vocabulary includes **Bricolage Grotesque** for display typography and **Figtree** for body, subject to the actual exported design style sheet. Do not share or embed arbitrary licensed font files from unrelated sources. Use Font Awesome icons at consistent optical weight; screenshot glyphs are illustrative. **Don't replace the design with a generic Tailwind dashboard**.

### 14.2 Functional UI requirements

- **Home:** carousel swipes infinitely both directions without arrow buttons. All four cards have states: pre-opening, active, claimed, overnight/closed, and new **Drink It! paused** state. A tapped claimed card temporarily shows the currently available objective; interaction away conceals it. No public grace countdown.
- **Navigation:** tab changes, game switching, and intentional departure from unfinished wizard show Keep Editing/Exit confirmation. Earlier wizard steps are tappable; browser Back steps backward. Returning from another phone app doesn't intentionally discard the live form.
- **Drink picker:** bar sort alphabetically (default) / low-to-high deck; selected bar drinks searchable by **name only**, no recipe ingredient lists in picker; generic Beer/Wine/Other Alcoholic; unlisted fallback; selecting a row auto-advances.
- **Review:** all eligible claims prechecked. Allow deselect; warn only if an eligible claim left unchecked; already-claimed category is disabled. Missing Ingredient link opens one yes/no modal. Review shows actual uploaded image or placeholder, and explicit No caption provided when empty.
- **Submitted entry:** success navigates to the correct Gallery and reveals achievement overlay if earned; no generic success page. When multiple awards happen, one scrolling popup, not repeated popups. A failed submission stays on Review with Retry.
- **Ship It! challenge list:** all 50 grouped by five categories; category-only filter; full task title and instructions visible; entire unfinished card clickable; completed cards disabled and checkmarked. No completed-task detail screen. Home progress rows deep-link into filtered list.
- **Gallery:** Everyone / My Gallery or My Team pill, one reaction per post, five-at-a-time infinite loading, new-post pill without scroll jumps, uncropped photo modal with Download, independent game scoping and notification-dot behavior.
- **Achievements:** My and All views, secret vs public/unknown vs claimed states, exclusive winners, thresholds, one-time popup, and unviewed-dot clearing only upon My Achievements.
- **Awards:** Friday 6 PM automatic transition to three tabs; single new Wrapped Start intro, optional brief animation; persist per-account reveal; final results including ties and zero values; no post-finale scoring/editing.
- **Account:** identity info at bottom of Home, tiny Log Out and organizer-only Admin. No profile page. Game swap icon appears only for dual-game players.
- **Screen safety:** iPhone safe-area insets, font sizes comfortable for older users, large touch targets, keyboard avoidance, accessible focus/labels, long text expansion, loading states that don't shift primary buttons under the user's thumb, respect reduced-motion preferences.

**Accessibility implementation:** Semantic buttons (not clickable `<div>`), keyboard and VoiceOver labels for icon-only actions, visible focus indicators, adequate contrast in both themes, reduced motion for celebratory effects, and accessible feedback for validation errors. Keep photos behind alt text describing their post purpose rather than fabricated AI image descriptions.

---

## 15. Environments, deployment and operations

### 15.1 Environments and secrets

- At minimum, **local/staging** and **production** with **separate Supabase databases and Storage buckets**. Prefer a dedicated staging Supabase project if practical. Do not simulate the entire cruise against production score data.
- Store public Supabase URL/publishable key in Vite environment variables; the publishable key is not an admin credential and relies on RLS. Put secret/service-role keys only in secured Supabase Edge Function secrets or local excluded developer config. **Never** prefix a secret with `VITE_` or commit it to Git.
- Vercel runs the Vue static build and HTTPS. Add SPA fallback routing so direct visits and refreshes of `/drinkit`, `/shipit`, `/admin`, and deeper routes load `index.html` and let Vue Router enforce auth.
- Source control: feature branches, reviewed commits, reproducible migrations and seeds, no hand-edited production SQL except controlled recovery with a matching migration afterward.
- Use environment-specific game-config row and explicit seed/migration scripts; accidental staging-to-production publishing should be difficult.

### 15.2 Minimal observability

Log only information useful for support during one cruise: submission ID, UTC timestamp, game/kind, outcome code, exception category, DB function/version, import hash/version, pause/clock/admin action. **Never log passwords, Auth access tokens, private image bytes, or full user captions unnecessarily.**

Provide a quick admin diagnostic status: authenticated user, DB reachable, clock offset, today's ship-local date/day, game status, active menu version, active rotation counts. Keep detailed errors visible in Supabase/Vercel logs, not on Grandpa's screen. Basic error monitoring is sufficient; avoid adding another paid analytics service just for this.

### 15.3 Backup and after-cruise retention

- Back up the current catalog JSON and original game configuration before sailing. Keep a copy of the tested Menu Recovery Agent Brief and an example valid import file **locally on the organizer's phone and with a designated helper**, where practical.
- Before production starts, create an export/backup of database structure and seed data. Immediately before any catastrophic import, keep its previous catalog version available for rollback.
- After Friday, leave the finished game in **read-only-results mode for scoring**, with Gallery/achievements and authorized photo downloads available. **Do not add automatic data/photo deletion** without a separate user decision. Organizer may later export photos and then retire hosting manually.
- Consider paid Supabase service during the actual cruise after checking current limits, billing and any Free plan inactivity rules; don't base the reliability plan on a provider marketing price that may change. Verify network accessibility before departure.

### 15.4 Production reset and launch switch

- Build a **developer-only** reset/seeding command guarded by environment and explicit typed confirmation. It clears **test** submissions, claims, awards, reactions, cursors, fake participants and test media as specified, while preserving approved real accounts, actual team assignments, final content, and configured ship-time/clock plan. Do **not** expose this capability in the public/admin UI.
- Make a backup, perform the reset in production only after a successful full staging rehearsal, then run an automated “readiness/health” check before distributing login passwords.
- If clock/date and content are incomplete, production readiness should fail rather than silently use fake players, placeholder challenges, or wrong calendars.

---

## 16. Cursor implementation phases and acceptance gates

**Instruction to Cursor:** Work through these phases **sequentially**, providing a short implementation summary, commands run, test results, migrations added, and known failures after each. **Do not** start building every page in one unreviewable batch. Stop on genuine rule conflict or missing production decision; do not stop because final creative text/test players are not yet supplied. Use fake content only in development/staging.

### Phase 0 — Foundation and source freeze

**Implement:** Repo scaffold, Vue/Vite/TS/Tailwind, Vue Router, Pinia, two semantic themes, Font Awesome, shared UI components, Supabase local tooling, Vercel SPA routing, CI lint/typecheck/test. Copy authoritative rules, UX, all mockups and late-approved UX addendum into `handoff/`.

**Exit gate:** Both game Home shells follow their themes on mobile; routes/deep links work; no placeholder screen becomes a production feature; design token structure is documented.

### Phase 1 — Auth, player/team permissions, base schema

**Implement:** Versioned migrations, Supabase Auth pre-created user login directory, dropdown/password login, persistent session, membership guards, fixed team, game chooser/switch, tiny account controls, organizer-only Admin entry, initial RLS.

**Exit gate:** One-game user cannot read other game; dual-game user swaps without login; unauthorized `/admin` mutation fails from API, not merely by hidden link; full roster visible as appropriate.

### Phase 2 — Ship Clock, game configuration and content contracts

**Implement:** Server clock timeline + admin schedule/manual overrides, seven-day fixed calendar, status/finale latch, active/public slot generation and private grace, static bar/daily challenge seed content, JSON Schema and catalog import **preview** foundation.

**Exit gate:** Test ±1/2-hour overnight changes, repeated 2–3 AM period, Friday 6 PM cutoff, schedule edits, and a deterministic bounty read from two different phone time zones yielding identical results.

### Phase 3 — Drink It! scoring and wizard

**Implement:** Known bar/drink picker, deck sort, generic/unlisted fallback, companions, optional photo/review, automatic eligibility selection, Category claim unique indexes, atomic/idempotent `submit_drink`, current/previous grace evaluation, ingredient correction overlay, admin skip.

**Exit gate:** One ordinary log scores zero; single/multiple bounties award exactly selected categories; one-per-day enforced; duplicate click/retry earns once; bypassing UI cannot forge points.

### Phase 4 — Ship It! and Daily Challenge

**Implement:** 50 task list + category filter, team status/progress and scoring, required-photo submission, team-once uniqueness, Daily 50-point independent path, proper Gallery events and revocation before finale.

**Exit gate:** Two teammates simultaneously submit same task → one award; both teams can independently complete it; a missing photo cannot save; Daily remains distinct from normal drink wizard.

### Phase 5 — Media and Gallery

**Implement:** Optimized private photo pipeline, orientation/HEIC compatibility tests, staged uploads, idempotent retry, uncropped download viewer, branded Drink It! placeholder, game-specific Gallery, keyset pagination, 20–30 sec low-frequency refresh, reaction writes, new-post pills, unread cursors.

**Exit gate:** 1–2 minute simulated slow network and lost response don't duplicate a post/score; five-at-a-time loading works; Ship It! photos are mandatory; media cannot be downloaded by unauthorized game members.

### Phase 6 — Achievements and Awards Mode

**Implement:** Bounded achievement condition schema/evaluator, owner/team award writes, exclusive firsts, secret progress, multiple-unlock popup, team/member unread state, pre-finale void/recompute, Friday immutable finale, single Wrapped reveal with statistical/award templates.

**Exit gate:** Two concurrent First attempts yield exactly one winner; invalid source reassigns First before finale; no new write/void after Friday 6 PM; ties and zero results render as approved; reveal persists.

### Phase 7 — Admin operational tools and catalog recovery

**Implement:** Pause/Resume Drink It!, current-slot skip UI, Add Drink/removal of bad correction, secure player provisioning/password resets, **export current content/state**, import preview/validate/publish/rollback, plan/clock control, admin audit. Prioritize mobile file picker and legible preview; no rich CMS.

**Exit gate:** Start with outdated test menus; pause Drink It! without affecting Ship It!; import a fresh full snapshot after altering 3 bars; future pool and named drink picker update without deploy; prior posts/points remain correct; bad JSON publishes nothing; rollback works.

### Phase 8 — Seven-day rehearsal, content load and launch

**Implement:** Import final content only when supplied, no invented production fixtures. Configure actual roster/teams, game start date, seven Bar Bounties, seven Daily Challenges, 50 corrected photo-only scavenger tasks, actual Cocktail/Ingredient pools, achievement catalog, Wrapped definitions, and initial offset plan. Rehearse entire Saturday–Friday timeline in staging, including multiple simultaneous accounts, Sunday/Monday clock shifts, offline/retries, admin skip, menu replacement, and Friday finale. Reset *only* testing data under environment guard.

**Exit gate:** All acceptance matrix rows below pass; organizer can operate **pause, clock, skip, import** from a phone; all game actions work through deployed URL over real mobile data; no fake names/challenges in production; backup and rollback rehearsal complete.

### Phase 9 — Saturday operational choice (no engineering deployment)

Family menu scouts check bars and photograph any updated/holiday pages. If menus match, **play normally**. If not, pause Drink It!, run agent reconstruction, review the report, import and preview the file, publish, resume. **Do not use a CI/CD code push to solve stale menu data.**

---

## 17. Essential automated and manual test matrix

Each item below must have an automated test where practical, plus a manual touch/visual check for key paths. **Cursor should translate the approved UX acceptance journeys as well**, not replace them with only these engineering cases.

| ID | Test | Required result |
|---|---|---|
| T01 | Login as only Ship It! member; visit `/`, `/drinkit`, `/shipit` | Redirect to allowed game; cross-game data inaccessible |
| T02 | Dual-game player swaps games from a running session | Direct Home switch; no second login |
| T03 | Ordinary solo drink with no bounties | Valid Gallery post, 0 points, no false achievement |
| T04 | One eligible bounty; multiple eligible bounties | All eligible preselected; deselect warning; only selected score |
| T05 | Three selected claims with exact deadline overlap | Correct max one per category/day; no duplicate claims |
| T06 | Cocktail named drink at correct vs wrong bar | Only designated bar earns Cocktail points |
| T07 | Named menu ingredient at one bar; other bar same drink name | Correction affects only specified bar/drink |
| T08 | Two people confirm same missing ingredient simultaneously | One effective catalog association, both eligible if other rules met |
| T09 | Generic Beer/Wine/Other at featured bar | Only Bar may score; nonalcoholic entry impossible |
| T10 | Bar Bounty with 2/3/8+ total claimed companions | 35/45/95 point formula; honor system, no submission-order penalty |
| T11 | Slot expires 3 PM; submit 3:08 vs 3:16 | Prior offer claim allowed only until 3:15 |
| T12 | 10 PM final Days 1–6 slot at 11:05 vs 11:16 | Late claim until 11:15 only; public board already closed |
| T13 | Day 7 5:59:59 vs 6:00:00 actual server receipt | Earlier accepted; latter rejected, no grace |
| T14 | Clock schedule moves ship backward one hour overnight | Exactly one transition; no replay/duplicate day or objective |
| T15 | Admin manually corrects clock, later schedule delta applies | Manual correction retained; schedule additive, no revert |
| T16 | Pause at 11 AM Saturday; resume 2:15 PM | Missed rotations not retroactive; current 2 PM slot available; Ship It! unaffected |
| T17 | Skip Cocktail at 2:37 PM | Unused reserve replaces only current slot until 3; future unaffected |
| T18 | Concurrent requests same claim category or same team challenge | Exactly one active claim/completion under unique constraints |
| T19 | Save DB succeeded but HTTP response lost; Retry same UUID | One submission, original response returned; no duplicate points |
| T20 | Slow/failed photo upload followed by Retry | Review preserved; no half-scored entry; photo remains required for Ship It!/Daily |
| T21 | Invalid/game-forged/missing Storage object key | Server rejects; no public unauthorized photo write/read |
| T22 | 5 Gallery posts loaded then 5 more; new one while scrolling | Stable keyset, no jumping; new-post pill works |
| T23 | Heart → Laugh → remove on same post | At most one reaction; correct counts; no notifications |
| T24 | New teammate Ship It! post and team achievement | Gallery dot for other author's post; separate Achievement dot for team award |
| T25 | Combined three achievement unlocks | One popup with three results; one persisted award each |
| T26 | Two teams race for exclusive First; admin voids first before finale | Deterministic reassignment to next valid team |
| T27 | Friday 6 PM transition with open form and photo viewer | Submit disabled/rejected; photo viewer not forcibly closed; Awards mode active |
| T28 | Wrapped Start / revisit / tied top scorers / zero stat | One-time reveal, multiple winners, zero shown truthfully |
| T29 | Full catalog import changes 3 bars and adds holiday cocktails | Picker/rankings/future pool update; old logs and scores remain |
| T30 | Catalog import has invalid bar IDs, over-$15 candidate, short pool | Preview failure; no partial publish; explicit error summary |
| T31 | Catalog rollback after new valid submissions | Historical submissions remain intact; only future catalog changes |
| T32 | Ordinary Add Drink versus full recovery import | Add Drink never secretly enters Cocktail rotation; explicit import may |
| T33 | Admin void at 5:59 PM, at/after 6 PM | Valid pre-finale change; impossible afterward |
| T34 | Regular player calls admin/user-provision/import RPC directly | Hard-denied by server; no secrets exposed |
| T35 | Reload deep SPA URL and background/foreground Safari | Route restored, current server state refreshed, no unplanned sign-out |
| T36 | Production readiness with missing dates, teams, daily content | Fails with actionable missing data, not fabricated live placeholders |

**Rehearsal technique:** Use an isolated staging Supabase instance and a test-only controllable server clock/fake-time fixture, not the user's real phone clock. Do not ship that test-time override or public score-reset button to production. Test concurrent DB calls with genuine parallel requests, not just sequential simulated clicks. Test iOS Safari on physical iPhone(s), especially camera, HEIC, safe areas, keyboard and return-from-background behavior.

---

## 18. Production content checklist (intentionally not required to begin coding)

These are separate **content/configuration deliverables**, not blockers to writing migrations or building UI mechanics:

- [ ] Actual cruise ship-local Saturday date; Friday date and final 6 PM clock calculation
- [ ] Starting ship-time offset + best-guess seven-day 3 AM adjustment plan
- [ ] Real player roster, unique passwords distributed privately, game memberships, team names and assignments
- [ ] Reviewed bar names/decks and initial full menu catalog (known source and version)
- [ ] Ranked eligible Cocktail pool, designated bar for each, point tier, ingredient glosses and unplayed reserves
- [ ] Ranked normalized Ingredient objectives, bar coverage counts and no-repeat pool
- [ ] Seven fixed Bar Bounty bars and seven 50-point Daily Challenge descriptions
- [ ] All 50 Ship It! challenge descriptions and 100/200/300/400/500 category points; remove legacy video requirement
- [ ] Actual achievement definitions, funny titles, thresholds, public/secret/exclusive flags, icons
- [ ] Wrapped statistics, card quips and superlative definitions
- [ ] Prepared **Menu Reconstruction Agent Brief**, actual JSON Schema, valid sample import, Saturday menu-scout instructions
- [ ] Stage-tested pause + bulk import + resume workflow and backup/rollback
- [ ] Verify production config, Auth security, RLS policies, Storage permissions, deployment URL and reliable HTTPS

Where real content is missing, use clearly labeled **development-only fixtures**. Never put example scores, drinks, player names, challenge text or invented achievement conditions into final production as if they were approved.

---

## 19. Release acceptance, risk register and explicit non-goals

### 19.1 Definition of done

The game is ship-ready only when:

1. The approved UX journeys and test matrix pass in deployed staging and on real mobile devices.
2. Server enforces all key game invariants regardless of manipulated browser requests, duplicate clicks, or simultaneous teammates.
3. Photo uploads and retries can fail gracefully on poor Wi-Fi **without losing a submitted form or scoring twice**.
4. All seven Ship Clock days, clock changes, hidden grace, Drink It! pause, last-day 6 PM stop, and first-to races have been simulated.
5. Menu imports work from a **phone** without code changes; a 40% damaged-catalog rehearsal does not corrupt previously accepted play.
6. Real rosters/teams/daily content/achievement catalog are entered and verified; no fake production content remains.
7. Production backup, release/rollback procedures, Supabase plan state, and an organizer-or-helper recovery copy are in place.
8. The organizer can go on vacation without watching logs, moderating posts, or manually approving claims.

### 19.2 Main technical risks and mitigations

| Risk | Mitigation |
|---|---|
| Outdated on-board or holiday menus | Saturday scout process; pause; agent full-snapshot import; automatic validation; no deploy required |
| Ship's clocks change unpredictably | Central timeline; optional seven-day plan + manual corrections; DB receipt timestamps for ordering |
| Flaky ship Wi-Fi | Client compression; staged photo upload; idempotent scoring; visible Retry; no offline queue |
| Duplicate score / First race | DB unique/transaction/locking; source-of-truth ledger; concurrency tests |
| Cross-game family privacy | Membership-aware RLS and private media; gallery scoped by `game` |
| Pre-existing draft/production test content leaks | Separate staging; environment-guarded reset, readiness checks |
| Final catalog is not ready yet | Typed importer and fixture-first development; seed content after core is built |
| Last-day race between cutoff and processing | Server receipt timestamp; monotonic finale; finalize-in-flight results before publishing static awards |
| Spec drift in Cursor | Small phases, tests/exit gates, explicit source hierarchy, no UI invention |

### 19.3 Non-goals — do not implement unless explicitly requested later

General-purpose WordPress backend; chat/comments/DMs; player invitations; push notifications; public user profiles; real-time websocket stream; compulsory AI ingestion inside the app; true offline queue; server-side AI image recognition; video; post-submission editing; routine admin moderation; automatic menu price scraping; live cruise geolocation; points transfer; manual bonus points; player-initiated reset; test-time controls exposed in production; any after-final score edits; arbitrary achievement script execution; a custom auth framework.

---

## 20. Primary official technical references

Check the latest official docs before implementing provider-specific syntax, policies or pricing:

- [Supabase — Database functions, RPCs and function security](https://supabase.com/docs/guides/database/functions)
- [Supabase — Auth general configuration / disabling signups](https://supabase.com/docs/guides/auth/general-configuration)
- [Supabase — Users and Auth admin management](https://supabase.com/docs/guides/auth/users)
- [Supabase — Managing user data with public profile tables](https://supabase.com/docs/guides/auth/managing-user-data)
- [Supabase — Storage access control and RLS](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase — Edge Functions](https://supabase.com/docs/guides/functions)
- [Vercel — Vite SPA routing and deployment](https://vercel.com/docs/frameworks/frontend/vite)
- [Vue — Official tooling and documentation](https://vuejs.org/)
- [Tailwind CSS — Vite integration](https://tailwindcss.com/docs/installation/using-vite)

**Provider plan limits, exact API syntax, package versions and pricing can change.** This specification fixes the architecture and behavior; Cursor should verify current documentation when writing concrete migration/API/build code.

---

## 21. Final instruction to Cursor

> Build **one private mobile-first Vue application**, not two products, and implement the approved gameplay and Figma UI as written. Use Supabase Auth, Postgres/RLS/transactional scoring functions, private photo Storage, and Vercel static hosting. Do not infer scoring from device time, trust client-side points, permit duplicate claims, mix the two Galleries, or create new UX flows. Keep menus, candidate rankings, daily content, and achievements configurable without redeploy. Implement a small **pause + export/import/preview/publish** escape hatch for Saturday's potentially outdated menus. Follow the numbered phases with demonstrable tests. **Do not launch with placeholder content.**

**Separate next artifact (not code):** A precise **Menu Reconstruction Agent Brief** built against the final JSON Schema, with source-evidence instructions, normalization/rarity methodologies and two deliverables (complete JSON + human-readable report). Its absence does not block core development, but it **must be completed and rehearsed before sailing**.


---

## 22. Final handoff constraints (added for Cursor review)

- The initial Cursor interaction is **read-only comprehension and implementation review**. Do not modify files, install packages, execute migrations, create a repository, or write code until the organizer or supervising development chat explicitly approves a first phase.
- UI copy is centralized per `04-UI-Content-and-Icons.md`. The supplied wording is an accepted implementation baseline, not a mandate to build new UX around illustrative text. Error messages must prioritize clear recovery steps.
- Use the menu source data (`data/menus/`) as evidence/reference only. Its plain-language parentheses are **display labels**, not ingredient additions or aliases qualifying separately. The draft ranking files are **not** verified launch-ready pools.
- A rebuilt onboard catalog is generated and classified **outside** the app by an agent, then uploaded to the existing protected Admin import endpoint. The importer must validate complete dataset integrity and preserve historical state; it must not itself recalculate rarity or infer recipes.
- No production launch with sample users, unapproved Ship It! video instructions, missing Bar Bounty assignments, missing actual Ship Clock schedule/cruise dates, or placeholder final Daily Challenges.
