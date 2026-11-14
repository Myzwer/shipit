# Phase S3 — Ship It! Challenges visual fidelity

Visual target: `handoff/design/additional-screen-reference/Ship-It-Challenge-List.png`  
Mockup point values (25/50) are placeholders; production badges use real 100–500 category points.

## Screenshots (402 × 874 unless noted)

| File | Notes |
|---|---|
| `before-402-viewport.png` / `before-402-fullpage.png` | Pre-pass baseline |
| `after-402-viewport.png` / `after-402-fullpage.png` | Post-pass |
| `after-360/390/430-viewport.png` | Responsive checks |
| `after-402-header-filter-category.png` | Header, compact filter, short category |
| `after-402-available-card.png` | Available challenge card |
| `after-402-completed-card.png` | Completed challenge card |
| `after-402-long-category.png` | Long category heading + badge |
| `after-402-filter-food.png` | Filter changed to Food & Drink |
| `after-402-bottom-scroll.png` | Near end of list above floating nav |
| `compare-before-after-mockup-402.png` | Side-by-side vs approved mockup |
| `measurements.json` | Automated layout checks |

Re-capture:

```bash
node scripts/capture-phase-s3-shipit-challenges.mjs
```

## Challenge-icon audit

| Question | Finding |
|---|---|
| Schema field? | `scavenger_challenges` has **no** `icon` / `icon_key` column |
| Seed / catalog? | `supabase/seed/scavenger_dev_challenges.json` keys are id, canonical_key, category, title, instructions, points, sort_order only |
| API payload? | `get_my_shipit_challenges` returns no per-challenge icon |
| Frontend renderer? | Cards hardcode `theme.ship-it` (Font Awesome `ship`) when available; `status.completed` when done |
| Distinct icons across 50 challenges | **1** content icon (`ship`) — all 50 reuse it *(superseded by Phase S4)* |
| Assigned individually or by category? | **Neither** in S3 — UI substituted one generic icon |
| Excess reuse | `theme.ship-it` used for every incomplete challenge |
| Follow-up | Phase S4 assigns per-`canonical_key` icons in frontend content (`docs/phase-s4-shipit-challenge-icons/`) — no schema change |

S3 did **not** invent icon assignments in the visual pass; S4 owns the content mapping.

## Category points badge

`points_per_challenge` is authoritative and uniform within each category (100 / 200 / 300 / 400 / 500 by category constraint). Badge is not misleading.
