/**
 * Catalog import types — mirror content/schemas/catalog-import.schema.json.
 * Ranking drafts under handoff/data/rankings are NOT production data.
 */

export const CATALOG_SCHEMA_VERSION = '1.0' as const

export const COCKTAIL_SLOT_TARGET = 72
export const INGREDIENT_SLOT_TARGET = 39

export const COCKTAIL_TIER_POINTS = {
  familiar: 25,
  interesting: 50,
  unusual: 75,
  adventurous: 100,
} as const

export const INGREDIENT_TIER_POINTS = {
  easy_to_find: 25,
  less_common: 50,
  hard_to_find: 75,
  elusive: 100,
} as const

/** Master Game Rules §3.2 working listed-bar coverage ranges. */
export const INGREDIENT_TIER_BAR_COVERAGE = {
  easy_to_find: { min: 11, max: 13 },
  less_common: { min: 7, max: 10 },
  hard_to_find: { min: 4, max: 6 },
  elusive: { min: 2, max: 3 },
} as const

export const PRINCESS_PLUS_PRICE_LIMIT_USD = 15

export type CocktailTier = keyof typeof COCKTAIL_TIER_POINTS
export type IngredientTier = keyof typeof INGREDIENT_TIER_POINTS
export type DrinkKind =
  | 'named_cocktail'
  | 'beer'
  | 'wine'
  | 'other_alcoholic'
  | 'nonalcoholic'
export type PriceStatus =
  | 'verified_within_limit'
  | 'verified_over_limit'
  | 'unverified'
  | 'not_applicable'

export interface CatalogBar {
  key: string
  name: string
  deck?: string | null
  active: boolean
}

export interface CatalogIngredient {
  key: string
  name: string
  aliases?: string[]
  family?: string | null
}

export interface CatalogBarOffering {
  bar_key: string
  ingredient_keys: string[]
  display_ingredients: string[]
  price_usd?: number | null
  price_status: PriceStatus
  evidence_reference?: string | null
  seasonal?: boolean
  availability?: 'standard' | 'seasonal' | 'limited'
}

export interface CatalogDrink {
  key: string
  name: string
  kind: DrinkKind
  bar_offerings: CatalogBarOffering[]
}

export interface CocktailCandidate {
  drink_key: string
  designated_bar_key: string
  tier: CocktailTier
  points: number
  eligible?: boolean
  notes?: string
}

export interface IngredientCandidate {
  ingredient_key: string
  known_bar_count: number
  distinct_qualifying_drinks: number
  tier: IngredientTier
  points: number
  eligible?: boolean
  notes?: string
}

export interface CatalogSourceNotes {
  verified_bar_keys: string[]
  carried_forward_bar_keys: string[]
  uncertainty_flags: Array<{
    code: string
    message: string
    bar_key?: string
    drink_key?: string
  }>
  evidence_summary?: string
}

export interface CatalogImportDocument {
  schema_version: typeof CATALOG_SCHEMA_VERSION | string
  catalog_id: string
  base_catalog_id?: string | null
  mode: 'full_snapshot' | string
  source_notes: CatalogSourceNotes
  bars: CatalogBar[]
  ingredients: CatalogIngredient[]
  drinks: CatalogDrink[]
  cocktail_candidates: CocktailCandidate[]
  ingredient_candidates: IngredientCandidate[]
}

export type CatalogIssueSeverity = 'error' | 'warning'

export interface CatalogIssue {
  code: string
  severity: CatalogIssueSeverity
  message: string
  path?: string
}

export type CatalogReadiness =
  | 'invalid'
  | 'structurally_valid'
  | 'valid_not_ready'
  | 'ready_for_scheduling'

export interface CatalogCounts {
  bars: number
  activeBars: number
  ingredients: number
  drinks: number
  offerings: number
  cocktailCandidates: number
  /** Distinct drink concepts eligible for Cocktail Bounty scheduling. */
  cocktailEligible: number
  ingredientCandidates: number
  /** Ingredient objectives with corroborated multi-bar named-cocktail evidence. */
  ingredientEligible: number
}

/** Corroborated menu evidence for an Ingredient candidate (not player-facing). */
export interface IngredientEvidenceSummary {
  ingredientKey: string
  declaredBarCount: number
  declaredDrinkCount: number
  corroboratedBarCount: number
  corroboratedDrinkCount: number
}

export interface CatalogShortageReport {
  cocktailSlotsRequired: number
  cocktailEligibleAvailable: number
  cocktailShortage: number
  ingredientSlotsRequired: number
  ingredientEligibleAvailable: number
  ingredientShortage: number
}

export interface CatalogPreviewResult {
  readiness: CatalogReadiness
  safeToPublish: false
  structurallyValid: boolean
  schemaErrors: CatalogIssue[]
  crossReferenceErrors: CatalogIssue[]
  businessRuleErrors: CatalogIssue[]
  warnings: CatalogIssue[]
  metadata: {
    schemaVersion: string | null
    catalogId: string | null
    baseCatalogId: string | null
    mode: string | null
  }
  counts: CatalogCounts
  shortages: CatalogShortageReport
  unverifiedOfferings: number
  carriedForwardBars: string[]
  verifiedBars: string[]
  /** Always false in Phase 2C — preview is read-only. */
  mutatedDatabase: false
}
