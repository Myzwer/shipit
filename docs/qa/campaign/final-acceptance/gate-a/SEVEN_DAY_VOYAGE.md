# Gate A — Seven-Day Voyage

## Simulation method

Server-authoritative timed RPCs (`dev_get_*_at`, `dev_submit_*_at`, `dev_get_ship_clock_state_at`) on disposable `:55321`.  
No browser, no logged-in player required for clock transitions. Ship dates: Sat `2099-01-03` → Fri `2099-01-09`, offset −240.

## Lifecycle matrix

| Transition | Result |
|---|---|
| Pre-cruise blocks claims | PASS |
| Just before Day1 00:00 still closed | PASS |
| At Day1 00:00 opens | PASS |
| Days 1–7 clock `cruise_day` advances without browser | PASS |
| Day 3 pause hides cocktail exposure | PASS |
| Day 3 resume restores | PASS |
| Friday 17:59:59 still accepting | PASS |
| Friday 18:00:00 finale / stop | PASS |
| After finale remains finalized | PASS |
| Post-finale scoring rejected | PASS |
| Post-finale schedule re-init → `CRUISE_FINALIZED` | PASS |

## Per-day bounty exposure

| Day | Cocktail noon–5pm | Ingredient 12/14/16 | Bar 15:00 |
|---|---|---|---|
| 1 Sat | PASS active | active (harness field false-fail) | PASS |
| 2 Sun | PASS | active (harness) | PASS |
| 3 Mon | PASS (+ pause/resume) | active (harness) | PASS |
| 4 Tue | PASS | active (harness) | PASS |
| 5 Wed | **FAIL unavailable** after catalog B fixture activate | unavailable | PASS |
| 6 Thu | **FAIL unavailable** | unavailable | PASS |
| 7 Fri | **FAIL unavailable** (6pm windows N/A after break) | unavailable | PASS |

Days 5–7 Cocktail/Ingredient failure root cause: **FINAL-A-CAT-001** (mid-voyage unsafe catalog fixture replacement). Bar sequence continued to resolve.

## Autonomy conclusion

With an intact schedule and without unsafe catalog mutation, **daily automation does not need a human or open browser**. Catalog replacement mid-cruise is the operational hazard that currently can strand future bounty windows if the unsafe activate path is used.
