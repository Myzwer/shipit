# Content readiness inventory — Phase 10A Gate 1

**STOP for production:** this document inventories source vs installed development content.  
It does **not** authorize production cruise activation, guest provisioning, or final creative catalogs.

| | |
|---|---|
| Baseline feature | `4a6ad60` (Phase 9A) |
| Checkpoint HEAD at Gate 1 start | `2f42b55` |
| Inventory date | 2026-11-07 |
| Purpose | Development preview + Visual Fidelity Agent handoff |

**Classification legend**

| Tag | Meaning |
|---|---|
| READY FOR DEVELOPMENT PREVIEW | Evidence + pipeline enough for local demo scenarios |
| REQUIRES CURATION | Source exists; needs human review / remapping before production |
| REQUIRES ORGANIZER INPUT | Private roster, photos, companion UUIDs, final Drink It! list |
| BLOCKED FOR PRODUCTION | Must not ship as live cruise content |

Do **not** conflate “file exists in `handoff/`” with “installed, playable DB content.”

---

## 1. Available source files (exact locations)

### Rules / UX / tech / UI
| Path | Role | Class |
|---|---|---|
| `handoff/01-Game-Rules.md` | Master rules | READY (reference) |
| `handoff/02-UX-Behavior.md` | UX contract | READY (reference) |
| `handoff/03-Technical-Spec.md` | Tech notes (may lag code) | REQUIRES CURATION vs migrations |
| `handoff/04-UI-Content-and-Icons.md` | Copy / icons | REQUIRES CURATION (visual agent) |
| `handoff/05-Cursor-START-HERE.md` | Onboarding | READY (reference) |
| `handoff/README.md` / `PHASE-0-NOTES.md` | Handoff meta | READY (reference; may be stale) |

### Beverage research
| Path | Role | Class |
|---|---|---|
| `handoff/data/menus/Star-Princess-Beverage-Source-Unmodified.md` | 13-bar printed cocktail evidence | READY FOR DEVELOPMENT PREVIEW |
| `handoff/data/menus/Star-Princess-Beverage-Display-Aliases.md` | Display parentheticals only (210 rows / 136 aliased) | READY (display layer) |
| `handoff/data/menus/Ingredient-Display-Alias-Lexicon.json` | Friendly aliases — **not** scoring synonyms | READY (display layer) |
| `handoff/data/menus/README.md` | Vintage / Good Spirits / shared-pool caveats | READY |
| `handoff/data/rankings/Cocktail-Bounty-Rankings-REVIEW-DRAFT.md` | Editorial cocktail tiers (review draft) | REQUIRES CURATION |
| `handoff/data/rankings/Ingredient-Bounty-Rankings-Bar-First-REVIEW-DRAFT.md` | Ingredient tiers (review draft) | REQUIRES CURATION |
| `handoff/data/rankings/README.md` | Ranking status | READY |

### Ship It! challenges
| Path | Role | Class |
|---|---|---|
| `handoff/data/challenges/Ship-It-50-Challenges-Source-REVIEW.md` | Authentic 50 titles + instructions | READY FOR DEVELOPMENT PREVIEW |
| `handoff/data/challenges/Scavenger-Hunt-Original-Source.docx` | Binary original | READY (source archive) |
| `supabase/seed/scavenger_dev_challenges.json` | Installed seed mirror (`[DEV]` titles) | REQUIRES CURATION → strip `[DEV]` |
| `supabase/migrations/20261105003000_phase4a_shipit_challenges_and_reads.sql` | DB seed of 50 challenges | REQUIRES CURATION (titles) |

### Achievements
| Path | Role | Class |
|---|---|---|
| `handoff/achievements/Star_Princess_Achievements_Interim_Cursor_Handoff_2026-11-06.md` | Interim 140-row source | READY (working, not final) |
| `content/achievements/workingCatalog.ts` (+ `.json`) | Machine catalog | READY FOR DEVELOPMENT PREVIEW |
| `scripts/load-working-achievements.mjs` | Dev loader | READY |
| `docs/WORKING_ACHIEVEMENT_CATALOG.md` | Loader contract | READY |

