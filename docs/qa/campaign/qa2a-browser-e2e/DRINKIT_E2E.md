# QA-2A — Drink It! browser journeys

**Backend:** disposable `:55321` (authoritative clock + RPCs)  
**UI:** real log wizard / Home bounty cards / Daily claim

## Results

| ID | Journey | Outcome | Notes |
|---|---|---|---|
| E2E-DI-001 | Ordinary solo log | **passed** | Gallery after submit + refresh |
| E2E-DI-002 | Ordinary + companion | **passed** | |
| E2E-DI-003 | Cocktail Bounty Home→wizard | **passed** | Prefill lands on friends; skip bar flash |
| E2E-DI-004 | Ingredient Bounty | **failed** | Timeout before review after cocktail (E2E-011) |
| E2E-DI-005 | Bar Bounty + crew | **failed** | Intermittent (passed earlier rerun; E2E-012) |
| E2E-DI-006 | Daily All Hands | **not_run** | Day mode was Bring a Friend |
| E2E-DI-007 | Daily Bring a Friend | **passed** | Photo required → gallery |
| E2E-DI-008 | Overlapping cocktail+ingredient | **blocked** | Cocktail OK; ingredient E2E incomplete (QA-1 backend overlap passed) |
| E2E-DI-009 | Mobile Order log | **passed** | `bar-row-mobile-order` |
| E2E-DI-010 | Submit gated until steps done | **passed** |
| E2E-DI-011 | Home eligibility after refresh | **passed** |
| E2E-DI-012 | Cocktail exposure RPC cross-check | **passed** | Grace deep browser timing → lifecycle blocked cases |

## Guest-facing observations

1. **Cocktail claim deep link works** when prefill is allowed to settle (`from=cocktail&bar&offering`).
2. **Friends step roster is huge** on disposable (full directory) — Continue sits far below; floating bottom nav can intercept taps (mirrors real risk on large crews).
3. **Ingredient/Bar claim E2E** still unreliable after prior claims the same session — treat as P2 automation/UX risk, not as proof the backend rejects valid claims (QA-1 covered acceptance).

## Manual repro (ingredient) if automation fails

1. Seed afternoon Day 3 on disposable; login as Drink-enrolled player who has **not** claimed ingredient today.
2. Home → Ingredient / Elusive card → Claim.
3. Wait for friends (or drink) step — do not mash bar list during load.
4. Continue → photo optional → review → ensure Ingredient bounty row selected → Submit.
5. Confirm gallery + Home eligibility after refresh.

## Incorrect / negative paths exercised

- Submit not available early (E2E-DI-010).
- Network abort on submit (see NETWORK report).
- Already-claimed daily → separate blocked/not_run handling.
