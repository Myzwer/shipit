# Ambiguities / configuration gaps

Separate **observed facts**, **documented claims**, and **inferred risks**.

## Organizer decisions still required (launch / ops)

| # | Item | Class | Notes |
|---|---|---|---|
| 1 | Production voyage dates + clock offset schedule | C | Synthetic QA dates ≠ production |
| 2 | Production roster Auth provisioning / passwords | C | Local roster ≠ production accounts |
| 3 | Ship It! decorative team names | C | Memberships final; public labels may be pending — verify current source |
| 4 | All Hands meetup announcement times | C | Admin free text; not machine-gated |
| 5 | OceanNow / Mobile Order verified menu | C | Optional; virtual search OK without it |
| 6 | Photo cleanup schedule (manual vs cron) | C | `ops:photo-cleanup` exists; auto-ops unclear |
| 7 | Apply `10900` / `11000` / `11100` to organizer | C | Only after snapshot + approval (QA-2) |
| 8 | Good Spirits Plus price evidence for gauntlets | C | Keep gated until verified |
| 9 | `License to Chill` catalog mapping | C/M | Avoid phantom unlocks |
| 10 | Migration `10200` disposition | C | Unapplied; companion_names already via `10500` — treat as obsolete unless schema diff found |

## Not a gap (verified)

| Item | Fact |
|---|---|
| Seven Bar Bounty day locations | Present on organizer (`wake-view-bar` … `promenade-bars`) |
| Seven Daily Challenges + modes | Match final approved list on organizer |
| Visual design | Frozen per Nov 13 Director handoff — out of functional QA scope except true defects |

## Spec vs implementation watch-list (inferred / prior reports)

| Topic | Concern | Action |
|---|---|---|
| Mobile Order vs Cocktail eligibility | Prior agent noted offering_id match may not force bar check | Confirm on disposable before organizer enable |
| Mobile Order vs Bar Gauntlets | Prior agent: collection counts by offering_id only | Confirm on disposable |
| Ingredient Mobile Order | Documented exclude (`virtual_order_source`) | Re-verify after 10900 |
| Activity day vs gameplay day achievements | Port/Thanksgiving/first/final stay on calendar day | Regression suite after 11000 |

## Classification reminder

Do **not** silently treat undocumented UI behavior as correct. Prefer approved specs + server contracts.