### Catalog schema / docs
| Path | Role | Class |
|---|---|---|
| `content/schemas/catalog-import.schema.json` | `full_snapshot` 1.0 / 1.1 | READY |
| `src/lib/catalog/validateCatalog.ts` | Structural + Princess Plus gates | READY |
| `docs/CATALOG.md` | Import / publish / readiness | READY |
| `docs/MENU_RECONSTRUCTION_AGENT.md` | External reconstruction contract | READY |
| `tests/fixtures/catalog/builders.ts` | **Fixture Cocktail N** schedule-ready builder | DEV fixture only — not authentic |

### Roster / Wrapped / Gallery / clock
| Path | Role | Class |
|---|---|---|
| `docs/ADMIN_ROSTER.md` | Auth + roster architecture | READY |
| `docs/WRAPPED_AND_AWARDS.md` | Finale / provisional awards | READY (provisional) |
| `docs/GALLERY.md` | Gallery / private media | READY |
| `docs/SHIP_CLOCK.md` | Ship clock | READY |
| `scripts/provision-local-identities.mjs` | 5 synthetic demo accounts | READY (synthetic) |
| Private organizer roster / Drink It! list | **Not in repo** | REQUIRES ORGANIZER INPUT |
| Private guest photos | **Not in repo** | REQUIRES ORGANIZER INPUT |

### Visual references
| Path | Role | Class |
|---|---|---|
| `handoff/design/original-final-mockups/` | Original mockups | READY (visual agent) |
| `handoff/design/latest-available-updates/` | Later comps | READY (visual agent) |
| `handoff/design/additional-screen-reference/` | Extra refs | READY (visual agent) |
| `docs/phase9a-screenshots/` | Current shell AFTER shots | READY |
| `docs/VISUAL_FIDELITY_AUDIT.md` | Phase 9A audit | READY |

### Seed / demo helpers (pre–Phase 10A)
| Path | Role |
|---|---|
| `scripts/seed-local-bounty-now.mjs` | Align clock + fixture catalog + schedule |
| `tests/helpers/bountyFixtures.ts` | `activateReadyCatalogAndSchedule` via `dev_activate_catalog_fixture` |
| `tests/helpers/nowAlignedCruise.ts` | Day/hour alignment for `development-only` |
| `tests/helpers/drinkitSubmit.ts` | `dev_submit_drink_at` helpers |
| `tests/helpers/achievementFixtures.ts` | Tiny test-only achievement defs |
| Dev RPCs | `dev_seed_cruise_clock`, `dev_activate_catalog_fixture`, `dev_generate_bounty_schedule`, `dev_seed_daily_assignments`, `dev_submit_drink_at`, `dev_submit_scavenger_at`, … — all gated on `cruise_config.label = 'development-only'` |

---

## 2. Content currently installed in DB (after typical local reset)

| Layer | Installed state | Class |
|---|---|---|
| Cruise | None until `dev_seed_cruise_clock` / provision scripts | — |
| Catalog | **None** until `dev_activate_catalog_fixture` / Admin publish. Typical seed uses **Fixture Cocktail / Fixture Ingredient** via `buildScheduleReadyCatalog` | DEV fixture |
| Bars in fixture | Synthetic (`wake-view`, `fixture-bar-*`, …) — **not** the 13 research bars | DEV fixture |
| Ship It! challenges | 50 rows, authentic instructions, titles prefixed `[DEV] …` | REQUIRES CURATION |
| Achievements | Empty until `npm run db:load-working-achievements` | READY when loaded |
| Roster | Empty until `npm run db:provision` (5 synthetic players / 2 teams) | READY synthetic; real roster REQUIRES ORGANIZER INPUT |
| Bounty schedule | Generated from active catalog + seed string | Depends on catalog |
| Wrapped awards | Provisional `test_only` defs from Phase 8 migration | READY for development-only only |
| Gallery / photos | Empty until gameplay / seed | — |

---

## 3. Content still using `[DEV]` / Fixture names

