import { describe, expect, it } from 'vitest'
import {
  previewCatalogImport,
  previewFingerprint,
  COCKTAIL_SLOT_TARGET,
  INGREDIENT_SLOT_TARGET,
} from '@/lib/catalog'
import {
  baseCatalogSkeleton,
  buildScheduleReadyCatalog,
  cloneCatalog,
} from '../fixtures/catalog/builders'

describe('catalog import validation', () => {
  it('accepts a structurally valid fixture with resolved cross-references', () => {
    const preview = previewCatalogImport(baseCatalogSkeleton())
    expect(preview.structurallyValid).toBe(true)
    expect(preview.schemaErrors).toEqual([])
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.counts.bars).toBe(5)
    expect(preview.counts.offerings).toBeGreaterThanOrEqual(5)
    // Mai Tai at two bars → distinct offerings
    expect(preview.counts.offerings).toBe(
      baseCatalogSkeleton().drinks.reduce((n, d) => n + d.bar_offerings.length, 0),
    )
    expect(preview.safeToPublish).toBe(false)
    expect(preview.mutatedDatabase).toBe(false)
  })

  it('rejects duplicate canonical keys', () => {
    const doc = cloneCatalog(baseCatalogSkeleton())
    doc.bars.push({ key: 'wake-view', name: 'Dup', deck: null, active: true })
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.some((e) => e.code === 'DUPLICATE_BAR_KEY')).toBe(true)
    expect(preview.readiness).toBe('invalid')
  })

  it('rejects cocktail candidates at undesignated / missing bars', () => {
    const doc = cloneCatalog(baseCatalogSkeleton())
    doc.cocktail_candidates.push({
      drink_key: 'mai-tai',
      designated_bar_key: 'good-spirits',
      tier: 'familiar',
      points: 25,
    })
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.some((e) => e.code === 'COCKTAIL_CANDIDATE_BAR_MISSING')).toBe(
      true,
    )
  })

  it('keeps same-named drinks at different bars as distinct offerings', () => {
    const doc = baseCatalogSkeleton()
    const mai = doc.drinks.find((d) => d.key === 'mai-tai')!
    expect(mai.bar_offerings).toHaveLength(2)
    expect(mai.bar_offerings[0]!.ingredient_keys).not.toEqual(mai.bar_offerings[1]!.ingredient_keys)
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.counts.offerings).toBeGreaterThanOrEqual(2)
  })

  it('rejects unknown ingredients and conflicting aliases', () => {
    const unknown = cloneCatalog(baseCatalogSkeleton())
    unknown.drinks[0]!.bar_offerings[0]!.ingredient_keys.push('no-such-ingredient')
    expect(
      previewCatalogImport(unknown).crossReferenceErrors.some(
        (e) => e.code === 'OFFERING_UNKNOWN_INGREDIENT',
      ),
    ).toBe(true)

    const aliasClash = cloneCatalog(baseCatalogSkeleton())
    aliasClash.ingredients.push({
      key: 'almond-syrup-orgeat',
      name: 'Other Orgeat',
      aliases: ['almond syrup (orgeat)'],
    })
    expect(
      previewCatalogImport(aliasClash).crossReferenceErrors.some((e) => e.code === 'ALIAS_CONFLICT'),
    ).toBe(true)
  })

  it('rejects known over-$15 cocktail candidates', () => {
    const doc = cloneCatalog(baseCatalogSkeleton())
    doc.cocktail_candidates.push({
      drink_key: 'premium-martini',
      designated_bar_key: 'good-spirits',
      tier: 'unusual',
      points: 75,
    })
    const preview = previewCatalogImport(doc)
    expect(preview.businessRuleErrors.some((e) => e.code === 'COCKTAIL_CANDIDATE_OVER_PRICE')).toBe(
      true,
    )
    expect(preview.readiness).not.toBe('ready_for_scheduling')
  })

  it('rejects tier/point mismatches', () => {
    const doc = cloneCatalog(baseCatalogSkeleton())
    doc.cocktail_candidates[0]!.points = 100
    const preview = previewCatalogImport(doc)
    expect(
      preview.businessRuleErrors.some((e) => e.code === 'COCKTAIL_TIER_POINTS_MISMATCH'),
    ).toBe(true)
  })

  it('reports clear shortages for incomplete candidate pools', () => {
    const preview = previewCatalogImport(baseCatalogSkeleton())
    expect(preview.shortages.cocktailShortage).toBeGreaterThan(0)
    expect(preview.shortages.ingredientShortage).toBeGreaterThan(0)
    expect(preview.shortages.cocktailSlotsRequired).toBe(COCKTAIL_SLOT_TARGET)
    expect(preview.shortages.ingredientSlotsRequired).toBe(INGREDIENT_SLOT_TARGET)
    expect(preview.warnings.some((w) => w.code === 'COCKTAIL_POOL_SHORTAGE')).toBe(true)
    expect(preview.warnings.some((w) => w.code === 'INGREDIENT_POOL_SHORTAGE')).toBe(true)
    expect(preview.readiness).toBe('valid_not_ready')
  })

  it('accepts a complete eligible candidate pool as ready_for_scheduling', () => {
    const preview = previewCatalogImport(buildScheduleReadyCatalog(72, 39))
    expect(preview.schemaErrors).toEqual([])
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.shortages.cocktailShortage).toBe(0)
    expect(preview.shortages.ingredientShortage).toBe(0)
    expect(preview.readiness).toBe('ready_for_scheduling')
    expect(preview.safeToPublish).toBe(false)
  })

  it('revalidation is deterministic', () => {
    const doc = buildScheduleReadyCatalog(72, 39)
    const a = previewFingerprint(previewCatalogImport(doc))
    const b = previewFingerprint(previewCatalogImport(cloneCatalog(doc)))
    expect(a).toBe(b)
  })

  it('flags unverified and carried-forward content without inventing candidates', () => {
    const preview = previewCatalogImport(baseCatalogSkeleton())
    expect(preview.unverifiedOfferings).toBeGreaterThan(0)
    expect(preview.carriedForwardBars).toContain('carried-bar')
    expect(preview.counts.cocktailEligible).toBeLessThan(COCKTAIL_SLOT_TARGET)
  })
})
