# Agent / importer contract updates (for later M2 prompt edits)

**Do not rebuild ChatGPT agent prompts in this mission.** Use this as the director handoff.

## Superseded instruction

Remove / replace any instruction that says permanent ordinary-log exceptions (Tequila Shot, Loaded Corona, Fireball Shot, Sambuca Shot, Princess Ultimate Cooler, etc.) **must be injected into every full_snapshot JSON**.

## New contract

1. **Photographed menus** contain only real menu offerings from photos (plus legitimate Category A/B/U/D price evidence rules from M1/M2-P1).
2. **Other Drinks** are application-owned. Agents must **not** add the fixed ordinary-log list to catalog drinks, offerings, cocktail_candidates, or ingredient_candidates.
3. February fallback / historical catalogs may still **contain** legacy organizer-exception rows; if present they must keep collection-exclusion + unverified pricing and stay out of bounty pools.
4. New catalogs **validate without** those rows.
5. Do not invent Category U, Category B fingerprints, or `$15` prices for log-only choices.
6. Independent auditor should confirm Other Drinks are absent from import JSON readiness counts and that legacy exception rows (if any) remain non-bounty.

## Related M2-P1 note

Category U (`approved_unpriced_menu_within_limit` + `unpriced_menu_authorizations`) remains as documented under `docs/qa/campaign/menu-launch/m2-price-policy/`. Other Drinks does not use Category U.
