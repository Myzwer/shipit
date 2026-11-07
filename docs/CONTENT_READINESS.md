# Content readiness — Phase 10B launch candidate

Organizer-approved researched menus + bounty rankings are the **intended launch content**.  
They are no longer disposable demo placeholders. Phase 10B does **not** activate a production cruise.

| | |
|---|---|
| Launch-candidate catalog | `content/catalogs/launch-candidate-v1.json` |
| Rankings approval | `content/approvals/rankings-approval-v1.json` |
| Price-evidence approval | `content/approvals/price-evidence-approval-v1.json` |
| Reconciliation | `docs/CANDIDATE_RECONCILIATION.md` |
| Evidence report | `docs/CONTENT_EVIDENCE_REPORT.md` |

## Inventory

| Metric | Count |
|---|---:|
| Game bars | 13 |
| Offering rows | 210 |
| Unique cocktails | 110 |
| Category A (exact ≤$15) | 0 |
| Category B (approved filtered) | 191 |
| Category C (Good Spirits unknown) | 19 |
| Category D (explicit >$15) | 0 (none reconstructed) |
| Cocktail eligible (Category B) | **79** |
| Cocktail pending Good Spirits | **10** (`eligible:false`) |
| Ingredient eligible | **44** (Basil excluded by hidden-hunt guardrail) |
| Slot targets | 72 / 39 |
| Ship It! challenges | 50 authentic |
| Working achievements | 140 (129 release-enabled) |

## Logging vs bounty

Named menu drinks remain **loggable** when present in the catalog regardless of bounty eligibility.  
Cuts stay loggable. Over-limit / unknown-price drinks do not justify Cocktail or Ingredient Bounties.  
Bar Bounty never requires purchasing an over-limit drink.

## Good Spirits onboard check (optional)

Photograph / price-check the ten pending ranking selections. If an exact printed price ≤$15 is confirmed, set Category **A** (`verified_within_limit` + numeric `price_usd`). Do not invent $15. The 72-slot schedule does **not** require these ten.

## Private organizer inputs (still required before provisioning)

- Final 22-guest roster + Drink It! participation + teams (private template under `private/roster.example/`)
- Two distinct Davids display names
- Companion UUID map for D-086–D-093
- Permissioned photos

No real names/passwords/UUIDs/photos in Git.

## Production activation (out of scope here)

1. Supply private roster → Auth provision
2. Admin stage/publish launch-candidate catalog (or Path B reconstruction if menus differ)
3. Explicit achievement production load (`docs/WORKING_ACHIEVEMENT_CATALOG.md`)
4. Do **not** treat Menu Reconstruction Agent as mandatory if menus match
