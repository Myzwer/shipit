# Wrapped Plan C — Compact Story Card Proportions

**Captured:** 2026-11-13  
**Live fixture:** plan-c-full (unchanged)  
**App:** `http://127.0.0.1:5173`

---

## Diagnosis

Featured cards locked at **543px** via `PeekCarousel.lockCardHeight()` (tallest photo slide). Inside that height:

| Mechanism | Effect |
|---|---|
| `.story-card__body.is-full .story-card__feature { flex: 1 1 auto }` | Hero band ate leftover height → huge gaps between intro / hero / support |
| `.story-card__body.is-double .story-card__reveals { justify-content: space-evenly }` | Double reveals spread across the card |
| `.story-card__body.is-short { justify-content: center }` in a 543px shell | Short stories floated in mostly empty panels |
| `min-height: 29.25rem` + large Polaroid (`17.5rem`) | Floor + photo intrinsic height kept every slide oversized |

Typography was fine; the container and vertical distribution were not.

---

## Changes

| File | Change |
|---|---|
| `WrappedStoryCard.vue` | Natural vertical stack with `gap: 0.85rem`; removed flex-grow / space-evenly distribution; center the composition as one group |
| `WrappedFeatureCarousel.vue` | `min-height` 29.25rem → 26.75rem; slightly tighter stage padding |
| `WrappedPhotoCard.vue` | Modest Polaroid width trim (`15.75→14.5rem`), tighter padding; keep square image + captions |

No carousel swipe/snap/peek changes, eligibility, copy, fixtures, clock, stats, leaderboards, or nav changes.

---

## Before / after card height (CSS px)

| Viewport | Drink It! (David) | Ship It! (Katie) |
|---|---:|---:|
| **402 before** | **543** | **543** |
| **402 after** | **457** | **457** |
| **360 after** | **457** | **476** |

Target for stat cards: ~430–470. Photo slides may be slightly taller; longest captioned Polaroids set the shared lock at **457** (402).

Screenshot pixel heights (card crops): **544 → 458**.

### Inter-group spacing (402, after)

Measured on David F.:

| Slide | intro→feature | feature→support | notes |
|---|---:|---:|---|
| DI-01 Your Week | 14 | 14 | natural stack |
| DI-04 Hangouts | 14 | 14 | natural stack |
| DI-07 Best Days | 14 | — | double-compact |
| DI-14 Early Birds | 14 | — | double-compact |

---

## Representative shots

Under `docs/qa/wrapped-plan-c-compact/`:

- Before: `before-*-402-*.png`, `BEFORE_MEASURE.json`
- After: `v2-*-402-*.png`, `v2-*-360-*.png`, `V2_MEASURE.json`

Required comparisons:

1. Drink It! Your Week — `v2-drinkit-david-402-DI-01.png`
2. You've Got Taste — `v2-drinkit-david-402-DI-02.png`
3. Your Hangouts — `v2-drinkit-david-402-DI-04.png`
4. Your Best Days — `v2-drinkit-david-402-DI-07.png`
5. Early Birds & Night Owls — `v2-drinkit-david-402-DI-14.png`
6. Photo card — `v2-drinkit-david-402-DI-03.png`
7. Ship dense single — `v2-shipit-katie-402-SI-01.png`
8. Ship double — `v2-shipit-katie-402-SI-04.png`

---

## Tests

| Command | Result |
|---|---|
| `npx vitest run tests/unit/wrappedPlanCSlides.spec.ts` | **PASS** — 38 tests |
| `npm run qa:wrapped-plan-c-coverage` | **PASS** — Drink It! 15/15, Ship It! 12/12 |

Fixture left intact (no reseed / scenario switch). Not committed.
