# CATALOG_REPORT — QA-3A Agent 2

**Question answered:** Can the app safely consume a replacement menu JSON (future menu-generation agent) via the **existing** import/activation path?  
**App source modified:** No.  
**Claim limit:** Unit/schema + static contracts. **Not** claimed: transactional DB activation, rollback soak, or concurrent publish races.

## End-to-end path (as implemented)

1. **Paste/upload JSON** → client `previewCatalogImport` (Ajv schema + cross-refs + business rules). `safeToPublish` always false client-side.
2. **Stage** → `admin_stage_catalog_import` (stores `catalog_import_candidates`, abandons prior staged for same `catalog_id`).
3. **Server preview** → `admin_preview_catalog_publish` (read-only evaluate; `safe_to_publish` when no blockers).
4. **Publish** → `admin_publish_catalog_import` (advisory lock, ledger, `catalog_publish_apply`, flip `active_catalog_pointer`).
5. **Rollback** → `admin_rollback_catalog` clones a retired manifest under a new `catalog_id` and re-publishes (not a simple pointer flip).

**Active catalog at runtime:** DB pointer `active_catalog_pointer` (id=1). Not an env var. `content/catalogs/*.json` are **not** hot-loaded by player UI (exceptions registry is bundled for validation only).

**Redeploy required for:** schema/tag vocab changes, Category B allowlist, approval bars, organizer-exception registry.  
**Redeploy NOT required for:** activating a new full_snapshot catalog via Admin (by design).

## Schema contract (summary)

| Area | Required highlights |
|---|---|
| Root | `schema_version` 1.0\|1.1, `catalog_id`, `mode=full_snapshot`, `source_notes`, `bars`≥1, ingredients, drinks, cocktail_candidates, ingredient_candidates |
| Keys | kebab `canonicalKey` ≤96 |
| Offerings | bar_key, ingredient_keys, display_ingredients, price_status (+ optional price evidence fields) |
| Candidates | cocktail: drink_key, designated_bar_key, tier, points ∈ {25,50,75,100}; ingredient: coverage counts + tier/points |
| Price | Category A verified ≤$15; Category B approved filtered; organizer exceptions excluded from candidates |

Full field matrix: `content/schemas/catalog-import.schema.json` + `src/lib/catalog/validateCatalog.ts`.

## Validation test coverage executed (this assignment)

| Scenario | Result |
|---|---|
| Hostile roots (null/array/string/empty) | Rejected — pass |
| Missing/wrong types / unexpected props | Rejected — pass |
| Empty bars / empty offerings | Rejected — pass |
| Duplicate ids (bars, drinks, offerings, candidates) | Rejected — pass |
| Unknown bar/ingredient refs | Rejected — pass |
| Bad schema_version / mode / key patterns / points / price range | Rejected — pass |
| Readiness 71/39, 72/38 not ready; 72/39 ready | Pass |
| Large catalog 400/200 cocktails/ingredients | Accepted (no size cap) — pass |
| Valid replacement + new drinks/ingredients/bars | Pass |
| Renamed concept (same key) | Pass |
| Duplicate drink/ingredient | Rejected — pass |
| Alias conflicts | Rejected when reproducible — pass |
| Over-limit cocktail candidate | Rejected — pass |
| `mobile-order` bar in import | **Accepted** — CAT-002 |
| Launch candidate `star-princess-launch-candidate-v1` | Structurally valid + ready to stage — pass |
| Preview-failure pending recovery | **FAIL → CAT-001 / ADM-008** |

Evidence: `tests/unit/qa3a-admin-catalog/catalogValidate.*.spec.ts`, `catalogLaunchCandidate.contract.spec.ts`, `catalogActivation.contract.spec.ts`.

## Activation, transaction safety, history (inspected)

| Topic | Finding |
|---|---|
| Atomic publish/rollback | Single plpgsql function + advisory lock; raised exceptions roll back (including shortage raises) |
| Partial catalog leave-behind | Stage is separate from publish; failed publish should not flip pointer — **needs disposable integration to prove** |
| Historical logs | `drink_logs` keep version ids + display snapshots; publish does not delete submissions/claims |
| Slot rebind | Only never-shown `scheduled` slots rebind; exposures prevent re-offer |
| Achievements | Version-scoped tags; prior integration `achievements.phaseA1.catalogReplace` exists but **not re-run here** |
| Random bounty pools | Eligible candidates on active version; Admin Skip uses unused reserves; exact 72/39 ⇒ zero reserves |
| First schedule creation | **No production Admin path** — `dev_generate_bounty_schedule` is service_role / development-only gated |

## Mobile Order

- Virtual bar `mobile-order` (`bars.is_virtual`) appended by SQL, not by catalog JSON.
- Search: `list_drinkit_mobile_order_drinks` + client substring filter.
- Eligibility: Cocktail/Ingredient paths force `virtual_order_source` / unavailable (migration `11000`); Bar Bounty cannot match featured physical bar.
- **Gap:** Catalog validator does not reject `mobile-order` keys (CAT-002). Live exclusion is DB-side — blocked for re-prove on disposable.

## Defects & risks

- **CAT-001 / ADM-008:** pending lock after preview failure — activation UX P1.
- **CAT-002:** mobile-order accepted in JSON — P2 operator/generator hazard.
- **RISK-CAT-A…D:** size limit, TS bypass, Add Drink race, first-schedule tooling — see `DEFECTS.md` / `BLOCKED_INTEGRATION_TESTS.md`.

## Verdict for menu-generation agent (diagnostic only)

| Capability | Status |
|---|---|
| Client rejects many invalid shapes | **Strong** (unit-proven) |
| Launch candidate validates client-side | **Yes** |
| Activate without website redeploy | **Designed yes** (DB pointer); UI pending bugs threaten ops |
| Safe reject without partial active catalog | **Likely** at publish (transaction); **unproven** live here |
| Preserve history across replace | **Designed yes**; integration not re-run |
| Generator must avoid Mobile Order bar keys | **Required** until CAT-002 fixed or server rejects |
