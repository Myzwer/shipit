# Gate A — Drink It! Results

## Cocktail Bounties

| Area | Result |
|---|---|
| Schedule ledger 72 slots | PASS (init) |
| Hourly noon–5pm resolve days 1–4 | PASS |
| Designated bar ≠ Mobile Order | PASS (sampled) |
| Points/tier present on active cards | PASS |
| Claim with companion + `offer_id` | PASS (supplemental) |
| Claim without `offer_id` → `ELIGIBILITY_CHANGED` | Observed (harness lesson, not defect) |
| One-per-day second cocktail | Attempted in voyage; blocked when first claim missed due to missing `offer_id` |
| Early pre-window claim | Attempted day 1; same offering lookup issue in first voyage pass |
| Grace public rotation after hour | PASS days 1–4 (public payload rotates; grace is claim-scoped) |
| Friday cutoff overrides | PASS (finale latch) |

## Ingredient Bounties

| Area | Result |
|---|---|
| Schedule ledger 39 slots | PASS |
| 2h windows active days 1–4 | PASS (triaged; points/tier/`ingredient_key`) |
| Rarity/tier + known_bar_count fields | PASS (shape proof) |
| Claim with confirm + offer_id | BLOCKED in Gate A (catalog offering join schema in harness) — engine covered by legacy integration |
| Days 5–7 after unsafe catalog swap | FAIL via FINAL-A-CAT-001 |

## Bar Bounties

| Area | Result |
|---|---|
| Seven-day physical sequence | PASS |
| Daily active bar resolve | PASS all 7 days |
| Crew list Admin RPC | PASS |
| 3/4-member scoring / solo reject / noncrew | Covered by prior B2/B4 integration; not fully re-matrixed in Gate A voyage loop |

## Daily Challenges

| Area | Result |
|---|---|
| Seven approved defs present | PASS (Tequila Shot … Miami Vice Finale) |
| All Hands vs Bring a Friend modes | Present on rows |
| Timed submit attempts | INFO — responses recorded; attestation/photo constraints limited accepts in this harness |

## Cross-cutting

Idempotent drink replay family exercised during voyage (PASS). Scored claim vs ordinary log proven in supplemental cocktail claim (points on selected category).
