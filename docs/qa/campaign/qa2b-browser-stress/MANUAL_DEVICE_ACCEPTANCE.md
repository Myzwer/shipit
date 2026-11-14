# QA-2B — Manual / physical device acceptance

Chromium mobile emulation is **not** a substitute for these procedures. Do not mark them passed from desktop automation.

## Device matrix (still required)

| ID | Procedure | Pass criteria |
|---|---|---|
| DEV-HEIC-01 | iPhone Safari: pick HEIC from Photos → stage → submit Ship or Daily | Stages; submits; gallery shows image after refresh |
| DEV-CAM-01 | Live camera capture (not Files) | Capture → framing → stage succeeds |
| DEV-AND-01 | Android Chrome file picker + permissions | Same as HEIC path for JPEG/PNG |
| DEV-CLK-01 | Set device clock wrong vs ship clock | Home uses ship clock; claims follow server (`E2E-LC-008`) |
| DEV-GAL-01 | Leave gallery open >1 hour | Images still load or clear recoverable refresh (REL-008) |
| DEV-TAB-01 | Two physical phones, same account | Session behavior documented; no silent data loss |
| DEV-ROT-01 | Leave Drink Home open across cocktail hour + ingredient window | Cards update or explicit refresh path (`E2E-LC-011`) |
| DEV-GRACE-01 | Start cocktail claim pre-expiry; submit in 15m grace | Accepted per grace contract (`E2E-LC-012`) |
| DEV-NET-01 | Real flaky uplink mid Storage PUT | No false success; retry without dup scores (REL-005) |
| DEV-FRI-01 | Form open across Friday cutoff | Clear ended modal; no silent accept |
| DEV-FIN-01 | Tab open across finale → Wrapped | Latch + entry path clear |

## Grace claim (detailed)

1. Disposable only: seed clock so cocktail slot ends in ~2 minutes; note offering.  
2. iPhone Safari: login, open Cocktail claim, reach review **before** end.  
3. Wait until server is inside 15-minute grace (Home may hide card).  
4. Submit from open review.  
5. Expect accept per QA-1 grace contract; if reject, capture exact player-facing message.

## Accept-then-disconnect (NET-008/009)

Requires a proxy that can drop the response after the server commits. Playwright `route.abort` alone is insufficient. Do not claim covered by QA-2B automation.

## Emulation used in QA-2B

360–430 CSS px, `isMobile` + touch, iPhone-like UA — **explicitly not** Safari/Chrome device QA.
