/**
 * QA3A — full_snapshot REPLACEMENT scenarios against the real pure-TS validator.
 *
 * UNIT tests only. They prove what `previewCatalogImport` / `isReadyToStage` say about a
 * proposed replacement document. They do NOT prove the server-side stage/preview/publish
 * checks (live-offer survival, pool refill, overlays) — those live in Postgres.
 */
import { describe, expect, it } from 'vitest'
import { isReadyToStage, previewCatalogImport } from '@/lib/catalog'
import {
  buildScheduleReadyCatalog,
  cloneCatalog,
} from '../../fixtures/catalog/builders'

type Doc = ReturnType<typeof buildScheduleReadyCatalog>

function ready(): Doc {
  return cloneCatalog(buildScheduleReadyCatalog())
}

function activeBarKeys(doc: Doc): string[] {
  return doc.bars.filter((b) => b.active).map((b) => b.key)
}

function allCodes(preview: ReturnType<typeof previewCatalogImport>): string[] {
  return [
    ...preview.schemaErrors.map((e) => e.code),
    ...preview.crossReferenceErrors.map((e) => e.code),
    ...preview.businessRuleErrors.map((e) => e.code),
  ]
}

describe('replacement catalog — baseline', () => {
  it('a completely valid replacement is ready_for_scheduling and ready to stage', () => {
    const doc = ready()
    const preview = previewCatalogImport(doc)
    expect(preview.schemaErrors).toEqual([])
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.readiness).toBe('ready_for_scheduling')
    expect(isReadyToStage(preview)).toBe(true)
    expect(preview.counts.cocktailEligible).toBe(72)
    expect(preview.counts.ingredientEligible).toBe(39)
  })

  it('a replacement with a new catalog_id / base_catalog_id is still ready', () => {
    const doc = ready()
    doc.catalog_id = 'replacement-v2'
    doc.base_catalog_id = 'dev-fixture-schedule-ready-v1'
    const preview = previewCatalogImport(doc)
    expect(preview.metadata.catalogId).toBe('replacement-v2')
    expect(preview.metadata.baseCatalogId).toBe('dev-fixture-schedule-ready-v1')
    expect(isReadyToStage(preview)).toBe(true)
  })
})

