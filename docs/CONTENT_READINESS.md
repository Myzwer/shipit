# Content readiness — Phase 10C

Organizer-approved researched menus + rankings remain the intended launch content.  
Phase 10C strengthens Category B offering identity, completes printed→canonical ingredient mapping, and documents achievement evidence coverage. **No production activation.**

| | |
|---|---|
| Launch-candidate catalog | `content/catalogs/launch-candidate-v1.json` |
| Category B offering set | `content/approvals/filtered-source-offerings-v1.json` (191 fingerprints) |
| Printed ingredient map | `content/catalogs/printed-ingredient-map-v1.json` |
| Achievement coverage | `docs/ACHIEVEMENT_EVIDENCE_COVERAGE.md` |
| Reconciliation | `docs/CANDIDATE_RECONCILIATION.md` |

## Inventory

| Metric | Count |
|---|---:|
| Game bars | 13 |
| Offering rows | 210 |
| Unique cocktails | 110 |
| Category B offerings (fingerprinted) | 191 |
| Category C (Good Spirits) | 19 |
| Canonical ingredient definitions | ~111 |
| Ingredient Bounty objectives | **44** (Basil excluded) |
| Cocktail eligible | **79** (+10 GS pending) |
| Printed tokens mapped / unknown | 212 / 8 |
| Slot targets | 72 / 39 — met |
| Working achievements | 140 unchanged |

## Private roster (still required before provisioning)

Contract: copy `private/roster.example/roster.template.json` → `private/roster/roster.local.json` (gitignored).

Must represent: all **22** final guests, final Drink It! participation, Ship It! memberships, real team keys, **two distinct Davids**, optional companion UUID map out-of-band.  
**Not yet supplied** to this workspace — demos keep synthetic accounts.

## Runtime gate

Local Docker/Supabase demo scenarios remain **PENDING** when the daemon is inaccessible. Commands: `docs/DEMO_SCENARIOS.md`.
