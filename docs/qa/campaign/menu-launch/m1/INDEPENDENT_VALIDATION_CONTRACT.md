# Independent audit / recovery agent — construction contract

Separate ChatGPT session from the primary compiler. Must not see the primary agent's hidden reasoning—only photos, delivered JSON, manifests, and reference files.

## Mission

1. Independently re-read original photographs
2. Audit generated JSON against photos and schema
3. Detect fabrication, bad inference, dangling refs, duplicate concepts
4. Verify Category A/B/C/D and Good Spirits handling
5. Recompute pool sufficiency expectations
6. Diagnose Admin validation error messages
7. Repair only when photo-defensible; otherwise recommend reshoot / organizer decision / **February fallback**

## Attachments for the audit session

| Artifact | Why |
|---|---|
| Same schema + February catalog + approvals as primary | Ground truth |
| Primary outputs (JSON + evidence + validation + decisions) | Subject under audit |
| Original photo pack | Independent evidence |
| `EXACT_IMPORT_SCHEMA.md`, `SCORING_AND_SCHEDULE_INPUT_RULES.md`, this file | Rules |
| `TEST_RESULTS.md` sample error codes | Expected rejection vocabulary |
| Actual Admin error text (if stage/publish failed) | Diagnose codes |

**Do not attach** private roster exports or guest data.

## Audit checklist

| Check | Pass criteria |
|---|---|
| Schema | AJV / `previewCatalogImport` structurally valid |
| Unknown props | None (`additionalProperties: false`) |
| Bar keys | Stable physical keys; no `mobile-order` as catalog bar |
| Drink@bar | Every offering `bar_key` exists; no duplicate offering pairs |
| Ingredients | Every `ingredient_keys` entry defined; aliases non-colliding |
| Prices | Status/usd consistency; no invented $15; B only if in approved set |
| Good Spirits | Unverified unless photo shows exact $ |
| Cocktail candidates | One per concept; designated offering exists; exceptions excluded |
| Ingredient candidates | Declared counts = corroborated A/B multi-bar evidence |
| Pools | Eligible ≥72 / ≥39 without fabrication |
| Exceptions | Registry rows present with required tags |
| Photo support | Spot-check every bounty candidate's designated bar line |
| Diff vs February | List key/eligibility/price deltas with photo justification |

## Repair policy

| Situation | Action |
|---|---|
| Typo / key mismatch with clear photo | Repair + re-validate |
| Missing price but bounty needs eligibility | Organizer decision or drop candidate |
| Pool short after honest audit | **Reject new catalog**; use February |
| Admin `VALIDATION_NOT_READY` / schema codes | Map to checklist; fix or fallback |
| Active catalog already published bad snapshot pre-game | Re-stage unique `catalog_id` February JSON and publish (proven M1) |
| Gameplay already started | Out of scope — do not recommend mid-cruise replace |

## Reject → February criteria

Reject Plan A when any of:

- Cannot reach `ready_for_scheduling` without fabrication
- Material bounty candidates lack photo price/availability evidence
- Organizer cannot resolve Category C blockers before boarding play
- Audit finds systemic invented recipes/fingerprints

Then instruct organizer to upload `february-fallback-star-princess-launch-candidate-v1.json` per `FEBRUARY_FALLBACK_AND_RECOVERY.md`.

## Required audit outputs

```
audit-YYYYMMDD.md          # findings, severity, photo refs
audit-YYYYMMDD.repaired.json  # only if defensible repairs made
audit-YYYYMMDD.verdict.md  # ACCEPT_PLAN_A | ACCEPT_WITH_DECISIONS | REJECT_USE_FEBRUARY
```
