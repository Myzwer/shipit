# Phase S5 — Ship It! Two-Step Submission Wizard

Captured: 2026-11-10

## Summary

Ship It! challenge submission is now a Drink It!-aligned **UPLOAD PHOTO → REVIEW** wizard using shared PhotoCapture, PhotoFramingEditor, FramedPhoto, WizardProgress, WizardModal, and FloatingBottomNav. Theme tokens stay Ship It! gold/brown + cool blue (no Drink It! magenta/teal).

## Before / After

| Step | Before (legacy single page) | After (wizard) |
| --- | --- | --- |
| Upload | `before-upload-402.png` | `01-upload-empty-402.png`, `03-accepted-photo-402.png`, `04-caption-filled-402.png` |
| Review | `before-review-402.png` | `05-review-preview-402.png`, `06-review-selected-challenge-402.png` |

## Side-by-side vs Drink It!

| Surface | Ship It! | Drink It! |
| --- | --- | --- |
| Photo empty | `01-upload-empty-402.png` | `compare-drinkit-photo-empty-402.png` |
| Review | `05-review-preview-402.png` / `06-…` | `compare-drinkit-review-402.png` |

Same density, stepper proportions, caption field, gallery polaroid preview, edit chips, and bottom nav clearance — different colors and 2 vs 5 segments.

## Functional confirmations

- Shared framing editor opens automatically on take/upload (`02-framing-overlay-402.png`); Adjust / Review pencil reuse the same editor.
- Review photo edit preserves crop on Cancel; acceptance updates preview (`07-review-after-framing-edit-402.png`).
- Review caption edit returns to Upload Photo and focuses the caption field.
- Photo required: Continue disabled + `photo-required-hint` when empty; progress REVIEW disabled until staged.
- Exit and Discard navigates to Challenges; Keep Editing path preserved via modal cancel.
- No SHIP TIME / Day row on the wizard header.
- Floating bottom nav does not own nested scroll; step changes reset scroll to top.

## Width sweep

`upload-empty-{360,390,402,430}.png` and `review-{360,390,402,430}.png`

## Automated checks (capture script)

- PASS photo-required-continue-disabled
- PASS photo-required-hint
- PASS progress-two-segments
- PASS no-ship-time-row
- PASS framing-accept
- PASS accepted-photo-controls
- PASS caption-entered
- PASS review-step-reached
- PASS review-gallery-preview
- PASS selected-challenge-and-team-note
- PASS review-framing-edit
- PASS caption-edit-focus
- PASS progress-tap-review
- PASS exit-discard-navigates
- PASS drinkit-compare-shots
- PASS width-360 / 390 / 402 / 430

## Tooling

- `npm run typecheck` — pass
- `npm test` (unit suite including `ScavengerReviewStep.spec.ts`) — pass (271)
- `npm run build` — pass
- ESLint on S5-touched files — pass (repo-wide lint still has pre-existing unrelated errors)

## Remaining discrepancies (for Josh visual approval)

- Ship It! Gallery feed still uses the older warm card layout; Review preview intentionally uses the approved polaroid treatment from Drink It! Review (same shared classes/tokens). Aligning Gallery itself is out of S5 scope.
- Submit Challenge sits below the Selected Challenge block (scroll on short viewports), matching Drink It! Review CTA placement under dense content.
- Loading / network-error screens were preserved from existing recovery paths; not every error string was screenshot-forced in this pass beyond unknown-pending modal wiring.
