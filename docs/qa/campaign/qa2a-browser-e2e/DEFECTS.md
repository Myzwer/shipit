# QA-2A — Defects (E2E-*)

Severity scale matches campaign P0–P3. Links to `REL-*` / `DEF-QA1-*` avoid double-counting.

---

## E2E-030 — P1 — Gallery signed URLs lack refresh / `@error` reload

- **Links:** REL-008  
- **Expected:** Renew signed URL before expiry and/or reload on image error.  
- **Actual:** Gallery card loads URL once; no refresh timer; no `@error` handler (inspection). Short-session images load.  
- **Evidence:** E2E-ME-008; Agent 2 `gallerySignedUrl.contract.spec.ts`  
- **Guest impact:** Broken images after ~1h / backgrounded tabs on ship Wi-Fi.

## E2E-031 — P1 — Discard staged Ship It photo orphans Storage/ledger

- **Links:** REL-003  
- **Expected:** Discard/Start Over calls `abandonPhotoUpload`.  
- **Actual:** UI clears; `photos` count increased after stage+discard (disposable).  
- **Evidence:** E2E-ME-009  
- **Guest impact:** Confusing retries; storage clutter until cleanup runner.

## E2E-032 — P1 — Scavenger submit lacks in-function in-flight guard

- **Links:** REL-001  
- **Expected:** Early return while submit in flight (Drink log `BUSY` pattern).  
- **Actual:** Double-tap reachable; navigation usually succeeds via idempotency.  
- **Evidence:** E2E-ME-010  
- **Guest impact:** Ambiguous pending state on slow Wi-Fi; score dup usually prevented server-side.

---

## E2E-011 — P2 — Ingredient bounty browser claim automation / flow timeout

- **Links:** E2E-DI-004; backend QA-1 ingredient acceptance passed  
- **Expected:** Home Ingredient claim completes to gallery like Cocktail (E2E-DI-003).  
- **Actual:** Playwright timed out waiting for review after prior cocktail claim in-session.  
- **Repro:** See DRINKIT_E2E.md manual steps with a fresh ingredient-eligible account.  
- **Blocks?** No for backend confidence; yes for declaring browser ingredient UX fully green.
- **QA-2B update:** **Confirmed harness defect** — product intentionally lands ingredient claims on bar picker; harness refused to click bars. After harness-only fix, drinkit re-run **passed** DI-004. See `qa2b-browser-stress/FLAKINESS_INVESTIGATION.md`.

## E2E-012 — P2 — Bar bounty wizard advance intermittent

- **Links:** E2E-DI-005  
- **Expected:** Stable Bar claim with crewmate through review/submit.  
- **Actual:** Passed in one rerun, failed in a later rerun (timeout to review).  
- **Notes:** Large friends list + floating nav tap interception likely contributors.
- **QA-2B update:** **Confirmed harness defect** — `/Bar/i` matched “bars” on Ingredient card. Stable `bounty-card-bar` targeting; drinkit re-run **passed** DI-005.

---

## Retained without new E2E ID

| Finding | Status |
|---|---|
| REL-002 Daily double-submit guard | Outstanding / retain Agent 2 |
| REL-004 Drink `resetAll` orphan | Same root as REL-003 |
| REL-005 AbortSignal → Storage PUT | Outstanding |
| REL-007 Empty blob on remount retry | Outstanding |
| DEF-QA1-001 Bar preview reason | Not browser-retested |

## Not defects

- Chromium ≠ iPhone HEIC (blocked device).  
- Daily All Hands not_run when day assignment is Bring a Friend.  
- Harmless idempotent server replay on refresh-during-submit.