describe('replacement catalog — additions', () => {
  it('adds a new drink concept + offering + candidate and stays valid (counts grow, still >= targets)', () => {
    const doc = ready()
    const bar = activeBarKeys(doc)[0]!
    doc.drinks.push({
      key: 'qa-new-concept',
      name: 'QA New Concept',
      kind: 'named_cocktail',
      bar_offerings: [
        {
          bar_key: bar,
          ingredient_keys: ['lime-juice'],
          display_ingredients: ['Lime Juice'],
          price_usd: 13,
          price_status: 'verified_within_limit',
          evidence_reference: 'qa-new-concept',
        },
      ],
    })
    doc.cocktail_candidates.push({
      drink_key: 'qa-new-concept',
      designated_bar_key: bar,
      tier: 'familiar',
      points: 25,
    })
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.counts.cocktailCandidates).toBe(73)
    expect(preview.counts.cocktailEligible).toBe(73)
    expect(preview.shortages.cocktailShortage).toBe(0)
    expect(preview.readiness).toBe('ready_for_scheduling')
    expect(isReadyToStage(preview)).toBe(true)
  })

  it('swaps one candidate for a new concept keeping the pool at exactly 72', () => {
    const doc = ready()
    const removed = doc.cocktail_candidates.pop()!
    const bar = removed.designated_bar_key
    doc.drinks.push({
      key: 'qa-swapped-in',
      name: 'QA Swapped In',
      kind: 'named_cocktail',
      bar_offerings: [
        {
          bar_key: bar,
          ingredient_keys: ['lime-juice'],
          display_ingredients: ['Lime Juice'],
          price_usd: 12,
          price_status: 'verified_within_limit',
        },
      ],
    })
    doc.cocktail_candidates.push({
      drink_key: 'qa-swapped-in',
      designated_bar_key: bar,
      tier: 'interesting',
      points: 50,
    })
    const preview = previewCatalogImport(doc)
    expect(preview.counts.cocktailCandidates).toBe(72)
    expect(preview.counts.cocktailEligible).toBe(72)
    expect(isReadyToStage(preview)).toBe(true)
  })

  it('a new drink without any candidate does not change eligibility counts', () => {
    const doc = ready()
    const bar = activeBarKeys(doc)[0]!
    doc.drinks.push({
      key: 'qa-uncandidated',
      name: 'QA Uncandidated',
      kind: 'named_cocktail',
      bar_offerings: [
        {
          bar_key: bar,
          ingredient_keys: ['lime-juice'],
          display_ingredients: ['Lime Juice'],
          price_usd: 9,
          price_status: 'verified_within_limit',
        },
      ],
    })
    const preview = previewCatalogImport(doc)
    expect(preview.counts.cocktailCandidates).toBe(72)
    expect(preview.counts.cocktailEligible).toBe(72)
    expect(isReadyToStage(preview)).toBe(true)
  })

  it('adds a new ingredient corroborated by two active-bar offerings and a matching candidate', () => {
    const doc = ready()
    const [barA, barB] = activeBarKeys(doc)
    doc.ingredients.push({ key: 'qa-new-ingredient', name: 'QA New Ingredient', aliases: [] })
    for (const [i, bar] of [barA!, barB!].entries()) {
      doc.drinks.push({
        key: `qa-new-ingredient-drink-${i + 1}`,
        name: `QA Evidence ${i + 1}`,
        kind: 'named_cocktail',
        bar_offerings: [
          {
            bar_key: bar,
            ingredient_keys: ['qa-new-ingredient', 'lime-juice'],
            display_ingredients: ['QA New Ingredient', 'Lime Juice'],
            price_usd: 12,
            price_status: 'verified_within_limit',
          },
        ],
      })
    }
    doc.ingredient_candidates.push({
      ingredient_key: 'qa-new-ingredient',
      known_bar_count: 2,
      distinct_qualifying_drinks: 2,
      tier: 'elusive',
      points: 100,
    })
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.counts.ingredientCandidates).toBe(40)
    expect(preview.counts.ingredientEligible).toBe(40)
    expect(isReadyToStage(preview)).toBe(true)
  })

  it('rejects a new ingredient candidate with only one corroborating bar (one-bar objectives excluded)', () => {
    const doc = ready()
    const [barA] = activeBarKeys(doc)
    doc.ingredients.push({ key: 'qa-one-bar', name: 'QA One Bar' })
    doc.drinks.push({
      key: 'qa-one-bar-drink',
      name: 'QA One Bar Drink',
      kind: 'named_cocktail',
      bar_offerings: [
        {
          bar_key: barA!,
          ingredient_keys: ['qa-one-bar'],
          display_ingredients: ['QA One Bar'],
          price_usd: 12,
          price_status: 'verified_within_limit',
        },
      ],
    })
    doc.ingredient_candidates.push({
      ingredient_key: 'qa-one-bar',
      known_bar_count: 2,
      distinct_qualifying_drinks: 1,
      tier: 'elusive',
      points: 100,
    })
    const preview = previewCatalogImport(doc)
    const codes = preview.businessRuleErrors.map((e) => e.code)
    expect(codes).toContain('INGREDIENT_CANDIDATE_ONE_BAR')
    expect(codes).toContain('INGREDIENT_COVERAGE_UNCORROBORATED')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects a new ingredient candidate with no menu evidence at all', () => {
    const doc = ready()
    doc.ingredients.push({ key: 'qa-no-evidence', name: 'QA No Evidence' })
    doc.ingredient_candidates.push({
      ingredient_key: 'qa-no-evidence',
      known_bar_count: 2,
      distinct_qualifying_drinks: 2,
      tier: 'elusive',
      points: 100,
    })
    const preview = previewCatalogImport(doc)
    expect(preview.businessRuleErrors.map((e) => e.code)).toContain(
      'INGREDIENT_CANDIDATE_NO_MENU_EVIDENCE',
    )
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects declared ingredient counts that overstate corroboration', () => {
    const doc = ready()
    doc.ingredient_candidates[0]!.known_bar_count += 1
    doc.ingredient_candidates[1]!.distinct_qualifying_drinks += 1
    const preview = previewCatalogImport(doc)
    const codes = preview.businessRuleErrors.map((e) => e.code)
    expect(codes).toContain('INGREDIENT_COVERAGE_UNCORROBORATED')
    expect(codes).toContain('INGREDIENT_DRINKS_UNCORROBORATED')
    expect(preview.readiness).toBe('valid_not_ready')
    expect(isReadyToStage(preview)).toBe(false)
  })
})

