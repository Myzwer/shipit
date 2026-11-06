/**
 * Phase 6B2 — second distinct catalog_id variants for publish / rollback tests.
 * Development fixtures only; never production menus.
 */
import { randomUUID } from 'node:crypto'
import { buildScheduleReadyCatalog, cloneCatalog } from '../fixtures/catalog/builders'
import {
  COCKTAIL_TIER_POINTS,
  type CatalogImportDocument,
  type CocktailTier,
} from '@/lib/catalog/types'

export interface VariantOptions {
  catalogId?: string
  baseCatalogId?: string | null
  /** Pool sizes for buildScheduleReadyCatalog (default 80 / 45 leaves reserves). */
  cocktailCount?: number
  ingredientCount?: number
  /** Remove one (drink, bar) offering and its cocktail candidate. */
  dropOffering?: { drinkKey: string; barKey: string }
  /** Rename a drink concept (and its candidate). Old key leaves the catalog. */
  renameDrink?: { from: string; to: string; name?: string }
  /**
   * Keep every existing drink as a plain offering but make the Cocktail pool ONLY
   * `n` brand-new `variant-cocktail-###` drinks.
   */
  replaceCocktailPool?: number
  /** Restrict Cocktail candidates to these drink keys (offerings stay in the catalog). */
  restrictCocktailCandidates?: string[]
  /** Add a plain (non-candidate) drink at a bar. */
  addDrink?: {
    key: string
    name: string
    barKey: string
    kind?: 'named_cocktail' | 'beer' | 'wine' | 'other_alcoholic'
    ingredientKeys?: string[]
  }
  /** Add ingredient keys to an existing offering. */
  addIngredientToOffering?: Array<{ drinkKey: string; barKey: string; ingredientKey: string }>
}

export function uniqueCatalogId(prefix = 'phase6b2-variant'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`
}

const COCKTAIL_TIER_KEYS = Object.keys(COCKTAIL_TIER_POINTS) as CocktailTier[]

/** Distinct catalog_id variant of the schedule-ready fixture catalog. */
export function buildVariantCatalog(opts: VariantOptions = {}): CatalogImportDocument {
  const doc = cloneCatalog(buildScheduleReadyCatalog(opts.cocktailCount ?? 80, opts.ingredientCount ?? 45))
  doc.catalog_id = opts.catalogId ?? uniqueCatalogId()
  doc.base_catalog_id = opts.baseCatalogId ?? null

  if (opts.dropOffering) {
    const { drinkKey, barKey } = opts.dropOffering
    const drink = doc.drinks.find((d) => d.key === drinkKey)
    if (drink) {
      drink.bar_offerings = drink.bar_offerings.filter((o) => o.bar_key !== barKey)
      if (drink.bar_offerings.length === 0) {
        doc.drinks = doc.drinks.filter((d) => d.key !== drinkKey)
      }
    }
    doc.cocktail_candidates = doc.cocktail_candidates.filter(
      (c) => !(c.drink_key === drinkKey && c.designated_bar_key === barKey),
    )
  }

  if (opts.renameDrink) {
    const { from, to, name } = opts.renameDrink
    const drink = doc.drinks.find((d) => d.key === from)
    if (drink) {
      drink.key = to
      drink.name = name ?? drink.name
    }
    for (const c of doc.cocktail_candidates) {
      if (c.drink_key === from) c.drink_key = to
    }
  }

  if (opts.addDrink) {
    const a = opts.addDrink
    doc.drinks.push({
      key: a.key,
      name: a.name,
      kind: a.kind ?? 'named_cocktail',
      bar_offerings: [
        {
          bar_key: a.barKey,
          ingredient_keys: a.ingredientKeys ?? ['lime-juice'],
          display_ingredients: (a.ingredientKeys ?? ['lime-juice']).map((k) => k),
          price_usd: 12,
          price_status: 'verified_within_limit',
          evidence_reference: `variant-${a.key}`,
        },
      ],
    })
  }

  for (const add of opts.addIngredientToOffering ?? []) {
    const offering = doc.drinks
      .find((d) => d.key === add.drinkKey)
      ?.bar_offerings.find((o) => o.bar_key === add.barKey)
    if (offering && !offering.ingredient_keys.includes(add.ingredientKey)) {
      offering.ingredient_keys.push(add.ingredientKey)
      offering.display_ingredients.push(add.ingredientKey)
    }
  }

  if (opts.replaceCocktailPool != null) {
    const activeBars = doc.bars.filter((b) => b.active)
    const candidates = []
    for (let i = 0; i < opts.replaceCocktailPool; i++) {
      const key = `variant-cocktail-${String(i + 1).padStart(3, '0')}`
      const bar = activeBars[i % activeBars.length]!
      const tier = COCKTAIL_TIER_KEYS[i % COCKTAIL_TIER_KEYS.length]!
      doc.drinks.push({
        key,
        name: `Variant Cocktail ${i + 1}`,
        kind: 'named_cocktail',
        bar_offerings: [
          {
            bar_key: bar.key,
            ingredient_keys: ['lime-juice'],
            display_ingredients: ['Lime Juice'],
            price_usd: 10 + (i % 5),
            price_status: 'verified_within_limit',
            evidence_reference: `variant-${key}`,
          },
        ],
      })
      candidates.push({
        drink_key: key,
        designated_bar_key: bar.key,
        tier,
        points: COCKTAIL_TIER_POINTS[tier],
      })
    }
    doc.cocktail_candidates = candidates
  }

  if (opts.restrictCocktailCandidates) {
    const keep = new Set(opts.restrictCocktailCandidates)
    doc.cocktail_candidates = doc.cocktail_candidates.filter((c) => keep.has(c.drink_key))
  }

  return doc
}
