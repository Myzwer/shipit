/**
 * Development-only catalog fixture builders.
 * Not production data. Not derived from handoff ranking drafts.
 */
import type {
  CatalogImportDocument,
  CocktailCandidate,
  CocktailTier,
  IngredientCandidate,
  IngredientTier,
} from '@/lib/catalog/types'
import {
  COCKTAIL_TIER_POINTS,
  INGREDIENT_TIER_POINTS,
} from '@/lib/catalog/types'

const COCKTAIL_TIERS = Object.keys(COCKTAIL_TIER_POINTS) as CocktailTier[]
const INGREDIENT_TIERS = Object.keys(INGREDIENT_TIER_POINTS) as IngredientTier[]

const INGREDIENT_COVERAGE: Record<IngredientTier, number> = {
  easy_to_find: 12,
  less_common: 8,
  hard_to_find: 5,
  elusive: 2,
}

export function baseCatalogSkeleton(): CatalogImportDocument {
  return {
    schema_version: '1.0',
    catalog_id: 'dev-fixture-catalog-v1',
    base_catalog_id: null,
    mode: 'full_snapshot',
    source_notes: {
      verified_bar_keys: ['wake-view', 'good-spirits', 'poolside'],
      carried_forward_bar_keys: ['carried-bar'],
      uncertainty_flags: [],
      evidence_summary: 'Development fixture only — not production menus.',
    },
    bars: [
      { key: 'wake-view', name: 'Wake View', deck: '16', active: true },
      { key: 'good-spirits', name: 'Good Spirits', deck: '5', active: true },
      { key: 'poolside', name: 'Poolside', deck: '15', active: true },
      { key: 'carried-bar', name: 'Carried Forward Bar', deck: null, active: true },
    ],
    ingredients: [
      {
        key: 'orgeat',
        name: 'Orgeat',
        aliases: ['almond syrup (orgeat)', 'almond syrup'],
        family: 'syrup',
      },
      { key: 'lime-juice', name: 'Lime Juice', aliases: ['fresh lime'], family: 'juice' },
      { key: 'dark-rum', name: 'Dark Rum', aliases: [], family: 'spirit' },
      { key: 'falernum', name: 'Falernum', aliases: ['velvet falernum'], family: 'liqueur' },
      { key: 'chartreuse', name: 'Chartreuse', aliases: ['green chartreuse'], family: 'liqueur' },
    ],
    drinks: [
      {
        key: 'mai-tai',
        name: 'Mai Tai',
        kind: 'named_cocktail',
        bar_offerings: [
          {
            bar_key: 'wake-view',
            ingredient_keys: ['orgeat', 'lime-juice', 'dark-rum'],
            display_ingredients: ['Orgeat', 'Lime Juice', 'Dark Rum'],
            price_usd: 12,
            price_status: 'verified_within_limit',
            evidence_reference: 'fixture-wake-view-menu',
          },
          {
            // Same drink concept, different bar — distinct offering + different ingredients.
            bar_key: 'poolside',
            ingredient_keys: ['orgeat', 'lime-juice', 'falernum'],
            display_ingredients: ['Orgeat', 'Lime Juice', 'Falernum'],
            price_usd: 11,
            price_status: 'verified_within_limit',
            evidence_reference: 'fixture-poolside-menu',
          },
        ],
      },
      {
        key: 'chartreuse-swizzle',
        name: 'Chartreuse Swizzle',
        kind: 'named_cocktail',
        bar_offerings: [
          {
            bar_key: 'good-spirits',
            ingredient_keys: ['chartreuse', 'lime-juice'],
            display_ingredients: ['Chartreuse', 'Lime Juice'],
            price_usd: 14,
            price_status: 'verified_within_limit',
            evidence_reference: 'fixture-good-spirits',
          },
        ],
      },
      {
        key: 'house-lager',
        name: 'House Lager',
        kind: 'beer',
        bar_offerings: [
          {
            bar_key: 'poolside',
            ingredient_keys: [],
            display_ingredients: [],
            price_usd: 8,
            price_status: 'not_applicable',
          },
        ],
      },
      {
        key: 'unverified-spritz',
        name: 'Unverified Spritz',
        kind: 'named_cocktail',
        bar_offerings: [
          {
            bar_key: 'carried-bar',
            ingredient_keys: ['lime-juice'],
            display_ingredients: ['Lime Juice'],
            price_usd: null,
            price_status: 'unverified',
            evidence_reference: 'carried-forward',
          },
        ],
      },
      {
        key: 'premium-martini',
        name: 'Premium Martini',
        kind: 'named_cocktail',
        bar_offerings: [
          {
            bar_key: 'good-spirits',
            ingredient_keys: ['lime-juice'],
            display_ingredients: ['Lime Juice'],
            price_usd: 18,
            price_status: 'verified_over_limit',
            evidence_reference: 'fixture-over-limit',
          },
        ],
      },
    ],
    cocktail_candidates: [
      {
        drink_key: 'mai-tai',
        designated_bar_key: 'wake-view',
        tier: 'interesting',
        points: 50,
      },
      {
        drink_key: 'chartreuse-swizzle',
        designated_bar_key: 'good-spirits',
        tier: 'adventurous',
        points: 100,
      },
    ],
    ingredient_candidates: [
      {
        ingredient_key: 'orgeat',
        known_bar_count: 5,
        distinct_qualifying_drinks: 4,
        tier: 'hard_to_find',
        points: 75,
      },
      {
        ingredient_key: 'falernum',
        known_bar_count: 2,
        distinct_qualifying_drinks: 3,
        tier: 'elusive',
        points: 100,
      },
    ],
  }
}

