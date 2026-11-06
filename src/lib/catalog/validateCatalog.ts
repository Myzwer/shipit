/**
 * Structural + cross-reference + business-rule validation for catalog imports.
 * Preview is always read-only — never mutates the database.
 */
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import schema from '../../../content/schemas/catalog-import.schema.json'
import {
  isApprovedDrinkTag,
  isApprovedIngredientTag,
  isApprovedOfferingTag,
  CATALOG_SCHEMA_VERSIONS,
} from './classificationTags'
import {
  COCKTAIL_SLOT_TARGET,
  COCKTAIL_TIER_POINTS,
  INGREDIENT_SLOT_TARGET,
  INGREDIENT_TIER_BAR_COVERAGE,
  INGREDIENT_TIER_POINTS,
  PRINCESS_PLUS_PRICE_LIMIT_USD,
  type CatalogImportDocument,
  type CatalogIssue,
  type CatalogPreviewResult,
  type CocktailTier,
  type IngredientEvidenceSummary,
  type IngredientTier,
} from './types'

export function countClassificationTagAssignments(doc: CatalogImportDocument): number {
  let n = 0
  for (const ing of doc.ingredients) n += ing.classification_tags?.length ?? 0
  for (const drink of doc.drinks) {
    n += drink.classification_tags?.length ?? 0
    for (const offering of drink.bar_offerings) n += offering.classification_tags?.length ?? 0
  }
  return n
}

export function validateClassificationTags(doc: CatalogImportDocument): CatalogIssue[] {
  const errors: CatalogIssue[] = []
  if (
    typeof doc.schema_version === 'string' &&
    !(CATALOG_SCHEMA_VERSIONS as readonly string[]).includes(doc.schema_version)
  ) {
    errors.push(
      issue(
        'SCHEMA_VERSION',
        'error',
        `schema_version must be 1.0 or 1.1 (got "${doc.schema_version}").`,
        'schema_version',
      ),
    )
  }
  for (const ing of doc.ingredients) {
    for (const tag of ing.classification_tags ?? []) {
      if (!isApprovedIngredientTag(tag)) {
        errors.push(
          issue(
            'UNKNOWN_INGREDIENT_CLASSIFICATION_TAG',
            'error',
            `Ingredient "${ing.key}" has unknown classification tag "${tag}".`,
            `ingredients/${ing.key}/classification_tags`,
          ),
        )
      }
    }
  }
  for (const drink of doc.drinks) {
    for (const tag of drink.classification_tags ?? []) {
      if (!isApprovedDrinkTag(tag)) {
        errors.push(
          issue(
            'UNKNOWN_DRINK_CLASSIFICATION_TAG',
            'error',
            `Drink "${drink.key}" has unknown classification tag "${tag}".`,
            `drinks/${drink.key}/classification_tags`,
          ),
        )
      }
    }
    for (const offering of drink.bar_offerings) {
      for (const tag of offering.classification_tags ?? []) {
        if (!isApprovedOfferingTag(tag)) {
          errors.push(
            issue(
              'UNKNOWN_OFFERING_CLASSIFICATION_TAG',
              'error',
              `Offering ${drink.key}@${offering.bar_key} has unknown classification tag "${tag}".`,
              `drinks/${drink.key}/bar_offerings`,
            ),
          )
        }
      }
    }
  }
  return errors
}

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  validateSchema: false,
})
addFormats(ajv)

const validateSchema = ajv.compile(schema)

function issue(
  code: string,
  severity: CatalogIssue['severity'],
  message: string,
  path?: string,
): CatalogIssue {
  return { code, severity, message, path }
}

function emptyCounts(): CatalogPreviewResult['counts'] {
  return {
    bars: 0,
    activeBars: 0,
    ingredients: 0,
    drinks: 0,
    offerings: 0,
    cocktailCandidates: 0,
    cocktailEligible: 0,
    ingredientCandidates: 0,
    ingredientEligible: 0,
  }
}

