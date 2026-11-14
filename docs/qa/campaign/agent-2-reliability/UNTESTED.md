# UNTESTED — QA-2 Agent 2

Cases that could not be executed safely under isolation rules (Agent 1 owns `:55321`; organizer Wrapped on `:54321` is protected).

## Backend / isolated DB required (do not run on shared stacks)

| ID | Case | Why blocked | Suggested later config |
|---|---|---|---|
| QA2-B03 | High-latency / low-bandwidth Storage upload | Needs live Storage | Third disposable project (ports ≠ 54321/55321), copy migrations, point worktree `.env` only there |
| QA2-B04 | Kill network mid-PUT | Mutates Storage; AbortSignal gap | Same isolated stack + browser CDP offline mid-request |
| QA2-B05 | Auth JWT expiry mid-submit | Mutates Auth/session | Isolated stack with short-lived JWT or forced sign-out mid-flight |
| QA2-B07 | Live pre-cruise / awards navigation | Clock mutation | Isolated stack only; never organizer finale fixture |
| QA2-B09 | Multi-tab concurrent submit | Two sessions + DB | Isolated stack |
| QA2-B10 | Confirm orphan cleanup after discard | Mutates photos | Isolated stack + cleanup runner script |

**Do not** point these at `:54321` or Agent 1’s `:55321` without an explicit handoff.

## Physical device / real browser required

| ID | Case | Notes |
|---|---|---|
| QA2-B01 | iPhone HEIC Camera Roll | Safari vs Chrome differences |
| QA2-B02 | Pinch / drag crop | Pointer unit tests are not substitute |
| QA2-B08 | Mobile Safari back during upload | bfcache + in-flight PUT |
| QA2-B11 | Real EXIF orientation samples | Unit path mocks `createImageBitmap` |

## Field / cruise environment

| ID | Case | Notes |
|---|---|---|
| QA2-B12 | Ship Wi-Fi / captive portal | Browser offline simulation ≠ cruise network |
| QA2-B06 | Gallery soak >1h | REL-008 already confirmed statically; soak optional after fix |

## Intentionally not claimed as pass

- Any mocked browser test was **not** labeled backend integration.
- Code inspection alone was **not** counted as a pass; failing static contracts became `REL-*` defects.
- Existing e2e scripts that target `:54321` were **not** re-run (organizer protection).
