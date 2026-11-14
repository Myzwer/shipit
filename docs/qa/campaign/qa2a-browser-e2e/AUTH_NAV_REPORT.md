# QA-2A — Auth & route navigation

**Method:** Playwright Chromium mobile emulation + disposable `:55321`  
**Identities:** synthetic `admin` / `both` / `drink_only` / `ship_only` / `no_games`

## Results

| ID | Journey | Outcome |
|---|---|---|
| E2E-AUTH-001 | Unauthenticated `/drinkit` → login | **passed** |
| E2E-AUTH-002 | Incorrect credentials → alert, stay on login | **passed** |
| E2E-AUTH-003 | Dual-enrolled login → game chooser | **passed** |
| E2E-AUTH-004 | Refresh restores session | **passed** |
| E2E-AUTH-005 | Back/forward after game nav | **passed** |
| E2E-AUTH-006 | Logout → login | **passed** |
| E2E-AUTH-007 | Login again after logout | **passed** |
| E2E-AUTH-008 | Drink-only blocked from Ship It | **passed** |
| E2E-AUTH-009 | Ship-only blocked from Drink It | **passed** |
| E2E-AUTH-010 | Non-enrolled blocked from Drink It | **passed** |
| E2E-AUTH-011 | Dual deep links both games | **passed** |
| E2E-AUTH-012 | Admin `/admin` | **passed** |
| E2E-AUTH-013 | Second tab shares session (same context) | **passed** |
| E2E-AUTH-014 | Other-context starts logged out | **passed** |
| E2E-AUTH-015 | Login from second context | **passed** |
| E2E-AUTH-016 | Cleared storage → re-auth on protected route | **passed** |
| E2E-AUTH-VP-w360/390/402/430 | Drink It home actionable | **passed** |

## Notes

- Viewports are **emulation only** (360 / 390 / 402 / 430).
- Expired-session case clears storage/cookies (not a forged JWT expiry soak).
- Controls were actionable; bad password produced a visible alert.