function normalizeAlias(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Qualifying Ingredient evidence: named alcoholic cocktail offerings at *active* bars
 * that list the ingredient. Price over-$15 does not disqualify Ingredient hunts
 * (Princess Plus $15 applies to Cocktail Bounty candidates only).
 */
export function corroborateIngredientEvidence(
  doc: CatalogImportDocument,
  ingredientKey: string,
): IngredientEvidenceSummary {
  const activeBars = new Set(doc.bars.filter((b) => b.active).map((b) => b.key))
  const barKeys = new Set<string>()
  const drinkKeys = new Set<string>()
  for (const drink of doc.drinks) {
    if (drink.kind !== 'named_cocktail') continue
    for (const offering of drink.bar_offerings) {
      if (!activeBars.has(offering.bar_key)) continue
      if (!offering.ingredient_keys.includes(ingredientKey)) continue
      barKeys.add(offering.bar_key)
      drinkKeys.add(drink.key)
    }
  }
  const candidate = doc.ingredient_candidates.find((c) => c.ingredient_key === ingredientKey)
  return {
    ingredientKey,
    declaredBarCount: candidate?.known_bar_count ?? 0,
    declaredDrinkCount: candidate?.distinct_qualifying_drinks ?? 0,
    corroboratedBarCount: barKeys.size,
    corroboratedDrinkCount: drinkKeys.size,
  }
}

function isCocktailEligible(
  doc: CatalogImportDocument,
  candidate: CatalogImportDocument['cocktail_candidates'][number],
): { eligible: boolean; reasons: CatalogIssue[] } {
  const reasons: CatalogIssue[] = []
  const drink = doc.drinks.find((d) => d.key === candidate.drink_key)
  if (!drink) {
    return {
      eligible: false,
      reasons: [
        issue(
          'COCKTAIL_CANDIDATE_MISSING_DRINK',
          'error',
          `Cocktail candidate references unknown drink "${candidate.drink_key}".`,
          `cocktail_candidates/${candidate.drink_key}`,
        ),
      ],
    }
  }
  if (drink.kind !== 'named_cocktail') {
    reasons.push(
      issue(
        'COCKTAIL_CANDIDATE_INVALID_KIND',
        'error',
        `Cocktail candidate "${candidate.drink_key}" must be kind named_cocktail (got ${drink.kind}).`,
        `cocktail_candidates/${candidate.drink_key}`,
      ),
    )
  }
  const bar = doc.bars.find((b) => b.key === candidate.designated_bar_key)
  if (bar && !bar.active) {
    reasons.push(
      issue(
        'COCKTAIL_CANDIDATE_INACTIVE_BAR',
        'error',
        `Cocktail candidate "${candidate.drink_key}" designates inactive bar "${candidate.designated_bar_key}".`,
        `cocktail_candidates/${candidate.drink_key}`,
      ),
    )
  }
  const offering = drink.bar_offerings.find((o) => o.bar_key === candidate.designated_bar_key)
  if (!offering) {
    reasons.push(
      issue(
        'COCKTAIL_CANDIDATE_BAR_MISSING',
        'error',
        `Cocktail candidate "${candidate.drink_key}" is not offered at designated bar "${candidate.designated_bar_key}".`,
        `cocktail_candidates/${candidate.drink_key}`,
      ),
    )
    return { eligible: false, reasons }
  }
  if (offering.price_status === 'verified_over_limit') {
    reasons.push(
      issue(
        'COCKTAIL_CANDIDATE_OVER_PRICE',
        'error',
        `Cocktail candidate "${candidate.drink_key}" at "${candidate.designated_bar_key}" is verified over $${PRINCESS_PLUS_PRICE_LIMIT_USD}.`,
        `cocktail_candidates/${candidate.drink_key}`,
      ),
    )
  }
  if (
    offering.price_usd != null &&
    offering.price_usd > PRINCESS_PLUS_PRICE_LIMIT_USD &&
    offering.price_status !== 'verified_over_limit'
  ) {
    reasons.push(
      issue(
        'COCKTAIL_CANDIDATE_PRICE_STATUS_INCONSISTENT',
        'error',
        `Cocktail candidate "${candidate.drink_key}" price $${offering.price_usd} exceeds limit but price_status is "${offering.price_status}".`,
        `cocktail_candidates/${candidate.drink_key}`,
      ),
    )
  }
  if (offering.price_status === 'unverified' || offering.price_usd == null) {
    // Unknown price is not confidently qualifying — not schedule-eligible.
    if (candidate.eligible !== false) {
      reasons.push(
        issue(
          'COCKTAIL_CANDIDATE_UNVERIFIED_PRICE',
          'warning',
          `Cocktail candidate "${candidate.drink_key}" has unverified/unknown price and is not schedule-eligible.`,
          `cocktail_candidates/${candidate.drink_key}`,
        ),
      )
    }
    return { eligible: false, reasons }
  }
  if (offering.price_status !== 'verified_within_limit') {
    return { eligible: false, reasons }
  }
  if (offering.price_usd > PRINCESS_PLUS_PRICE_LIMIT_USD) {
    return { eligible: false, reasons }
  }
  if (candidate.eligible === false) {
    return { eligible: false, reasons }
  }
  return { eligible: reasons.every((r) => r.severity !== 'error'), reasons }
}

function isIngredientEligible(
  doc: CatalogImportDocument,
  candidate: CatalogImportDocument['ingredient_candidates'][number],
): {
  eligible: boolean
  reasons: CatalogIssue[]
  evidence: IngredientEvidenceSummary
} {
  const reasons: CatalogIssue[] = []
  const evidence = corroborateIngredientEvidence(doc, candidate.ingredient_key)

  if (candidate.eligible === false) {
    return { eligible: false, reasons, evidence }
  }

  if (evidence.corroboratedBarCount === 0 || evidence.corroboratedDrinkCount === 0) {
    reasons.push(
      issue(
        'INGREDIENT_CANDIDATE_NO_MENU_EVIDENCE',
        'error',
        `Ingredient candidate "${candidate.ingredient_key}" has no qualifying named-cocktail offerings at active bars.`,
        `ingredient_candidates/${candidate.ingredient_key}`,
      ),
    )
  } else if (evidence.corroboratedBarCount < 2) {
    reasons.push(
      issue(
        'INGREDIENT_CANDIDATE_ONE_BAR',
        'error',
        `Ingredient candidate "${candidate.ingredient_key}" has only ${evidence.corroboratedBarCount} corroborated bar(s); one-bar-only objectives are excluded.`,
        `ingredient_candidates/${candidate.ingredient_key}`,
      ),
    )
  }

  if (candidate.known_bar_count !== evidence.corroboratedBarCount) {
    reasons.push(
      issue(
        'INGREDIENT_COVERAGE_UNCORROBORATED',
        'error',
        `Ingredient "${candidate.ingredient_key}" declares known_bar_count ${candidate.known_bar_count} but catalog offerings corroborate ${evidence.corroboratedBarCount} active bar(s).`,
        `ingredient_candidates/${candidate.ingredient_key}`,
      ),
    )
  }
  if (candidate.distinct_qualifying_drinks !== evidence.corroboratedDrinkCount) {
    reasons.push(
      issue(
        'INGREDIENT_DRINKS_UNCORROBORATED',
        'error',
        `Ingredient "${candidate.ingredient_key}" declares distinct_qualifying_drinks ${candidate.distinct_qualifying_drinks} but catalog offerings corroborate ${evidence.corroboratedDrinkCount}.`,
        `ingredient_candidates/${candidate.ingredient_key}`,
      ),
    )
  }

  return { eligible: reasons.every((r) => r.severity !== 'error'), reasons, evidence }
}

export function validateCatalogStructure(input: unknown): {
  ok: boolean
  document: CatalogImportDocument | null
  schemaErrors: CatalogIssue[]
} {
  const schemaErrors: CatalogIssue[] = []
  const ok = validateSchema(input)
  if (!ok && validateSchema.errors) {
    for (const err of validateSchema.errors) {
      schemaErrors.push(
        issue(
          'SCHEMA_INVALID',
          'error',
          `${err.instancePath || '/'} ${err.message ?? 'invalid'}`.trim(),
          err.instancePath || undefined,
        ),
      )
    }
  }
  if (!ok) {
    return { ok: false, document: null, schemaErrors }
  }
  return { ok: true, document: input as unknown as CatalogImportDocument, schemaErrors }
}

export function validateCatalogCrossReferences(doc: CatalogImportDocument): CatalogIssue[] {
  const errors: CatalogIssue[] = []
  const barKeys = new Set<string>()
  for (const bar of doc.bars) {
    if (barKeys.has(bar.key)) {
      errors.push(
        issue('DUPLICATE_BAR_KEY', 'error', `Duplicate bar key "${bar.key}".`, `bars/${bar.key}`),
      )
    }
    barKeys.add(bar.key)
  }

  const ingredientKeys = new Set<string>()
  const aliasToIngredient = new Map<string, string>()
  for (const ing of doc.ingredients) {
    if (ingredientKeys.has(ing.key)) {
      errors.push(
        issue(
          'DUPLICATE_INGREDIENT_KEY',
          'error',
          `Duplicate ingredient key "${ing.key}".`,
          `ingredients/${ing.key}`,
        ),
      )
    }
    ingredientKeys.add(ing.key)
    const aliases = ing.aliases ?? []
    for (const alias of aliases) {
      const norm = normalizeAlias(alias)
      const existing = aliasToIngredient.get(norm)
      if (existing && existing !== ing.key) {
        errors.push(
          issue(
            'ALIAS_CONFLICT',
            'error',
            `Alias "${alias}" maps to both "${existing}" and "${ing.key}".`,
            `ingredients/${ing.key}`,
          ),
        )
      } else {
        aliasToIngredient.set(norm, ing.key)
      }
      if (ingredientKeys.has(norm) && norm !== ing.key) {
        errors.push(
          issue(
            'ALIAS_COLLIDES_WITH_KEY',
            'error',
            `Alias "${alias}" collides with ingredient key "${norm}".`,
            `ingredients/${ing.key}`,
          ),
        )
      }
    }
    const selfNorm = normalizeAlias(ing.name)
    const nameOwner = aliasToIngredient.get(selfNorm)
    if (nameOwner && nameOwner !== ing.key) {
      errors.push(
        issue(
          'INGREDIENT_NAME_CONFLICT',
          'error',
          `Ingredient name "${ing.name}" conflicts with "${nameOwner}".`,
          `ingredients/${ing.key}`,
        ),
      )
    } else {
      aliasToIngredient.set(selfNorm, ing.key)
    }
  }

  const drinkKeys = new Set<string>()
  const offeringKeys = new Set<string>()
  let offerings = 0
  for (const drink of doc.drinks) {
    if (drinkKeys.has(drink.key)) {
      errors.push(
        issue(
          'DUPLICATE_DRINK_KEY',
          'error',
          `Duplicate drink concept key "${drink.key}".`,
          `drinks/${drink.key}`,
        ),
      )
    }
    drinkKeys.add(drink.key)
    const barsForDrink = new Set<string>()
    for (const offering of drink.bar_offerings) {
      offerings += 1
      if (!barKeys.has(offering.bar_key)) {
        errors.push(
          issue(
            'OFFERING_UNKNOWN_BAR',
            'error',
            `Drink "${drink.key}" references unknown bar "${offering.bar_key}".`,
            `drinks/${drink.key}/bar_offerings`,
          ),
        )
      }
      if (barsForDrink.has(offering.bar_key)) {
        errors.push(
          issue(
            'DUPLICATE_OFFERING',
            'error',
            `Drink "${drink.key}" has duplicate offering at bar "${offering.bar_key}".`,
            `drinks/${drink.key}/bar_offerings`,
          ),
        )
      }
      barsForDrink.add(offering.bar_key)
      const offeringId = `${drink.key}@${offering.bar_key}`
      offeringKeys.add(offeringId)
      for (const ik of offering.ingredient_keys) {
        if (!ingredientKeys.has(ik)) {
          errors.push(
            issue(
              'OFFERING_UNKNOWN_INGREDIENT',
              'error',
              `Offering ${offeringId} references unknown ingredient "${ik}".`,
              `drinks/${drink.key}/bar_offerings`,
            ),
          )
        }
      }
      if (
        offering.price_status === 'verified_within_limit' &&
        offering.price_usd != null &&
        offering.price_usd > PRINCESS_PLUS_PRICE_LIMIT_USD
      ) {
        errors.push(
          issue(
            'PRICE_STATUS_INCONSISTENT',
            'error',
            `Offering ${offeringId} claims verified_within_limit but price is $${offering.price_usd}.`,
            `drinks/${drink.key}/bar_offerings`,
          ),
        )
      }
      if (
        offering.price_status === 'verified_over_limit' &&
        offering.price_usd != null &&
        offering.price_usd <= PRINCESS_PLUS_PRICE_LIMIT_USD
      ) {
        errors.push(
          issue(
            'PRICE_STATUS_INCONSISTENT',
            'error',
            `Offering ${offeringId} claims verified_over_limit but price is $${offering.price_usd}.`,
            `drinks/${drink.key}/bar_offerings`,
          ),
        )
      }
    }
  }

  for (const key of doc.source_notes.verified_bar_keys) {
    if (!barKeys.has(key)) {
      errors.push(
        issue(
          'SOURCE_UNKNOWN_BAR',
          'error',
          `source_notes.verified_bar_keys references unknown bar "${key}".`,
          'source_notes/verified_bar_keys',
        ),
      )
    }
  }
  for (const key of doc.source_notes.carried_forward_bar_keys) {
    if (!barKeys.has(key)) {
      errors.push(
        issue(
          'SOURCE_UNKNOWN_BAR',
          'error',
          `source_notes.carried_forward_bar_keys references unknown bar "${key}".`,
          'source_notes/carried_forward_bar_keys',
        ),
      )
    }
  }

  // Nonrepetition identity = drink concept (not drink@bar). Explicit reject, no silent dedupe.
  const cocktailConcepts = new Set<string>()
  const cocktailPairs = new Set<string>()
  for (const c of doc.cocktail_candidates) {
    const pair = `${c.drink_key}@${c.designated_bar_key}`
    if (cocktailPairs.has(pair)) {
      errors.push(
        issue(
          'DUPLICATE_COCKTAIL_CANDIDATE',
          'error',
          `Duplicate cocktail candidate for ${pair}.`,
          `cocktail_candidates/${pair}`,
        ),
      )
    }
    cocktailPairs.add(pair)
    if (cocktailConcepts.has(c.drink_key)) {
      errors.push(
        issue(
          'DUPLICATE_COCKTAIL_CONCEPT',
          'error',
          `Cocktail concept "${c.drink_key}" appears more than once in cocktail_candidates. Only one designated-bar bounty is allowed per concept per catalog version.`,
          `cocktail_candidates/${c.drink_key}`,
        ),
      )
    }
    cocktailConcepts.add(c.drink_key)
    if (!drinkKeys.has(c.drink_key)) {
      errors.push(
        issue(
          'COCKTAIL_CANDIDATE_MISSING_DRINK',
          'error',
          `Cocktail candidate references unknown drink "${c.drink_key}".`,
          `cocktail_candidates/${c.drink_key}`,
        ),
      )
    }
    if (!barKeys.has(c.designated_bar_key)) {
      errors.push(
        issue(
          'COCKTAIL_CANDIDATE_UNKNOWN_BAR',
          'error',
          `Cocktail candidate references unknown bar "${c.designated_bar_key}".`,
          `cocktail_candidates/${c.drink_key}`,
        ),
      )
    } else if (drinkKeys.has(c.drink_key) && !offeringKeys.has(pair)) {
      errors.push(
        issue(
          'COCKTAIL_CANDIDATE_BAR_MISSING',
          'error',
          `Cocktail candidate "${c.drink_key}" is not offered at designated bar "${c.designated_bar_key}".`,
          `cocktail_candidates/${c.drink_key}`,
        ),
      )
    }
  }

  const ingredientCandKeys = new Set<string>()
  for (const c of doc.ingredient_candidates) {
    if (ingredientCandKeys.has(c.ingredient_key)) {
      errors.push(
        issue(
          'DUPLICATE_INGREDIENT_CANDIDATE',
          'error',
          `Duplicate ingredient candidate "${c.ingredient_key}".`,
          `ingredient_candidates/${c.ingredient_key}`,
        ),
      )
    }
    ingredientCandKeys.add(c.ingredient_key)
    if (!ingredientKeys.has(c.ingredient_key)) {
      errors.push(
        issue(
          'INGREDIENT_CANDIDATE_UNKNOWN',
          'error',
          `Ingredient candidate references unknown ingredient "${c.ingredient_key}".`,
          `ingredient_candidates/${c.ingredient_key}`,
        ),
      )
    }
  }

  void offerings
  return errors
}

export function validateCatalogBusinessRules(doc: CatalogImportDocument): {
  errors: CatalogIssue[]
  warnings: CatalogIssue[]
  cocktailEligible: number
  ingredientEligible: number
  unverifiedOfferings: number
} {
  const errors: CatalogIssue[] = []
  const warnings: CatalogIssue[] = []
  let cocktailEligible = 0
  let ingredientEligible = 0
  let unverifiedOfferings = 0

  for (const drink of doc.drinks) {
    for (const offering of drink.bar_offerings) {
      if (offering.price_status === 'unverified') unverifiedOfferings += 1
    }
  }

  for (const c of doc.cocktail_candidates) {
    const expected = COCKTAIL_TIER_POINTS[c.tier as CocktailTier]
    if (expected == null) {
      errors.push(
        issue(
          'COCKTAIL_TIER_INVALID',
          'error',
          `Unknown cocktail tier "${c.tier}".`,
          `cocktail_candidates/${c.drink_key}`,
        ),
      )
      continue
    }
    if (c.points !== expected) {
      errors.push(
        issue(
          'COCKTAIL_TIER_POINTS_MISMATCH',
          'error',
          `Cocktail "${c.drink_key}" tier "${c.tier}" requires ${expected} points, got ${c.points}.`,
          `cocktail_candidates/${c.drink_key}`,
        ),
      )
    }
    const { eligible, reasons } = isCocktailEligible(doc, c)
    for (const r of reasons) {
      if (r.severity === 'error') errors.push(r)
      else warnings.push(r)
    }
    // Count distinct concepts only (duplicate concepts already cross-ref rejected).
    if (eligible && c.points === expected) cocktailEligible += 1
  }

  for (const c of doc.ingredient_candidates) {
    const expected = INGREDIENT_TIER_POINTS[c.tier as IngredientTier]
    const coverage = INGREDIENT_TIER_BAR_COVERAGE[c.tier as IngredientTier]
    if (expected == null || coverage == null) {
      errors.push(
        issue(
          'INGREDIENT_TIER_INVALID',
          'error',
          `Unknown ingredient tier "${c.tier}".`,
          `ingredient_candidates/${c.ingredient_key}`,
        ),
      )
      continue
    }
    if (c.points !== expected) {
      errors.push(
        issue(
          'INGREDIENT_TIER_POINTS_MISMATCH',
          'error',
          `Ingredient "${c.ingredient_key}" tier "${c.tier}" requires ${expected} points, got ${c.points}.`,
          `ingredient_candidates/${c.ingredient_key}`,
        ),
      )
    }
    // Declared coverage must match the externally assigned tier band (not auto-reranked).
    if (c.known_bar_count < coverage.min || c.known_bar_count > coverage.max) {
      errors.push(
        issue(
          'INGREDIENT_COVERAGE_TIER_MISMATCH',
          'error',
          `Ingredient "${c.ingredient_key}" tier "${c.tier}" expects ${coverage.min}–${coverage.max} bars, got ${c.known_bar_count}.`,
          `ingredient_candidates/${c.ingredient_key}`,
        ),
      )
    }
    const { eligible, reasons } = isIngredientEligible(doc, c)
    for (const r of reasons) {
      if (r.severity === 'error') errors.push(r)
      else warnings.push(r)
    }
    if (
      eligible &&
      c.points === expected &&
      c.known_bar_count >= coverage.min &&
      c.known_bar_count <= coverage.max
    ) {
      ingredientEligible += 1
    }
  }

  for (const flag of doc.source_notes.uncertainty_flags) {
    warnings.push(
      issue('SOURCE_UNCERTAINTY', 'warning', flag.message, `source_notes/${flag.code}`),
    )
  }

  return { errors, warnings, cocktailEligible, ingredientEligible, unverifiedOfferings }
}

/**
 * Read-only catalog preview. Never writes to the database.
 * Deterministic for the same input document.
 */
export function previewCatalogImport(input: unknown): CatalogPreviewResult {
  const { ok, document, schemaErrors } = validateCatalogStructure(input)
  const metadata = {
    schemaVersion:
      input && typeof input === 'object' && 'schema_version' in input
        ? String((input as CatalogImportDocument).schema_version ?? null)
        : null,
    catalogId:
      input && typeof input === 'object' && 'catalog_id' in input
        ? String((input as CatalogImportDocument).catalog_id ?? null)
        : null,
    baseCatalogId:
      input && typeof input === 'object' && 'base_catalog_id' in input
        ? ((input as CatalogImportDocument).base_catalog_id ?? null)
        : null,
    mode:
      input && typeof input === 'object' && 'mode' in input
        ? String((input as CatalogImportDocument).mode ?? null)
        : null,
  }

  if (!ok || !document) {
    return {
      readiness: 'invalid',
      safeToPublish: false,
      structurallyValid: false,
      schemaErrors,
      crossReferenceErrors: [],
      businessRuleErrors: [],
      warnings: [],
      metadata,
      counts: emptyCounts(),
      shortages: {
        cocktailSlotsRequired: COCKTAIL_SLOT_TARGET,
        cocktailEligibleAvailable: 0,
        cocktailShortage: COCKTAIL_SLOT_TARGET,
        ingredientSlotsRequired: INGREDIENT_SLOT_TARGET,
        ingredientEligibleAvailable: 0,
        ingredientShortage: INGREDIENT_SLOT_TARGET,
      },
      unverifiedOfferings: 0,
      carriedForwardBars: [],
      verifiedBars: [],
      mutatedDatabase: false,
    }
  }

  const crossReferenceErrors = validateCatalogCrossReferences(document)
  const classificationErrors = validateClassificationTags(document)
  const business = validateCatalogBusinessRules(document)
  business.errors.push(...classificationErrors)

  const offerings = document.drinks.reduce((n, d) => n + d.bar_offerings.length, 0)
  const counts = {
    bars: document.bars.length,
    activeBars: document.bars.filter((b) => b.active).length,
    ingredients: document.ingredients.length,
    drinks: document.drinks.length,
    offerings,
    cocktailCandidates: document.cocktail_candidates.length,
    cocktailEligible: business.cocktailEligible,
    ingredientCandidates: document.ingredient_candidates.length,
    ingredientEligible: business.ingredientEligible,
  }

  const shortages = {
    cocktailSlotsRequired: COCKTAIL_SLOT_TARGET,
    cocktailEligibleAvailable: business.cocktailEligible,
    cocktailShortage: Math.max(0, COCKTAIL_SLOT_TARGET - business.cocktailEligible),
    ingredientSlotsRequired: INGREDIENT_SLOT_TARGET,
    ingredientEligibleAvailable: business.ingredientEligible,
    ingredientShortage: Math.max(0, INGREDIENT_SLOT_TARGET - business.ingredientEligible),
  }

  if (shortages.cocktailShortage > 0) {
    business.warnings.push(
      issue(
        'COCKTAIL_POOL_SHORTAGE',
        'warning',
        `Eligible cocktail candidates ${business.cocktailEligible} are short of ${COCKTAIL_SLOT_TARGET} slots by ${shortages.cocktailShortage}.`,
      ),
    )
  }
  if (shortages.ingredientShortage > 0) {
    business.warnings.push(
      issue(
        'INGREDIENT_POOL_SHORTAGE',
        'warning',
        `Eligible ingredient candidates ${business.ingredientEligible} are short of ${INGREDIENT_SLOT_TARGET} slots by ${shortages.ingredientShortage}.`,
      ),
    )
  }

  const hasErrors =
    schemaErrors.length > 0 ||
    crossReferenceErrors.length > 0 ||
    business.errors.length > 0

  let readiness: CatalogPreviewResult['readiness']
  if (hasErrors) {
    // Cross-ref / business errors after schema pass → still may be structurally shaped
    readiness =
      schemaErrors.length === 0 && crossReferenceErrors.length === 0
        ? 'valid_not_ready'
        : schemaErrors.length === 0
          ? 'structurally_valid'
          : 'invalid'
    // If only business rule errors (e.g. over-price candidates), treat as structurally valid but not ready
    if (schemaErrors.length === 0 && crossReferenceErrors.length === 0) {
      readiness = 'valid_not_ready'
    } else if (schemaErrors.length === 0) {
      readiness = 'invalid'
    }
  } else if (shortages.cocktailShortage > 0 || shortages.ingredientShortage > 0) {
    readiness = 'valid_not_ready'
  } else {
    readiness = 'ready_for_scheduling'
  }

  // Hard business errors (over-price as candidate, tier mismatch, etc.) keep not-ready / invalid
  if (business.errors.length > 0 && readiness === 'ready_for_scheduling') {
    readiness = 'valid_not_ready'
  }
  if (crossReferenceErrors.length > 0) {
    readiness = 'invalid'
  }

  return {
    readiness,
    safeToPublish: false,
    structurallyValid: schemaErrors.length === 0,
    schemaErrors,
    crossReferenceErrors,
    businessRuleErrors: business.errors,
    warnings: business.warnings,
    metadata: {
      schemaVersion: document.schema_version,
      catalogId: document.catalog_id,
      baseCatalogId: document.base_catalog_id ?? null,
      mode: document.mode,
      classificationTagAssignments: countClassificationTagAssignments(document),
    },
    counts,
    shortages,
    unverifiedOfferings: business.unverifiedOfferings,
    carriedForwardBars: [...document.source_notes.carried_forward_bar_keys].sort(),
    verifiedBars: [...document.source_notes.verified_bar_keys].sort(),
    mutatedDatabase: false,
  }
}

/**
 * Publish-oriented readiness for staging. The pure TS preview is DB-blind, so `safeToPublish`
 * stays false; staging only requires `ready_for_scheduling` with no errors. The server
 * (admin_stage_catalog_import / admin_preview_catalog_publish) adds the database checks.
 */
export function isReadyToStage(result: CatalogPreviewResult): boolean {
  return (
    result.readiness === 'ready_for_scheduling' &&
    result.structurallyValid &&
    result.schemaErrors.length === 0 &&
    result.crossReferenceErrors.length === 0 &&
    result.businessRuleErrors.length === 0 &&
    result.shortages.cocktailShortage === 0 &&
    result.shortages.ingredientShortage === 0
  )
}

/** Validation summary sent to admin_stage_catalog_import (advisory; server rechecks). */
export interface CatalogStageValidation {
  readiness: CatalogPreviewResult['readiness']
  structurally_valid: boolean
  error_count: number
  warning_count: number
  shortages: {
    cocktail_shortage: number
    ingredient_shortage: number
  }
  counts: CatalogPreviewResult['counts']
  fingerprint: string
  payload_hash?: string
}

export function buildStageValidation(
  result: CatalogPreviewResult,
  payloadHash?: string,
): CatalogStageValidation {
  const out: CatalogStageValidation = {
    readiness: result.readiness,
    structurally_valid: result.structurallyValid,
    error_count:
      result.schemaErrors.length +
      result.crossReferenceErrors.length +
      result.businessRuleErrors.length,
    warning_count: result.warnings.length,
    shortages: {
      cocktail_shortage: result.shortages.cocktailShortage,
      ingredient_shortage: result.shortages.ingredientShortage,
    },
    counts: result.counts,
    fingerprint: previewFingerprint(result),
  }
  if (payloadHash) out.payload_hash = payloadHash
  return out
}

/** Deterministic JSON fingerprint for revalidation tests (sorted key stringify of preview summary). */
export function previewFingerprint(result: CatalogPreviewResult): string {
  return JSON.stringify({
    readiness: result.readiness,
    schema: result.schemaErrors.map((e) => e.code).sort(),
    xref: result.crossReferenceErrors.map((e) => e.code).sort(),
    business: result.businessRuleErrors.map((e) => `${e.code}:${e.path ?? ''}`).sort(),
    warnings: result.warnings.map((e) => e.code).sort(),
    counts: result.counts,
    shortages: result.shortages,
    unverified: result.unverifiedOfferings,
  })
}
