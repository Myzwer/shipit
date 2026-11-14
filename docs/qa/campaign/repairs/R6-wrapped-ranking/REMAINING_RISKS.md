# R6 — Remaining Risks

| Risk | Severity | Mitigation / owner |
|---|---|---|
| Organizer still lacks `11100`/`11300` | P1 until apply | Do **not** apply `11100` alone. Apply `11100` then `11300` (or current repo files in order) after snapshot. |
| qa2 `:56321` still on broken `11100` ranks | P1 for that env | Apply `11300` when Agent 2 / ops ready; do not rely on qa2 for green ranks until then. |
| Disposable had `11100` body without migration row historically | Low | Recorded `11100` + applied `11300`; future resets use repo files. |
| All-zero points roster → everyone competition rank 1 | Expected | Sparse disposable data; fixture proof covers unequal points/ties. |
| Browser Wrapped carousel not re-screenshotted | Low | Client contracts + Home RPC prove payload shape; R3 photo-card path untouched. |
| R7 achievement map / frozen / empty eligible | Open | Out of R6 scope; leave tests red. |
| Other Wrapped metrics with `group by bar_id` | Low | DI-C09 joins catalog bars (null ignored); DI-P11 uses `count(distinct)`. |
| Client Points mode re-sort vs server rank | Info | Points mode re-sorts client-side; DI-P03 and Home use server ranks — both now correct. |

## Compatibility notes

- `11200` remains independent of Wrapped ranking.
- Achievements denominator **126** client contract unchanged.
- No change to Ship It! first-to-reach-final-score rule.
- No change to Mobile Order bounty scoring / Ingredient block.
