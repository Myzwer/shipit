# Phase V5 — Achievement unlock celebration motion

Frame sequences + short WebM recordings for organizer review.

## Durations

| Piece | Timing | Easing |
|---|---|---|
| Backdrop fade | 180ms | `ease-out` |
| Card entrance | 300ms | `cubic-bezier(0.22, 1.35, 0.36, 1)` (subtle overshoot) |
| Icon pop (single) | 560ms @ 70ms delay | springy ease-out |
| Icon pop (multi) | 620ms, slightly stronger | springy ease-out + tiny rotate |
| Starburst (6 rays + halo + 3 sparks) | ~520–600ms | ease-out / soft expand |

Reduced motion: backdrop may fade ~120ms; no scale/bounce/starburst.

## Recapture

```bash
LOCAL_TEST_PASSWORD='…' node scripts/capture-v5-achievement-celebration.mjs http://localhost:5173
```