describe('replacement catalog — existing concept at a new bar', () => {
  function addOfferingAtNewBar(doc: Doc) {
    const first = doc.cocktail_candidates[0]!
    const otherBar = activeBarKeys(doc).find((b) => b !== first.designated_bar_key)!
    const drink = doc.drinks.find((d) => d.key === first.drink_key)!
    drink.bar_offerings.push({
      bar_key: otherBar,
      ingredient_keys: ['lime-juice'],
      display_ingredients: ['Lime Juice'],
      price_usd: 11,
      price_status: 'verified_within_limit',
    })
    return { first, otherBar, drink }
  }

  it('is valid when the new offering does NOT add a second candidate for the concept', () => {
    const doc = ready()
    const before = previewCatalogImport(doc).counts
    addOfferingAtNewBar(doc)
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.counts.offerings).toBe(before.offerings + 1)
    expect(preview.counts.drinks).toBe(before.drinks)
    expect(preview.counts.cocktailCandidates).toBe(72)
    expect(preview.counts.cocktailEligible).toBe(72)
    expect(isReadyToStage(preview)).toBe(true)
  })

  it('rejects a second candidate for the same concept at the new bar (DUPLICATE_COCKTAIL_CONCEPT)', () => {
    const doc = ready()
    const { first, otherBar } = addOfferingAtNewBar(doc)
    doc.cocktail_candidates.push({
      drink_key: first.drink_key,
      designated_bar_key: otherBar,
      tier: 'familiar',
      points: 25,
    })
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.map((e) => e.code)).toContain('DUPLICATE_COCKTAIL_CONCEPT')
    // A second concept row must not be counted as a 73rd eligible concept.
    expect(preview.readiness).toBe('invalid')
    expect(isReadyToStage(preview)).toBe(false)
  })
})

