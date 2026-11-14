# R7 — Remaining risks

## Must resolve before cruise enablement

1. **Frozen tropical eligible set (organizer)**  
   License to Chill / Frozen Concoctions stay verification-gated. Without an approved tropical-frozen list (or confirmation of none), guests see gated collections that cannot complete.

2. **Active catalog publish**  
   Launch JSON now carries `frozen` + `spirit-dark`, but disposable qa2 active pointer was on `dev-fixture-schedule-ready-v1` (no frozen drink; near-zero classification tags). Cruise must publish **star-princess-launch-candidate-v1** (post-R7 tags) for D-033 and ingredient achievements to earn live.

3. **Combined migration testing with R6**  
   R7 added `11400`; R6 may add `11300`. Apply/order verification on a shared integration DB after both land. Do not assume qa2’s skipped `11200`/`11300` state matches organizer.

## Should track

4. **INT-ACH-01 vs day-1 clock**  
   First drink on activity day 1 also unlocks Come Sail Away (`d076`). Probe treats it as unexpected extra. Behavior matches definition; update probe expectation or clock day if a strict single-award assertion is required.

5. **Companion / organizer blocked rows**  
   d086–d093 still need private companion UUID map; d082/d085 organizer decisions. Correctly `enabledInProductionRelease: false`.

6. **Good Spirits gauntlets**  
   Still `eligible_count: 0` / verification_required until price verification — intentional.

7. **Historical awards**  
   No migration rewrites award rows. Location-bound `covered_count` only affects live progress counts going forward; pinned historical collection awards continue via pin coverage path.

## Explicitly out of scope / not claimed

- Every achievement earned end-to-end on disposable DB  
- Wrapped Achievements leaderboard (WRP-001 / R6)  
- Menu-agent implementation  
- R8 polish items  
- Organizer or Agent 1 database mutation
