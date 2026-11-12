# PC1 — Ship It! photo requirement status

## Backend (already compliant)

- Every enabled challenge has `photo_required = true`.
- `submit_scavenger` / `shipit_submit_scavenger_core` reject missing/invalid photos (`PHOTO_REQUIRED`, staged-photo lock).
- No face recognition, identity analysis, image moderation, or extra approval steps exist or were added.
- Team-wide completion and one active score per team/challenge are unchanged.

## Honor rule (copy / UX)

**The submitting player must appear in the photo.** Honor system only.

Pre-Cruise rules pages are owned by the parallel frontend agent (Appendix A wording).

## Recommended active-game reminder (do not edit while frontend agent is working)

**Location:** Ship It! scavenger submission flow — existing photo step / review copy near `ScavengerSubmitView` / `PhotoCapture` instructional text (same surface that already requires a photo).

**Recommended short reminder (honor only):**

> Make sure you’re in the photo. Some challenges need more teammates — follow the challenge instructions.

No new screens, no confirmation checkbox, no team-wide photo approval.