describe('replacement catalog — renames, removals, moves', () => {
  it('renaming a concept (name changes, key preserved) stays valid with identical counts', () => {
    const doc = ready()
    const baseline = previewCatalogImport(ready())
    const first = doc.cocktail_candidates[0]!
    const drink = doc.drinks.find((d) => d.key === first.drink_key)!
    drink.name = 'Renamed QA Concept'
    const preview = previewCatalogImport(doc)
    expect(drink.key).toBe(first.drink_key)
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.counts).toEqual(baseline.counts)
    expect(isReadyToStage(preview)).toBe(true)
  })

  it('renaming an ingredient (name changes, key preserved) stays valid', () => {
    const doc = ready()
    const ing = doc.ingredients.find((i) => i.key === 'fixture-ingredient-001')!
    ing.name = 'Renamed Ingredient'
    ing.aliases = ['renamed alias']
    expect(isReadyToStage(previewCatalogImport(doc))).toBe(true)
  })

  it('removing a non-candidate, non-evidence offering keeps the catalog ready', () => {
    const doc = ready()
    const mai = doc.drinks.find((d) => d.key === 'mai-tai')!
    expect(mai.bar_offerings).toHaveLength(2)
    const before = previewCatalogImport(doc).counts.offerings
    // Pool candidates live on fixture-* drinks; the Mai Tai poolside offering is not one.
    mai.bar_offerings = mai.bar_offerings.filter((o) => o.bar_key !== 'poolside')
    const preview = previewCatalogImport(doc)
    expect(preview.counts.offerings).toBe(before - 1)
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(isReadyToStage(preview)).toBe(true)
  })

  it('removing the offering at a candidate\'s designated bar is rejected (COCKTAIL_CANDIDATE_BAR_MISSING)', () => {
    const doc = ready()
    const first = doc.cocktail_candidates[0]!
    const drink = doc.drinks.find((d) => d.key === first.drink_key)!
    const otherBar = activeBarKeys(doc).find((b) => b !== first.designated_bar_key)!
    // Keep the drink schema-valid (minItems 1) by moving its only offering to another bar.
    drink.bar_offerings[0]!.bar_key = otherBar
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.map((e) => e.code)).toContain('COCKTAIL_CANDIDATE_BAR_MISSING')
    expect(preview.readiness).toBe('invalid')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('removing an ingredient evidence drink breaks corroboration and blocks staging', () => {
    const doc = ready()
    const idx = doc.drinks.findIndex((d) => d.key === 'fixture-ingredient-001-drink-01')
    expect(idx).toBeGreaterThanOrEqual(0)
    doc.drinks.splice(idx, 1)
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors.map((e) => e.code)).toContain('INGREDIENT_COVERAGE_UNCORROBORATED')
    expect(preview.readiness).toBe('valid_not_ready')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('deleting a drink that still has a cocktail candidate is rejected', () => {
    const doc = ready()
    const key = doc.cocktail_candidates[0]!.drink_key
    doc.drinks = doc.drinks.filter((d) => d.key !== key)
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.map((e) => e.code)).toContain('COCKTAIL_CANDIDATE_MISSING_DRINK')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('deactivating a bar that hosts a designated candidate is rejected (inactive-bar candidate)', () => {
    const doc = ready()
    const first = doc.cocktail_candidates[0]!
    doc.bars.find((b) => b.key === first.designated_bar_key)!.active = false
    const preview = previewCatalogImport(doc)
    expect(preview.businessRuleErrors.map((e) => e.code)).toContain('COCKTAIL_CANDIDATE_INACTIVE_BAR')
    expect(isReadyToStage(preview)).toBe(false)
  })
})

describe('replacement catalog — duplicates rejected', () => {
  it('rejects duplicate drinks', () => {
    const doc = ready()
    doc.drinks.push(JSON.parse(JSON.stringify(doc.drinks[1]!)))
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.map((e) => e.code)).toContain('DUPLICATE_DRINK_KEY')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects duplicate ingredients', () => {
    const doc = ready()
    doc.ingredients.push({ ...doc.ingredients[0]! })
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.map((e) => e.code)).toContain('DUPLICATE_INGREDIENT_KEY')
    expect(isReadyToStage(preview)).toBe(false)
  })
})

describe('replacement catalog — ingredient aliases and normalization', () => {
  it('rejects the same alias on two ingredients after trim/case/whitespace normalization (ALIAS_CONFLICT)', () => {
    const doc = ready()
    doc.ingredients.push({
      key: 'qa-alias-clash',
      name: 'QA Alias Clash',
      aliases: ['  ALIAS   for   fixture-ingredient-001 '],
    })
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.map((e) => e.code)).toContain('ALIAS_CONFLICT')
    expect(preview.readiness).toBe('invalid')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects an alias that normalizes to another ingredient key (ALIAS_COLLIDES_WITH_KEY)', () => {
    const doc = ready()
    doc.ingredients.push({
      key: 'qa-key-collision',
      name: 'QA Key Collision',
      aliases: ['  Lime-Juice '],
    })
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.map((e) => e.code)).toContain('ALIAS_COLLIDES_WITH_KEY')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects an ingredient name that duplicates another ingredient alias (INGREDIENT_NAME_CONFLICT)', () => {
    const doc = ready()
    // Skeleton ingredient "orgeat" owns alias "almond syrup".
    doc.ingredients.push({ key: 'qa-name-clash', name: 'Almond  Syrup' })
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.map((e) => e.code)).toContain('INGREDIENT_NAME_CONFLICT')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects an ingredient alias that equals another ingredient\'s display name (ALIAS_CONFLICT)', () => {
    const doc = ready()
    doc.ingredients.push({
      key: 'qa-alias-vs-name',
      name: 'QA Alias Vs Name',
      aliases: ['lime juice'],
    })
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.map((e) => e.code)).toContain('ALIAS_CONFLICT')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('allows case/space variants of an alias on the SAME ingredient (no self-conflict)', () => {
    const doc = ready()
    doc.ingredients.find((i) => i.key === 'orgeat')!.aliases = ['Almond Syrup', 'almond   syrup ']
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors).toEqual([])
    expect(isReadyToStage(preview)).toBe(true)
  })

  it('rejects byte-identical duplicate aliases within one ingredient at the schema layer (uniqueItems)', () => {
    const doc = ready()
    doc.ingredients.find((i) => i.key === 'orgeat')!.aliases = ['same', 'same']
    const preview = previewCatalogImport(doc)
    expect(preview.structurallyValid).toBe(false)
    expect(isReadyToStage(preview)).toBe(false)
  })
})

