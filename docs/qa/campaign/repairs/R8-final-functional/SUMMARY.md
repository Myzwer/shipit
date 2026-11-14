# R8 — Final functional defects & edge cases

**Branch:** `visual/drinkit-home-v1`  
**Baseline:** `c9346e9` (R1–R7 integration checkpoint)  
**Worktree:** Main `/Users/josh/Documents/Web Projects/Vue/Ship It`  
**Disposable:** Agent 1 Supabase `:55321` only  
**Protected:** Organizer `:54321`, Agent 2 `:56321` (untouched)

## Verdict

Every R8-associated REP group is repaired, disproved/harness-only, or explicitly accounted for. **No P0/P1 functional defects remain open from the R8 backlog.** REL-006 is no longer an expected-red unit contract.

| REP group | Original IDs | Outcome |
|---|---|---|
| **REP-MIME-001** | REL-006 | **Fixed and verified** — empty/generic MIME + `.gif` (and other denylisted extensions) rejected |
| **REP-CLAIM-001** | E2B-002 | **Disproved / harness-only** — product awards cocktail correctly; stress assertion used `.includes('cocktail')` on object-shaped `claimed_categories` |
| **REP-PREVIEW-001** | DEF-QA1-001 | **Fixed (contract)** — `not_featured_bar` is correct priority; companion reason would mislead at the wrong bar |
| **REP-CRW-001** | INT-CRW-001, RISK-ADM-B | **Fixed and verified** — Admin crews no longer auto-generate/lock on mount; explicit confirm required |
| **REP-CLK-001** | INT-CLK-001, RISK-ADM-A | **Fixed and verified** — past-finale Set Ship Time requires extra acknowledgement checkbox |
| **REP-CAT-ERR-001** | INT-CAT-007 | **Fixed and verified** — malformed scalar Postgres errors map to `failed`/`invalid_payload` |
| **REP-AUTH-001** | INT-AUTH-001 | **Deferred with justified impact** — JWT residual until expiry is Auth design; `signOut({ scope: 'global' })` + documented hygiene |

## Confirmed defects repaired

1. Empty/generic MIME GIF (and BMP/PDF/…) bypassed format gate → JPEG upload path.
2. Opening Drink It Admin crews auto-locked the day without intent.
3. Set Ship Time past finale had only a generic confirm (no irreversible-latch warning).
4. Catalog stage returned ambiguous `unknown` for raw Postgres scalar syntax errors.
5. DEF-QA1-001 contract expected a companion reason when location already blocked Bar.

## Findings disproven / reclassified

- **E2B-002:** Not a scoring race. Authoritative submit with cocktail selected returns `claimed_categories: [{ category: 'cocktail', … }]` and points. Empty cats after submit with `selected_claims: []` is correct ordinary-log behavior. Stress harness false-failed via string `.includes` + optional deselect click on `data-state=selected`.

## Application files changed

- `src/lib/media/constants.ts`, `src/lib/media/processImage.ts`
- `src/features/admin/BarBountyCrewsSection.vue`
- `src/features/admin/ShipClockSection.vue`
- `src/lib/shipClockFormat.ts`
- `src/lib/adminCatalogImport.ts`
- `src/stores/session.ts`
- `src/ui/copy.ts`
- Harness: `scripts/qa2b/run-stress.mjs`, `scripts/qa2b/investigate-bounty-flakes.mjs`, `scripts/qa2b/repro-e2b-002-claim-categories.mjs`
- Tests: processImage qa2, shipClockFormat, ShipClockSection, BarBountyCrewsSection, adminCatalogImport, scoring closeout contract

## Evidence

| Check | Result |
|---|---|
| QA-2 reliability (incl. REL-006) | **PASS** (no remaining expected-red in this suite) |
| Combined R8-affected unit slice | **393 passed / 38 files** |
| `vue-tsc` typecheck | **PASS** |
| `npm run build` | **PASS** |
| E2B-002 triage on `:55321` | Product OK / harness false-fail — `evidence/e2b-002-triage.json` |

## Remaining expected-red unit contracts

**None** from the pre-repair known-failure unit list. REL-006 is green.

## Remaining P0 / P1

None from R8. Pre-existing launch **configuration** items (roster, catalog republish, organizer migrations, companion UUID map, physical-device HEIC) remain ops/content — see `OPEN_ITEMS.md`.

## Safety

- No push / deploy
- No organizer DB mutation
- No Agent 2 `:56321` mutation
- Never set `QA_ALLOW_ORGANIZER_MUTATION=1`
- Unrelated local files preserved (`all-stats-preview.html`, `src/dev/`, wrapped coverage JSON)