| Surface | Pattern | Notes |
|---|---|---|
| Ship It! challenge titles | `[DEV] The Piazza Grandeur`, … | Instructions already match handoff source |
| Cocktail / ingredient pools (when fixture activated) | `Fixture Cocktail 1…`, `Fixture Ingredient 1…` | Dominant player-visible Drink It! labels today |
| Unit tests | Assert `[DEV]` titles in places | Update with authentic titles |
| E2E catalogs | `supabase/seed/e2e-6b2-*.json` from fixture builder | Keep as test fixtures |

---

## 4. Authentic bars / drinks / ingredients (source evidence)

### Bars (13 researched game bars)
Good Spirits at Sea · O’Malley’s Irish Pub · Princess Live! · Bellini’s Cocktail Bar · Wheelhouse Bar · Crooners · Wake View Bar · Promenade Bars · Sea View Bar · Cascade Bar · Lido Bar · The MIX · Star Bar

### Cocktail evidence counts (from unmodified source)
| Metric | Count |
|---:|
| Cocktail **rows** (bar × drink) | 210 |
| Unique cocktail **names** | 110 |
| Unique names at **price-confirmed** bars | 91 |
| Unique names **only** at Good Spirits (unpriced) | 19 |

### Ranking draft (not auto-approved)
| Metric | Count | Notes |
|---|---:|---|
| Retained cocktail bounty candidates | 89 | Includes 10 provisional unpriced Good Spirits |
| Ranking ∩ verified-price bars | **79** | Enough vs **72** Cocktail slots if Good Spirits excluded from featured pool |
| Suggested cuts / unranked verified | ~12 | Regular logging OK; not featured |
| Ingredient objectives in V2 draft | 45 | Enough vs **39** if corroboration holds after Princess Plus filter |

### Caveats (must preserve)
- **Good Spirits:** all cocktails `unverified` price — never required for featured Cocktail Bounty; do not count toward Princess Plus ingredient corroboration.
- **Shared pool PDF:** Promenade / Lido / The MIX / Star — four game bars, one menu source; Star Bar least verified.
- Display aliases ≠ ingredients ≠ classification tags.
- Ranking drafts are **editorial**; code Master Rules bar bands differ slightly (e.g. ranking Elusive 2–4 vs code Elusive 2–3 → remap 4-bar rows to `hard_to_find`).

### Classification
| Item | Class |
|---|---|
| 13 bars + authentic cocktail names/recipes for logging | READY FOR DEVELOPMENT PREVIEW |
| ≥72 **strict** verified Cocktail candidates (exact $ ≤15) | **BLOCKED** — exact dollars not transcribed → **0** strict eligible (shortage 72) |
| ≥39 **strict** Ingredient corroboration | **BLOCKED** — **0** strict eligible (shortage 39) |
| Provisional demo Cocktail/Ingredient pools | READY FOR DEVELOPMENT PREVIEW only (78 / 44); **not launch-ready** |
| Onboard-verified production menus | BLOCKED FOR PRODUCTION until new photos + Menu Reconstruction Agent |
| Invented drinks / guessed prices / guessed tags | Forbidden |

---

## 5. Challenge names and categories

Source (`Ship-It-50-Challenges-Source-REVIEW.md`) matches seed keys and point bands:

| Category | Points | Count | Seed keys (stable) |
|---|---:|---:|---|
| Classic Ship Landmarks | 100 | 10 | `the-piazza-grandeur` … `guest-services` |
| Food & Drink Discoveries | 200 | 10 | `international-cafe` … `room-service-delivery` |
| Quirky Details & Hidden Artifacts | 300 | 10 | `carpet-compass` … `ocean-wake` |
| Interactive Crew & Activity | 400 | 10 | `the-cruise-guide` … `the-youth-club-entry` |
| Creative Team & Action Shots | 500 | 10 | `wind-tunnel` … `victory-dance` |

**Victory Dance:** source mentions “or short video”; installed seed is **photo-only** (correct for app). Keep photo-only wording.

**Classification:** READY FOR DEVELOPMENT PREVIEW after removing `[DEV]` prefixes. Stable keys unchanged.

---

## 6. Achievement readiness

| Metric | Value |
|---|---|
| Working rows | 140 |
| Enabled in development | 129 |
| `blocked_organizer` | 3 — D-082, D-083, D-085 |
| `blocked_metadata` | 8 — D-086…D-093 named companions (UUID map out-of-band) |
| `test_only` | All working defs remain `true` |
| S-017…S-048 challenge refs | Already map to seed canonical keys (`lotus-spa-zen`, `art-critic`, …) |

