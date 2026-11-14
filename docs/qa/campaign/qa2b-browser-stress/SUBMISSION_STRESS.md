# QA-2B — Submission / interaction stress

Backend: disposable `:55321`. Registry IDs `E2B-S01`–`E2B-S14`.

## Results

| ID | Journey | Outcome | Notes |
|---|---|---|---|
| E2B-S01 | Rapid open/close Drink log | **passed** | 5/5 mounts |
| E2B-S02 | Rapid nav Drink/Ship/Gallery/Chooser | **passed** | No page errors |
| E2B-S03 | Triple-tap Submit | **failed** | Did not reach gallery (timeout after submit taps) — intermittent submit UX under load |
| E2B-S04 | Two tabs same account | **failed** | Login selector timeout on second context (harness/env flake this run) |
| E2B-S05 | Refresh mid wizard | **passed** | Recoverable |
| E2B-S06 | Refresh after accept | **passed** | Gallery URL persists |
| E2B-S07 | Navigate away during submit | **failed** | **`newSubs=2` both `accepted`** → **E2B-001** |
| E2B-S08 | Slow RPC (2.5s) | **passed** | No hard crash |
| E2B-S09 | Offline → reconnect | **passed** | Home controls return |
| E2B-S10 | Cleared storage (session expiry sim) | **passed** | Redirect login — *simulated*, not JWT soak |
| E2B-S11 | Reopen after Ship interruption | **passed** | |
| E2B-S12 | Repeated galleries | **passed** | 8/8 |
| E2B-S13 | Ship scavenger submit | **failed** | `shipit-challenge-list` missing — likely all challenges completed / enrollment state for Demo Both |
| E2B-S14 | Cocktail claim + DB categories | **failed** | Gallery path incomplete or `claimed_categories=[]` → **E2B-002** |

## Authoritative DB highlight

**E2B-S07** (navigate away immediately after Submit):

- Before/after `submissions` query for the player showed **two new `accepted` rows**.
- Player-facing risk on ship Wi-Fi: leave page thinking submit cancelled → silent double log / score noise.
- Links conceptually to REL-001 / E2E-032 (in-flight guards) but this is **nav-away**, not double-tap only.

## Repeated runs

Flake investigation iterations recorded in `FLAKINESS_INVESTIGATION.md` — not double-counted here.
