# R5 — Remaining risks

| Risk | Severity | Notes |
|---|---|---|
| Organizer DB still lacks `11200` | Launch | Apply only after approved snapshot; not applied in this repair |
| Cruise dates / offset still ops out-of-band | Launch config | AMBIGUITIES #1 — Admin init assumes config already present |
| `11100` Wrapped ranks still pending | R6 | Independent of schedule init; disposable also lacks `11100` |
| Mid-cruise full reshuffle beyond publish rebind | Menu-agent | Not built; see CATALOG_UPDATE_CONTRACT |
| Partial ledger recovery | Ops | Intentionally refused — needs explicit human/ops intervention |
| QA-1 full suite not re-run under organizer status mismatch | Process | Engine unchanged; disposable Admin path proven |
| Catalog publish still does not bootstrap empty schedule | By design | Documented; Admin init is the first-schedule path |

## Menu-agent phase (explicit handoff)

- Safe future-only regeneration UX if publish rebind is insufficient
- Ensuring agent-produced catalogs never designate Cocktail bounties at `mobile-order`
- Optional automation that *reminds* Admin to initialize after first successful publish when schedule empty (UI nudge only — do not auto-init without confirm)