describe('replacement catalog — Mobile Order bar key (catalog-level behavior only)', () => {
  // NOTE: This documents what the CATALOG VALIDATOR does today. Mobile Order is a virtual
  // source seeded in the database (bars.is_virtual). Excluding it from Bar/Cocktail/Ingredient
  // bounties is enforced by DB/RPC rules (`virtual_order_source`, `not_featured_bar`) and is
  // NOT verified by these unit tests. The validator has no mobile-order special-casing.
  const MOBILE_BAR = { key: 'mobile-order', name: 'Mobile Order', deck: null, active: true }

  it('ACCEPTS a mobile-order bar key inserted into a ready catalog (validator is not virtual-aware)', () => {
    const doc = ready()
    const before = previewCatalogImport(doc).counts.bars
    doc.bars.push({ ...MOBILE_BAR })
    const preview = previewCatalogImport(doc)
    expect(preview.schemaErrors).toEqual([])
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.counts.bars).toBe(before + 1)
    expect(preview.readiness).toBe('ready_for_scheduling')
    expect(isReadyToStage(preview)).toBe(true)
  })

  it('REJECTS an is_virtual flag on a bar (schema additionalProperties:false)', () => {
    const doc = ready()
    doc.bars.push({ ...MOBILE_BAR, is_virtual: true } as unknown as (typeof doc.bars)[number])
    const preview = previewCatalogImport(doc)
    expect(preview.structurallyValid).toBe(false)
    expect(preview.schemaErrors.some((e) => e.message.includes('additional properties'))).toBe(true)
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('ACCEPTS a cocktail candidate designated at mobile-order (catalog level; DB blocks scoring)', () => {
    const doc = ready()
    doc.bars.push({ ...MOBILE_BAR })
    doc.drinks.push({
      key: 'qa-mobile-only',
      name: 'QA Mobile Only',
      kind: 'named_cocktail',
      bar_offerings: [
        {
          bar_key: 'mobile-order',
          ingredient_keys: ['lime-juice'],
          display_ingredients: ['Lime Juice'],
          price_usd: 10,
          price_status: 'verified_within_limit',
        },
      ],
    })
    doc.cocktail_candidates.push({
      drink_key: 'qa-mobile-only',
      designated_bar_key: 'mobile-order',
      tier: 'familiar',
      points: 25,
    })
    const preview = previewCatalogImport(doc)
    // Current behavior: no catalog-level rule forbids it. If the product adds one, this
    // expectation should flip to a rejection code.
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.counts.cocktailEligible).toBe(73)
    expect(isReadyToStage(preview)).toBe(true)
  })
})

