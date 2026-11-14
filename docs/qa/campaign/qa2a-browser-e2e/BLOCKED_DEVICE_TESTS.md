# QA-2A — Physical device / blocked tests

Chromium mobile emulation was used throughout. The following **must not** be claimed as verified on real hardware.

## Still required on physical devices

| ID | What | Why blocked here |
|---|---|---|
| DEV-HEIC-01 | HEIC from iPhone Photos → stage/submit | Safari decode path; Chromium ≠ iPhone |
| DEV-CAM-01 | Live camera capture (not fixture file) | Emulation file input only |
| DEV-AND-01 | Android Chrome picker + permissions | Not run |
| DEV-CLK-01 | Device clock set wrong vs ship clock | E2E-LC-008 |
| DEV-GAL-01 | Gallery open >1 hour signed URL expiry | REL-008 soak; E2E-ME-008 short only |
| DEV-TAB-01 | True two-phone login / push session | Separate devices, not dual Playwright contexts |
| DEV-ROT-01 | Leave Home open across cocktail hour + ingredient 2h | E2E-LC-011 |
| DEV-GRACE-01 | Start claim pre-expiry, submit in 15m grace | E2E-LC-012 |
| DEV-NET-01 | Real ship Wi-Fi flaky uplink mid-PUT | REL-005; synthetic route abort only |

## Manual steps (grace claim)

1. Disposable: seed clock so cocktail slot ends in ~2 minutes; note offering.  
2. iPhone Safari: login, open Cocktail claim, reach review **before** end.  
3. Wait until server is inside 15-minute grace (Home may hide card).  
4. Submit from open review.  
5. Expect accept per QA-1 grace contract; if reject, capture exact player-facing message.

## Emulation explicitly used

360 / 390 / 402 / 430 CSS px, `isMobile` + touch, iPhone-like UA string — **not** a substitute for Safari/Chrome device QA.
