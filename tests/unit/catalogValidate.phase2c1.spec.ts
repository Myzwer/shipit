import { describe, expect, it } from 'vitest'
import {
  corroborateIngredientEvidence,
  previewCatalogImport,
  COCKTAIL_SLOT_TARGET,
} from '@/lib/catalog'
import {
  baseCatalogSkeleton,
  buildScheduleReadyCatalog,
  cloneCatalog,
} from '../fixtures/catalog/builders'

describe('Phase 2C.1 catalog readiness contracts', () => {
  it('keeps two bar offerings of one cocktail as distinct menu records', () => {
    const doc = baseCatalogSkeleton()
    const mai = doc.drinks.find((d) => d.key === 'mai-tai')!
    expect(mai.bar_offerings).toHaveLength(2)
    expect(mai.bar_offerings[0]!.bar_key).not.toBe(mai.bar_offerings[1]!.bar_key)
    expect(previewCatalogImport(doc).crossReferenceErrors).toEqual([])
  })

  it('rejects two Cocktail candidates for the same drink concept', () => {
    const doc = cloneCatalog(baseCatalogSkeleton())
    // Second designated bar offering already exists for mai-tai @ poolside.
    doc.cocktail_candidates.push({
      drink_key: 'mai-tai',
      designated_bar_key: 'poolside',
      tier: 'familiar',
      points: 25,
    })
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.some((e) => e.code === 'DUPLICATE_COCKTAIL_CONCEPT')).toBe(
      true,
    )
    expect(preview.readiness).toBe('invalid')
  })

  it('does not treat 72 offering-rows of 71 concepts as scheduling-ready', () => {
    const doc = buildScheduleReadyCatalog(71, 39)
    // Add a 72nd candidate that reuses an existing concept at another bar.
    const first = doc.cocktail_candidates[0]!
    const otherBar = doc.bars.find((b) => b.active && b.key !== first.designated_bar_key)!
    const drink = doc.drinks.find((d) => d.key === first.drink_key)!
    drink.bar_offerings.push({
      bar_key: otherBar.key,
      ingredient_keys: ['lime-juice'],
      display_ingredients: ['Lime Juice'],
      price_usd: 11,
      price_status: 'verified_within_limit',
    })
    doc.cocktail_candidates.push({
      drink_key: first.drink_key,
      designated_bar_key: otherBar.key,
      tier: 'familiar',
      points: 25,
    })
    expect(doc.cocktail_candidates).toHaveLength(72)
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.some((e) => e.code === 'DUPLICATE_COCKTAIL_CONCEPT')).toBe(
      true,
    )
    expect(preview.readiness).not.toBe('ready_for_scheduling')
  })

  it('requires 72 distinct Cocktail concepts for readiness', () => {
    const short = previewCatalogImport(buildScheduleReadyCatalog(71, 39))
    expect(short.shortages.cocktailShortage).toBe(1)
    expect(short.readiness).toBe('valid_not_ready')

    const full = previewCatalogImport(buildScheduleReadyCatalog(72, 39))
    expect(full.counts.cocktailEligible).toBe(COCKTAIL_SLOT_TARGET)
    expect(full.shortages.cocktailShortage).toBe(0)
  })

  it('marks ingredient with zero matching cocktail offerings ineligible', () => {
    const doc = cloneCatalog(baseCatalogSkeleton())
    doc.ingredients.push({ key: 'ghost-syrup', name: 'Ghost Syrup' })
    doc.ingredient_candidates.push({
      ingredient_key: 'ghost-syrup',
      known_bar_count: 5,
      distinct_qualifying_drinks: 3,
      tier: 'hard_to_find',
      points: 75,
    })
    const preview = previewCatalogImport(doc)
    expect(
      preview.businessRuleErrors.some((e) => e.code === 'INGREDIENT_CANDIDATE_NO_MENU_EVIDENCE'),
    ).toBe(true)
    const evidence = corroborateIngredientEvidence(doc, 'ghost-syrup')
    expect(evidence.corroboratedBarCount).toBe(0)
  })

  it('fails readiness when declared bar coverage is fabricated', () => {
    const doc = cloneCatalog(baseCatalogSkeleton())
    // orgeat only exists at 2 active bars; claim 12.
    const orgeat = doc.ingredient_candidates.find((c) => c.ingredient_key === 'orgeat')!
    orgeat.known_bar_count = 12
    orgeat.tier = 'easy_to_find'
    orgeat.points = 25
    const preview = previewCatalogImport(doc)
    expect(
      preview.businessRuleErrors.some((e) => e.code === 'INGREDIENT_COVERAGE_UNCORROBORATED'),
    ).toBe(true)
    expect(preview.readiness).not.toBe('ready_for_scheduling')
  })

  it('keeps ingredient eligible when verified matches support declared tier', () => {
    const doc = cloneCatalog(baseCatalogSkeleton())
    const falernum = doc.ingredient_candidates.find((c) => c.ingredient_key === 'falernum')!
    const evidence = corroborateIngredientEvidence(doc, 'falernum')
    expect(evidence.corroboratedBarCount).toBe(2)
    expect(evidence.corroboratedDrinkCount).toBe(2)
    expect(falernum.known_bar_count).toBe(evidence.corroboratedBarCount)
    const preview = previewCatalogImport(doc)
    expect(
      preview.businessRuleErrors.filter((e) => e.path?.includes('falernum')),
    ).toEqual([])
    expect(preview.counts.ingredientEligible).toBeGreaterThanOrEqual(1)
  })

  it('full 72/39 fixture is ready only with real referenced content', () => {
    const preview = previewCatalogImport(buildScheduleReadyCatalog(72, 39))
    expect(preview.schemaErrors).toEqual([])
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.shortages.cocktailShortage).toBe(0)
    expect(preview.shortages.ingredientShortage).toBe(0)
    expect(preview.readiness).toBe('ready_for_scheduling')
  })

  it('excludes inactive bars from Cocktail eligibility', () => {
    const doc = cloneCatalog(baseCatalogSkeleton())
    doc.cocktail_candidates.push({
      drink_key: 'ghost-highball',
      designated_bar_key: 'inactive-lounge',
      tier: 'familiar',
      points: 25,
    })
    const preview = previewCatalogImport(doc)
    expect(
      preview.businessRuleErrors.some((e) => e.code === 'COCKTAIL_CANDIDATE_INACTIVE_BAR'),
    ).toBe(true)
  })

  it('does not count inactive-bar offerings toward ingredient corroboration', () => {
    const doc = cloneCatalog(baseCatalogSkeleton())
    // dark-rum only on mai-tai@wake-view (active) and ghost-highball@inactive-lounge.
    doc.ingredient_candidates.push({
      ingredient_key: 'dark-rum',
      known_bar_count: 2,
      distinct_qualifying_drinks: 2,
      tier: 'elusive',
      points: 100,
    })
    const evidence = corroborateIngredientEvidence(doc, 'dark-rum')
    expect(evidence.corroboratedBarCount).toBe(1)
    expect(evidence.corroboratedDrinkCount).toBe(1)
    const preview = previewCatalogImport(doc)
    expect(
      preview.businessRuleErrors.some(
        (e) =>
          e.code === 'INGREDIENT_CANDIDATE_ONE_BAR' ||
          e.code === 'INGREDIENT_COVERAGE_UNCORROBORATED',
      ),
    ).toBe(true)
  })
})
