# Wrapped Carousel — End Card Centering Fix

**Captured:** 2026-11-13  
**Scope:** Shared `PeekCarousel` (Drink It! + Ship It! Wrapped)

## Cause

Non-loop Wrapped carousels apply a negative `margin-right` (peek overlap) on every slide, including the last. That reduced `scrollWidth` so `maxScrollLeft` fell short of the true center offset by exactly the overlap amount. The final card could not snap into the same centered position as middle cards.

## Fix

In `src/components/shared/PeekCarousel.vue`:

```css
.peek-slide:last-child {
  margin-right: 0;
}
```

Neighbor peek still uses negative margin on all preceding slides. No one-off last-slide transform. Looping Bounty carousels also benefit (last DOM child is the trailing clone).

## Verification (David F. / Katie, plan-c-full)

| Width | First Δ L/R | Mid Δ | Last Δ | Last L / R (402 Drink) |
|---:|---:|---:|---:|---|
| 360 | 0 | ≤1 | ≤1 | — |
| 390 | 0 | 0 | 0 | — |
| 402 | 0 | ≤1 | **0** | **44 / 44** |
| 430 | 0 | ≤1 | ≤1 | — |

- Prev from final slide → `14 / 15` (Drink) / `11 / 12` (Ship)
- Live CSS: first margin `-40.2px`, last margin `0px`
- `scrollLeft === maxScroll` on final slide
- `tests/unit/BountyCarousel.spec.ts` — 8/8 pass

Artifacts: `docs/qa/wrapped-carousel-end/` (`recheck-402-last-viewport.png`, `ALIGN_REPORT.json`)

Uncommitted.
