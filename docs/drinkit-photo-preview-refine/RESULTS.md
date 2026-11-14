# Drink It! Photo Preview Refine — QA

## Visual fixes

1. Wizard photo preview reuses `.gallery-polaroid-photo` (1:1, `object-fit: cover`).
2. Retake / Replace / Remove strip uses Drink It! mint via `--theme-gradient-cool` (`#b7e6e1` → `#e0f5ee`).
3. Preview capped at `max-w-[17.5rem]` (280px) so mobile height stays reasonable.
4. Review uses the same Gallery polaroid crop class.
5. Stopped revoking the local blob URL on PhotoCapture unmount so Review can still display it (pre-existing broken Review image).

## Metrics (Playwright)

| Case | Viewport | Preview size | Aspect | object-fit | Controls background |
|---|---|---|---|---|---|
| portrait / landscape / square / edge-people | 360, 402, 430 | 280×280 | 1.000 | cover | `linear-gradient(to right, rgb(183, 230, 225), rgb(224, 245, 238))` |
| Review landscape | 402 | 152×152 | 1.000 | cover | n/a |
| Gallery drink_log landscape | 402 | ~349×349 | 1.000 | cover @ `50% 50%` | n/a |

## Screenshots

- `preview-{portrait,landscape,square,edge-people}-{360,402,430}.png`
- `review-landscape-402.png`
- `gallery-landscape-402.png`
- Raw metrics: `RESULTS.json`

## Notes

- Portrait / landscape crops match Gallery centering (`object-position: 50% 50%`).
- Edge-people fixture shows left/right subjects clipped by the center square — same as Gallery until adjustable framing exists.
- Capture: `node scripts/capture-drinkit-photo-preview-refine.mjs`
