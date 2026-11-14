# CROSS_SYSTEM_REPORT — QA-3B

## Stress fixtures (deterministic, non-mutating)

| Scenario | Expectation | Status |
|---|---|---|
| Player with zero activity | Zeros where `zeroIsValid`; unavailable favorites | Presentation unit OK; SQL **blocked** |
| Ordinary logs only | Drinks &gt; 0; bounties = 0 | Independent fixture **pass** |
| Scored bounties only | Bounty counts without inventing extra drinks | **Blocked** SQL |
| Identical Drink It! scores | Ranks 1,1,3; achievements independent | Fixture **pass** |
| Ship It! team no completions | Zeros / unavailable firsts | **Blocked** SQL |
| Two teams tied on points | Earlier `score_reached_at` ranks higher | Contract + fixture **pass** |
| Team finishes all 50 challenges | Collective completion metrics | **Blocked** |
| Achievement earned then revoked | Award inactive; Wrapped counts drop | **Blocked** |
| Claim voided after finale | No award changes if freeze; Wrapped uses active claims | **Blocked** |
| Photo submission voided | Must leave featured carousel | **Blocked** |
| Drink after midnight before 5 AM | Activity day ≠ cruise_day for achievements | Contract: activity mig does not rewrite `cruise_day` |
| Mobile Order log | Must not progress physical gauntlets | **ACH-002** |
| Catalog replacement after progress | Pin vs live menu semantics | **Blocked** |
| Disabled / retired definition | History preserved; not in active 174 | Definition audit **pass** |
| Missing image | No fabricated Polaroid | Carousel unit **pass** |

## Consistency risks observed

1. **ACH-001:** Frozen Wrapped/achievement storytelling can claim collection progress that catalog tags cannot unlock.
2. **ACH-002:** Gauntlet progress may disagree with “logged at bar” player mental model / Mobile Order policy.
3. **WRP-001:** Achievements LB can disagree with My Stats achievement totals UX until 11100 — tab hidden avoids wrong zeros ranking, but Plan C feature incomplete.
4. **WRP-002/REL-008:** Wrapped photos can break while underlying Gallery records remain valid.

## No contradictory pass claimed

Subsystems were not marked “all green” individually then combined — SQL aggregation remains blocked.