**Classification:** READY FOR DEVELOPMENT PREVIEW via `npm run db:load-working-achievements`.  
Named companions / D-082/083/085: REQUIRES ORGANIZER INPUT.  
Final creative catalog: BLOCKED FOR PRODUCTION.

---

## 7. Roster and team fixture status

| Item | Status |
|---|---|
| Synthetic provision (5 accounts, 2 teams) | Installed by `db:provision` |
| Older “nine-player” list | **Not authoritative** — do not assume |
| Real 22-guest roster | REQUIRES ORGANIZER INPUT (private local file) |
| Newer Drink It! participant list | REQUIRES ORGANIZER INPUT |
| Two Davids as distinct identities | REQUIRES ORGANIZER INPUT (approved display names) |
| Auth IDs / passwords in Git | **Forbidden** — `.local/`, env password only |

---

## 8. Visual references

Mockups under `handoff/design/` + Phase 9A screenshots under `docs/phase9a-screenshots/`.  
Phase 10A captures scenario screenshots for the Visual Fidelity Agent; **no visual redesign** in this phase.

---

## 9. Missing private organizer inputs

| Input | Needed for | Class |
|---|---|---|
| Private roster JSON (display names, game toggles, teams) | Realistic demo accounts | REQUIRES ORGANIZER INPUT |
| Drink It! participation final list | Membership | REQUIRES ORGANIZER INPUT |
| Ship It! team assignments | Team scores | REQUIRES ORGANIZER INPUT |
| Companion player UUID map | D-086…D-093 | REQUIRES ORGANIZER INPUT |
| Permissioned social photos | Gallery realism | REQUIRES ORGANIZER INPUT |
| Onboard menu photos / price checks (Good Spirits) | Production catalog | BLOCKED FOR PRODUCTION |
| Final Wrapped humorous awards | Production Wrapped | BLOCKED FOR PRODUCTION |

---

## 10. Evidence and validation gaps

| Gap | Impact |
|---|---|
| Ranking drafts ≠ approved pools | Must pass `previewCatalogImport` / server stage checks — no forge |
| Good Spirits unpriced | Shrinks featured cocktail / ingredient corroboration vs naïve ranking counts |
| Shared pool bars | Uncertainty flags required; not four independent menus |
| `dev_activate_catalog_fixture` historically schema **1.0-only** | Phase 10A must accept **1.1** for tagged preview catalogs |
| Fixture catalog still used by most integration helpers | Keep fixtures for tests; demo path loads authentic preview catalog |
| Beer/wine sections in source | Present for some bars; secondary to named-cocktail game |
| Technical Spec / README staleness | Prefer migrations + `docs/CATALOG.md` |

---

## Summary matrix

| Area | Development preview | Production |
|---|---|---|
| Authentic cocktail **logging** names (13 bars) | READY (after catalog activate) | BLOCKED pending onboard verification |
| Schedule-ready Cocktail pool (≥72 verified) | READY if import validates | BLOCKED |
| Schedule-ready Ingredient pool (≥39 corroborated) | CURATE + validate; report shortage if fail | BLOCKED |
| Ship It! 50 challenges (titles) | READY after `[DEV]` strip | REQUIRES final content sign-off |
| Working achievements (129) | READY (`test_only`) | BLOCKED (`test_only=false` forbidden here) |
| Demo scenarios A/B/C | READY (this phase) | N/A — development-only |
| Real roster / photos | Synthetic fallback | REQUIRES ORGANIZER INPUT |
| Visual redesign | Out of scope | Separate agent |

---

## Next independent Phase 10A work (this phase)

1. Build authentic development preview catalog from menus + rankings (no invention).
2. Strip `[DEV]` from challenge player titles; keep keys.
3. Load working achievements unchanged.
4. Private roster / photo input templates + `.gitignore`.
5. Three deterministic `demo:seed` scenarios with local-only safety.
6. `docs/DEMO_SCENARIOS.md` + tests + checkpoint update.
