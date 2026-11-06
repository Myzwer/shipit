/**
 * Approved achievement classification vocabulary for catalog import.
 * Brand knowledge belongs in curated metadata — never inferred at runtime.
 * Display aliases are NOT scoring synonyms and must never appear here.
 */

export const CATALOG_SCHEMA_VERSIONS = ['1.0', '1.1'] as const
export type CatalogSchemaVersion = (typeof CATALOG_SCHEMA_VERSIONS)[number]

/** Preferred version when shipping curated classification metadata. */
export const CATALOG_SCHEMA_VERSION_CURRENT = '1.1' as const

export const INGREDIENT_CLASSIFICATION_TAGS = [
  'spirit-family-gin',
  'spirit-family-vodka',
  'spirit-family-rum',
  'spirit-family-tequila',
  'spirit-family-mezcal',
  'spirit-family-whiskey',
  'spirit-family-bourbon',
  'spirit-family-brandy',
  'spirit-family-cognac',
  'spirit-family-liqueur',
  'spirit-family-other',
  'spirit-clear',
  'spirit-dark',
  'rum-style-white',
  'rum-style-gold',
  'rum-style-dark',
  'rum-style-spiced',
  'rum-style-aged',
  'rum-style-overproof',
  'fruit',
  'fruit-citrus',
  'fruit-berry',
  'fruit-tropical',
  'hot-pepper',
  'wine',
  'rose',
  'prosecco',
  'champagne',
] as const

export const DRINK_CLASSIFICATION_TAGS = [
  'frozen',
  'margarita',
  'mixed-spirits',
] as const

export const OFFERING_CLASSIFICATION_TAGS = [
  'frozen',
  'margarita',
  'mixed-spirits',
] as const

export type IngredientClassificationTag = (typeof INGREDIENT_CLASSIFICATION_TAGS)[number]
export type DrinkClassificationTag = (typeof DRINK_CLASSIFICATION_TAGS)[number]
export type OfferingClassificationTag = (typeof OFFERING_CLASSIFICATION_TAGS)[number]

const ingredientSet = new Set<string>(INGREDIENT_CLASSIFICATION_TAGS)
const drinkSet = new Set<string>(DRINK_CLASSIFICATION_TAGS)
const offeringSet = new Set<string>(OFFERING_CLASSIFICATION_TAGS)

export function isApprovedIngredientTag(tag: string): boolean {
  return ingredientSet.has(tag)
}

export function isApprovedDrinkTag(tag: string): boolean {
  return drinkSet.has(tag)
}

export function isApprovedOfferingTag(tag: string): boolean {
  return offeringSet.has(tag)
}