/** Expand skeleton into a schedule-ready pool with N cocktail + M ingredient eligibles. */
export function buildScheduleReadyCatalog(
  cocktailCount = 72,
  ingredientCount = 39,
): CatalogImportDocument {
  const doc = baseCatalogSkeleton()
  doc.catalog_id = 'dev-fixture-schedule-ready-v1'

  const cocktailCandidates: CocktailCandidate[] = []
  for (let i = 0; i < cocktailCount; i++) {
    const key = `fixture-cocktail-${String(i + 1).padStart(3, '0')}`
    const bar = doc.bars[i % 3]!
    const tier = COCKTAIL_TIERS[i % COCKTAIL_TIERS.length]!
    doc.drinks.push({
      key,
      name: `Fixture Cocktail ${i + 1}`,
      kind: 'named_cocktail',
      bar_offerings: [
        {
          bar_key: bar.key,
          ingredient_keys: ['lime-juice'],
          display_ingredients: ['Lime Juice'],
          price_usd: 10 + (i % 5),
          price_status: 'verified_within_limit',
          evidence_reference: `fixture-${key}`,
        },
      ],
    })
    cocktailCandidates.push({
      drink_key: key,
      designated_bar_key: bar.key,
      tier,
      points: COCKTAIL_TIER_POINTS[tier],
    })
  }
  doc.cocktail_candidates = cocktailCandidates

  const ingredientCandidates: IngredientCandidate[] = []
  for (let i = 0; i < ingredientCount; i++) {
    const key = `fixture-ingredient-${String(i + 1).padStart(3, '0')}`
    const tier = INGREDIENT_TIERS[i % INGREDIENT_TIERS.length]!
    doc.ingredients.push({
      key,
      name: `Fixture Ingredient ${i + 1}`,
      aliases: [`alias for ${key}`],
      family: 'fixture',
    })
    ingredientCandidates.push({
      ingredient_key: key,
      known_bar_count: INGREDIENT_COVERAGE[tier],
      distinct_qualifying_drinks: Math.max(2, INGREDIENT_COVERAGE[tier]),
      tier,
      points: INGREDIENT_TIER_POINTS[tier],
    })
  }
  doc.ingredient_candidates = ingredientCandidates
  return doc
}

export function cloneCatalog(doc: CatalogImportDocument): CatalogImportDocument {
  return JSON.parse(JSON.stringify(doc)) as CatalogImportDocument
}
