# CAROUSEL_REPORT — QA-3B Plan C featured slides

## Implementation under test

- `src/lib/wrapped/buildFeatureSlides.ts` (`buildDrinkItFeatureSlides` / `buildShipItFeatureSlides`)
- `buildWrappedIntroSlide`
- `photoHighlights.ts` (`pickDistinctPhotos`, reaction rankers)
- `WrappedView.vue` prefixes intro; loads gallery highlights with truncation flag

## Spec (Plan C)

- Drink It!: up to 15 story/photo candidates + intro
- Ship It!: up to 12 candidates + intro
- Skip ineligible / sparse / overcrowded ties rather than fabricate
- All Stats remains complete independently
- No placeholder photos; real Gallery provenance only

## Executed fixture results

| Condition | Result |
|---|---|
| Zero data | No story slides; intro still prefixable |
| Missing photographs | No photo slides invented |
| Duplicate photo candidates | `pickDistinctPhotos` dedupes by `photo_id` |
| Ship It! best-day below 400 pts / 2 challenges | SI-04 / SI-09 skipped |
| Dense All Stats | Mine/Ours inventory IDs preserved |
| Unavailable favorites | Remain unavailable in All Stats (no invented winner) |

## Photo provenance

Highlights require Gallery events with `photo_id` and non-achievement kind. Signed URL fetch uses gallery API (**WRP-002 / REL-008** expiry class). Truncated photo pools mark `photoPoolComplete=false` so earliest-photo featured cards can skip.

## Not redesigned

No eligibility rules removed to force slides. No new UI chrome added.
