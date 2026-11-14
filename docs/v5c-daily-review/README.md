# Phase V5C — Daily Challenge Review visual fidelity

Rebuilds Daily Challenge Review to match ordinary Drink It! Review + Gallery Polaroid preview.

## Structure
1. Review Your Challenge heading
2. Magenta points pill (dynamic)
3. Gallery-style Polaroid post preview (title once, venue, player, caption)
4. Submit Challenge CTA

## Shared components
- `FramedPhoto`
- `PhotoFramingEditor`
- `gallery-polaroid` / `gallery-drink-post` / review edit chips
- Magenta points pill treatment (same as Details)
- Teal `ui-primary-btn`

## Screenshots
| File | Case |
| --- | --- |
| `before/daily-review-legacy.png` | Old DAILY CHALLENGE / PHOTO / POINTS panels |
| `after/01-review-with-caption-*.png` | Photo + caption (360/402/430) |
| `after/02-review-no-caption-402.png` | Add Caption state |
| `after/02b-caption-edit-focus-402.png` | Caption pencil → capture focus |
| `after/03-framing-editor-402.png` | PhotoFramingEditor from Review |
| `after/03-review-after-framing-402.png` | After framing accept |
| `after/04-review-long-title-*.png` | Long challenge title |
| `after/05-review-long-caption-*.png` | Long caption |
| `after/06-full-screen-submit-nav-402.png` | Submit + bottom nav |
| `after/07-ordinary-drinkit-review-402.png` | Ordinary Drink It! Review compare |

Compare `01-review-with-caption-402.png` with `07-ordinary-drinkit-review-402.png`.

## Checks
- Typecheck + unit tests (incl. `DailyReviewStep.spec.ts`) passed
- Title appears once; points in magenta pill; no DAILY CHALLENGE/PHOTO/POINTS panels
- Photo/caption pencils verified (framing editor + caption focus)