describe('replacement catalog — eligibility', () => {
  it('rejects a cocktail candidate on a verified_over_limit offering and drops eligible below 72', () => {
    const doc = ready()
    const first = doc.cocktail_candidates[0]!
    const offering = doc.drinks
      .find((d) => d.key === first.drink_key)!
      .bar_offerings.find((o) => o.bar_key === first.designated_bar_key)!
    offering.price_usd = 18
    offering.price_status = 'verified_over_limit'
    const preview = previewCatalogImport(doc)
    expect(preview.businessRuleErrors.map((e) => e.code)).toContain('COCKTAIL_CANDIDATE_OVER_PRICE')
    expect(preview.counts.cocktailEligible).toBe(71)
    expect(preview.shortages.cocktailShortage).toBe(1)
    expect(preview.readiness).not.toBe('ready_for_scheduling')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects a candidate whose price exceeds $15 but is mislabelled within-limit', () => {
    const doc = ready()
    const first = doc.cocktail_candidates[0]!
    const offering = doc.drinks
      .find((d) => d.key === first.drink_key)!
      .bar_offerings.find((o) => o.bar_key === first.designated_bar_key)!
    offering.price_usd = 16
    offering.price_status = 'verified_within_limit'
    const preview = previewCatalogImport(doc)
    expect(allCodes(preview)).toContain('PRICE_STATUS_INCONSISTENT')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('an unverified-price candidate is not eligible, so the catalog is not ready', () => {
    const doc = ready()
    const first = doc.cocktail_candidates[0]!
    const offering = doc.drinks
      .find((d) => d.key === first.drink_key)!
      .bar_offerings.find((o) => o.bar_key === first.designated_bar_key)!
    offering.price_usd = null
    offering.price_status = 'unverified'
    const preview = previewCatalogImport(doc)
    expect(preview.counts.cocktailEligible).toBe(71)
    expect(preview.warnings.map((w) => w.code)).toContain('COCKTAIL_CANDIDATE_UNVERIFIED_PRICE')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('a non-cocktail drink kind cannot be a cocktail candidate', () => {
    const doc = ready()
    const first = doc.cocktail_candidates[0]!
    doc.drinks.find((d) => d.key === first.drink_key)!.kind = 'beer'
    const preview = previewCatalogImport(doc)
    expect(preview.businessRuleErrors.map((e) => e.code)).toContain('COCKTAIL_CANDIDATE_INVALID_KIND')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('tier/points mismatch is rejected', () => {
    const doc = ready()
    doc.cocktail_candidates[0]!.tier = 'familiar'
    doc.cocktail_candidates[0]!.points = 100
    const preview = previewCatalogImport(doc)
    expect(preview.businessRuleErrors.map((e) => e.code)).toContain('COCKTAIL_TIER_POINTS_MISMATCH')
    expect(isReadyToStage(preview)).toBe(false)
  })
})

describe('replacement catalog — unexpected nested properties', () => {
  const cases: Array<[string, (d: Doc) => void, string]> = [
    ['bar', (d) => ((d.bars[0] as any).extra = 1), '/bars/0'],
    ['ingredient', (d) => ((d.ingredients[0] as any).extra = 1), '/ingredients/0'],
    ['drink', (d) => ((d.drinks[0] as any).extra = 1), '/drinks/0'],
    ['bar offering', (d) => ((d.drinks[0]!.bar_offerings[0] as any).extra = 1), '/drinks/0/bar_offerings/0'],
    ['cocktail candidate', (d) => ((d.cocktail_candidates[0] as any).extra = 1), '/cocktail_candidates/0'],
    ['ingredient candidate', (d) => ((d.ingredient_candidates[0] as any).extra = 1), '/ingredient_candidates/0'],
    ['source_notes', (d) => ((d.source_notes as any).extra = 1), '/source_notes'],
    [
      'uncertainty flag',
      (d) => {
        d.source_notes.uncertainty_flags.push({ code: 'X', message: 'lorem ipsum', extra: 1 } as any)
      },
      '/source_notes/uncertainty_flags/0',
    ],
  ]

  it.each(cases)('rejects an unexpected property on a %s (additionalProperties:false)', (_n, mutate, path) => {
    const doc = ready()
    mutate(doc)
    const preview = previewCatalogImport(doc)
    expect(preview.structurallyValid).toBe(false)
    expect(preview.readiness).toBe('invalid')
    const hit = preview.schemaErrors.find((e) => e.path === path)
    expect(hit?.message).toContain('additional properties')
    expect(isReadyToStage(preview)).toBe(false)
  })
})
