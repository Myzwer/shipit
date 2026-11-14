# QA-2B — Defects (E2B-*)

Severity P0–P3. Link existing REL/E2E IDs — do not double-count the same root cause as a new voyage-blocker ID unless behavior differs.

---

## E2B-001 — P1 — Navigate-away during drink submit can create two accepted logs

- **Links:** related to REL-001 / E2E-032 (in-flight ambiguity), distinct trigger
- **Expected:** At most one accepted submission; leaving mid-flight cancels or idempotently coalesces
- **Actual:** `E2B-S07` observed `newSubs=2` both `status=accepted` after Submit then immediate navigation to Home
- **Evidence:** `TEST_REGISTRY.json` E2B-S07; stress console
- **Guest impact:** On flaky ship Wi-Fi, switching apps/tabs can silently double-log drinks / inflate scores
- **Class:** Confirmed product defect (disposable backend authoritative)

## E2B-002 — P2 — Cocktail claim stress reached UI success path without claimed_categories

- **Links:** eligibility / already-claimed state; not a duplicate of E2E-011
- **Expected:** When Claim It is enabled and review shows cocktail available, accepted result includes `cocktail` in `claimed_categories`
- **Actual:** `E2B-S14` recorded `cats=[] points=0` (and/or claim path failed under fixture exhaustion)
- **Evidence:** stress registry E2B-S14; flake DB samples with `unavailable` bounty rows after prior claims
- **Guest impact:** “Success” gallery feeling without bounty points — confusing on a timed voyage
- **Class:** Product/eligibility inconsistency under stress **or** exhausted same-day claims — retain for repair triage with fixture isolation

---

## Harness defects (not product) — closed for triage as test debt

| Legacy ID | Class | Fix applied |
|---|---|---|
| E2E-011 | Harness | Ingredient must select bar; wait for bar-list |
| E2E-012 | Harness | Use `bounty-card-bar` (never `/Bar/i` text) |

Application source **not** changed.

---

## Reproduced existing defects

| ID | QA-2B evidence |
|---|---|
| REL-008 / E2E-030 | E2B-L03 simulated URL error — no `@error` recovery |
| REL-005 | E2B-M10 storage abort — not falsely ready |
| REL-003 / E2E-031 | Attempted; blocked this run by challenge exhaustion — retained |
| REL-001 / E2E-032 | S03/S07 stress adjacency |

---

## Not defects / environmental

- Roster player login timeouts without Demo password alignment
- Ship challenge list empty after prior scavenger completes (fixture contamination)
- Daily All Hands `not_run` when day assignment / claim already used
- Chromium ≠ iPhone HEIC
