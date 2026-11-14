/**
 * QA3A — hostile / malformed catalog inputs against the real pure-TS validator.
 *
 * These are UNIT tests: `previewCatalogImport` and `isReadyToStage` are DB-blind.
 * Nothing here exercises Postgres, RPCs, or the Admin UI.
 */
import { describe, expect, it } from 'vitest'
import {
  COCKTAIL_SLOT_TARGET,
  INGREDIENT_SLOT_TARGET,
  isReadyToStage,
  previewCatalogImport,
} from '@/lib/catalog'
import {
  baseCatalogSkeleton,
  buildScheduleReadyCatalog,
  cloneCatalog,
} from '../../fixtures/catalog/builders'

type Loose = Record<string, any>

/** Mutable, untyped clone of a ready catalog for deliberately-invalid edits. */
function readyLoose(): Loose {
  return cloneCatalog(buildScheduleReadyCatalog()) as unknown as Loose
}

function expectSchemaInvalid(input: unknown) {
  const preview = previewCatalogImport(input)
  expect(preview.structurallyValid).toBe(false)
  expect(preview.readiness).toBe('invalid')
  expect(preview.schemaErrors.length).toBeGreaterThan(0)
  expect(preview.schemaErrors.every((e) => e.code === 'SCHEMA_INVALID')).toBe(true)
  expect(preview.crossReferenceErrors).toEqual([])
  expect(preview.businessRuleErrors).toEqual([])
  expect(preview.counts.bars).toBe(0)
  expect(preview.shortages.cocktailShortage).toBe(COCKTAIL_SLOT_TARGET)
  expect(preview.shortages.ingredientShortage).toBe(INGREDIENT_SLOT_TARGET)
  expect(preview.safeToPublish).toBe(false)
  expect(preview.mutatedDatabase).toBe(false)
  expect(isReadyToStage(preview)).toBe(false)
  return preview
}

describe('catalog validation — hostile roots', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['array root', []],
    ['array root with a valid catalog inside', [baseCatalogSkeleton()]],
    ['string root', 'not a catalog'],
    ['JSON string root', JSON.stringify(baseCatalogSkeleton())],
    ['number root', 42],
    ['boolean root', true],
    ['empty object', {}],
  ])('rejects %s without throwing', (_label, input) => {
    expect(() => previewCatalogImport(input)).not.toThrow()
    expectSchemaInvalid(input)
  })

  it('reports every missing required root field for an empty object', () => {
    const preview = expectSchemaInvalid({})
    const messages = preview.schemaErrors.map((e) => e.message).join('\n')
    for (const field of [
      'schema_version',
      'catalog_id',
      'mode',
      'source_notes',
      'bars',
      'ingredients',
      'drinks',
      'cocktail_candidates',
      'ingredient_candidates',
    ]) {
      expect(messages).toContain(field)
    }
    expect(preview.metadata.schemaVersion).toBeNull()
    expect(preview.metadata.catalogId).toBeNull()
  })

  it.each([
    'schema_version',
    'catalog_id',
    'mode',
    'source_notes',
    'bars',
    'ingredients',
    'drinks',
    'cocktail_candidates',
    'ingredient_candidates',
  ])('rejects a ready catalog missing required root field %s', (field) => {
    const doc = readyLoose()
    delete doc[field]
    const preview = expectSchemaInvalid(doc)
    expect(preview.schemaErrors.some((e) => e.message.includes(field))).toBe(true)
  })
})

describe('catalog validation — wrong field types / unexpected properties', () => {
  it('rejects bars supplied as a string', () => {
    const doc = readyLoose()
    doc.bars = 'wake-view,good-spirits'
    const preview = expectSchemaInvalid(doc)
    expect(preview.schemaErrors.some((e) => e.path === '/bars')).toBe(true)
  })

  it('rejects schema_version supplied as a number (1.0 / 1.1)', () => {
    for (const bad of [1, 1.0, 1.1]) {
      const doc = readyLoose()
      doc.schema_version = bad
      const preview = expectSchemaInvalid(doc)
      expect(preview.schemaErrors.some((e) => e.path === '/schema_version')).toBe(true)
    }
  })

  it.each([
    ['drinks as object', 'drinks', {}],
    ['ingredients as null', 'ingredients', null],
    ['cocktail_candidates as string', 'cocktail_candidates', 'none'],
    ['ingredient_candidates as number', 'ingredient_candidates', 7],
    ['source_notes as array', 'source_notes', []],
    ['catalog_id as number', 'catalog_id', 123],
  ])('rejects %s', (_label, field, value) => {
    const doc = readyLoose()
    doc[field] = value
    expectSchemaInvalid(doc)
  })

  it('rejects a bar with a wrong-typed active flag and an offering with string price', () => {
    const barDoc = readyLoose()
    barDoc.bars[0].active = 'yes'
    expectSchemaInvalid(barDoc)

    const priceDoc = readyLoose()
    priceDoc.drinks[0].bar_offerings[0].price_usd = '12'
    expectSchemaInvalid(priceDoc)
  })

  it('rejects an unexpected property at the root (extra_field)', () => {
    const doc = readyLoose()
    doc.extra_field = 'nope'
    const preview = expectSchemaInvalid(doc)
    expect(preview.schemaErrors.some((e) => e.message.includes('additional properties'))).toBe(true)
  })

  it('rejects mode other than full_snapshot', () => {
    for (const mode of ['delta', 'patch', 'FULL_SNAPSHOT', null, 1]) {
      const doc = readyLoose()
      doc.mode = mode
      const preview = expectSchemaInvalid(doc)
      expect(preview.schemaErrors.some((e) => e.path === '/mode')).toBe(true)
    }
  })

  it('rejects schema_version "2.0" and other unsupported strings', () => {
    for (const version of ['2.0', '1', '1.2', '', 'v1.0']) {
      const doc = readyLoose()
      doc.schema_version = version
      const preview = expectSchemaInvalid(doc)
      expect(preview.schemaErrors.some((e) => e.path === '/schema_version')).toBe(true)
    }
  })

  it('accepts both supported schema_version strings on an otherwise ready catalog', () => {
    for (const version of ['1.0', '1.1'] as const) {
      const doc = readyLoose()
      doc.schema_version = version
      const preview = previewCatalogImport(doc)
      expect(preview.schemaErrors).toEqual([])
      expect(isReadyToStage(preview)).toBe(true)
    }
  })
})

describe('catalog validation — empty collections', () => {
  it('rejects an empty bars array (minItems 1)', () => {
    const doc = readyLoose()
    doc.bars = []
    const preview = expectSchemaInvalid(doc)
    expect(preview.schemaErrors.some((e) => e.path === '/bars')).toBe(true)
  })

  it('rejects a drink with an empty bar_offerings array (minItems 1)', () => {
    const doc = readyLoose()
    doc.drinks[0].bar_offerings = []
    const preview = expectSchemaInvalid(doc)
    expect(preview.schemaErrors.some((e) => e.path === '/drinks/0/bar_offerings')).toBe(true)
  })

  it('accepts empty drinks / candidates structurally but is never ready', () => {
    const doc = readyLoose()
    doc.drinks = []
    doc.cocktail_candidates = []
    doc.ingredient_candidates = []
    const preview = previewCatalogImport(doc)
    expect(preview.structurallyValid).toBe(true)
    expect(preview.readiness).not.toBe('ready_for_scheduling')
    expect(preview.shortages.cocktailShortage).toBe(COCKTAIL_SLOT_TARGET)
    expect(preview.shortages.ingredientShortage).toBe(INGREDIENT_SLOT_TARGET)
    expect(isReadyToStage(preview)).toBe(false)
  })
})

describe('catalog validation — duplicate identifiers', () => {
  it('rejects a duplicate bar key', () => {
    const doc = readyLoose()
    doc.bars.push({ ...doc.bars[0] })
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.some((e) => e.code === 'DUPLICATE_BAR_KEY')).toBe(true)
    expect(preview.readiness).toBe('invalid')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects a duplicate ingredient key', () => {
    const doc = readyLoose()
    doc.ingredients.push({ ...doc.ingredients[0] })
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.some((e) => e.code === 'DUPLICATE_INGREDIENT_KEY')).toBe(
      true,
    )
    expect(preview.readiness).toBe('invalid')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects a duplicate drink concept key', () => {
    const doc = readyLoose()
    doc.drinks.push(JSON.parse(JSON.stringify(doc.drinks[0])))
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.some((e) => e.code === 'DUPLICATE_DRINK_KEY')).toBe(true)
    expect(preview.readiness).toBe('invalid')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects a duplicate offering (same drink at the same bar twice)', () => {
    const doc = readyLoose()
    const drink = doc.drinks.find((d: Loose) => d.key === 'mai-tai')
    drink.bar_offerings.push({ ...drink.bar_offerings[0] })
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.some((e) => e.code === 'DUPLICATE_OFFERING')).toBe(true)
    expect(preview.readiness).toBe('invalid')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects a duplicate cocktail candidate (same drink@bar) and its repeated concept', () => {
    const doc = readyLoose()
    doc.cocktail_candidates.push({ ...doc.cocktail_candidates[0] })
    const preview = previewCatalogImport(doc)
    const codes = preview.crossReferenceErrors.map((e) => e.code)
    expect(codes).toContain('DUPLICATE_COCKTAIL_CANDIDATE')
    expect(codes).toContain('DUPLICATE_COCKTAIL_CONCEPT')
    expect(preview.readiness).toBe('invalid')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects a duplicate ingredient candidate', () => {
    const doc = readyLoose()
    doc.ingredient_candidates.push({ ...doc.ingredient_candidates[0] })
    const preview = previewCatalogImport(doc)
    expect(
      preview.crossReferenceErrors.some((e) => e.code === 'DUPLICATE_INGREDIENT_CANDIDATE'),
    ).toBe(true)
    expect(preview.readiness).toBe('invalid')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('does not let a duplicated cocktail candidate pad the eligible count to reach 72', () => {
    const doc = cloneCatalog(buildScheduleReadyCatalog(71, 39)) as unknown as Loose
    doc.cocktail_candidates.push({ ...doc.cocktail_candidates[0] })
    expect(doc.cocktail_candidates).toHaveLength(72)
    const preview = previewCatalogImport(doc)
    expect(preview.readiness).toBe('invalid')
    expect(isReadyToStage(preview)).toBe(false)
  })
})

describe('catalog validation — unknown references', () => {
  it('rejects an offering at an unknown bar', () => {
    const doc = readyLoose()
    doc.drinks[0].bar_offerings[0].bar_key = 'no-such-bar'
    const preview = previewCatalogImport(doc)
    expect(preview.crossReferenceErrors.some((e) => e.code === 'OFFERING_UNKNOWN_BAR')).toBe(true)
    expect(preview.readiness).toBe('invalid')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects an offering with an unknown ingredient', () => {
    const doc = readyLoose()
    doc.drinks[0].bar_offerings[0].ingredient_keys.push('no-such-ingredient')
    const preview = previewCatalogImport(doc)
    expect(
      preview.crossReferenceErrors.some((e) => e.code === 'OFFERING_UNKNOWN_INGREDIENT'),
    ).toBe(true)
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects a cocktail candidate designating an unknown bar', () => {
    const doc = readyLoose()
    doc.cocktail_candidates[0].designated_bar_key = 'no-such-bar'
    const preview = previewCatalogImport(doc)
    expect(
      preview.crossReferenceErrors.some((e) => e.code === 'COCKTAIL_CANDIDATE_UNKNOWN_BAR'),
    ).toBe(true)
    expect(preview.readiness).toBe('invalid')
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects a cocktail candidate for an unknown drink', () => {
    const doc = readyLoose()
    doc.cocktail_candidates[0].drink_key = 'no-such-drink'
    const preview = previewCatalogImport(doc)
    expect(
      preview.crossReferenceErrors.some((e) => e.code === 'COCKTAIL_CANDIDATE_MISSING_DRINK'),
    ).toBe(true)
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects an ingredient candidate for an unknown ingredient', () => {
    const doc = readyLoose()
    doc.ingredient_candidates[0].ingredient_key = 'no-such-ingredient'
    const preview = previewCatalogImport(doc)
    expect(
      preview.crossReferenceErrors.some((e) => e.code === 'INGREDIENT_CANDIDATE_UNKNOWN'),
    ).toBe(true)
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('rejects source_notes bar keys that are not in bars', () => {
    const verified = readyLoose()
    verified.source_notes.verified_bar_keys.push('ghost-bar')
    expect(
      previewCatalogImport(verified).crossReferenceErrors.some((e) => e.code === 'SOURCE_UNKNOWN_BAR'),
    ).toBe(true)

    const carried = readyLoose()
    carried.source_notes.carried_forward_bar_keys.push('ghost-bar')
    expect(
      previewCatalogImport(carried).crossReferenceErrors.some((e) => e.code === 'SOURCE_UNKNOWN_BAR'),
    ).toBe(true)
  })
})

describe('catalog validation — key patterns', () => {
  it.each([
    ['UPPERCASE bar key', (d: Loose) => (d.bars[0].key = 'WAKE-VIEW')],
    ['bar key with spaces', (d: Loose) => (d.bars[0].key = 'wake view')],
    ['ingredient key UPPERCASE', (d: Loose) => (d.ingredients[0].key = 'Orgeat')],
    ['ingredient key with spaces', (d: Loose) => (d.ingredients[0].key = 'dark rum')],
    ['drink key UPPERCASE', (d: Loose) => (d.drinks[0].key = 'MAI-TAI')],
    ['drink key with spaces', (d: Loose) => (d.drinks[0].key = 'mai tai')],
    ['drink key with underscore', (d: Loose) => (d.drinks[0].key = 'mai_tai')],
    ['drink key with leading hyphen', (d: Loose) => (d.drinks[0].key = '-mai-tai')],
    ['drink key with double hyphen', (d: Loose) => (d.drinks[0].key = 'mai--tai')],
    ['empty key', (d: Loose) => (d.bars[0].key = '')],
    [
      'offering bar_key with spaces',
      (d: Loose) => (d.drinks[0].bar_offerings[0].bar_key = 'wake view'),
    ],
    [
      'candidate drink_key UPPERCASE',
      (d: Loose) => (d.cocktail_candidates[0].drink_key = 'FIXTURE-COCKTAIL-001'),
    ],
    [
      'ingredient candidate key with spaces',
      (d: Loose) => (d.ingredient_candidates[0].ingredient_key = 'fixture ingredient 001'),
    ],
    ['catalog_id UPPERCASE', (d: Loose) => (d.catalog_id = 'Catalog-V1')],
    ['catalog_id with spaces', (d: Loose) => (d.catalog_id = 'catalog v1')],
    ['catalog_id empty', (d: Loose) => (d.catalog_id = '')],
  ])('rejects %s', (_label, mutate) => {
    const doc = readyLoose()
    mutate(doc)
    expectSchemaInvalid(doc)
  })
})

describe('catalog validation — numeric bounds', () => {
  it.each([0, 10, 24, 26, 30, 49, 51, 99, 101, 125, -25, 25.5, '25', null])(
    'rejects cocktail candidate points = %j (only 25/50/75/100 allowed)',
    (points) => {
      const doc = readyLoose()
      doc.cocktail_candidates[0].points = points
      const preview = expectSchemaInvalid(doc)
      expect(preview.schemaErrors.some((e) => e.path === '/cocktail_candidates/0/points')).toBe(true)
    },
  )

  it.each([0, 30, 110, 125, '50'])(
    'rejects ingredient candidate points = %j (only 25/50/75/100 allowed)',
    (points) => {
      const doc = readyLoose()
      doc.ingredient_candidates[0].points = points
      const preview = expectSchemaInvalid(doc)
      expect(preview.schemaErrors.some((e) => e.path === '/ingredient_candidates/0/points')).toBe(
        true,
      )
    },
  )

  it.each([25, 50, 75, 100])('accepts points = %i at the schema layer', (points) => {
    const doc = readyLoose()
    doc.cocktail_candidates[0].points = points
    expect(previewCatalogImport(doc).structurallyValid).toBe(true)
  })

  it.each([-0.01, -1, 500.01, 501, 9999, Number.MAX_SAFE_INTEGER])(
    'rejects price_usd = %j (schema range 0..500)',
    (price) => {
      const doc = readyLoose()
      doc.drinks[0].bar_offerings[0].price_usd = price
      const preview = expectSchemaInvalid(doc)
      expect(
        preview.schemaErrors.some((e) => e.path === '/drinks/0/bar_offerings/0/price_usd'),
      ).toBe(true)
    },
  )

  it.each([0, 0.01, 15, 500])('accepts price_usd = %j at the schema layer', (price) => {
    const doc = readyLoose()
    doc.drinks[0].bar_offerings[0].price_usd = price
    expect(previewCatalogImport(doc).structurallyValid).toBe(true)
  })

  it('rejects known_bar_count above 30 and negative counts', () => {
    const high = readyLoose()
    high.ingredient_candidates[0].known_bar_count = 31
    expectSchemaInvalid(high)

    const negative = readyLoose()
    negative.ingredient_candidates[0].distinct_qualifying_drinks = -1
    expectSchemaInvalid(negative)
  })

  it('does not treat a within-limit price above the $15 ceiling as valid', () => {
    const doc = readyLoose()
    const offering = doc.drinks[0].bar_offerings[0]
    offering.price_usd = 15.01
    offering.price_status = 'verified_within_limit'
    const preview = previewCatalogImport(doc)
    expect(preview.structurallyValid).toBe(true)
    expect(preview.crossReferenceErrors.some((e) => e.code === 'PRICE_STATUS_INCONSISTENT')).toBe(
      true,
    )
    expect(isReadyToStage(preview)).toBe(false)
  })
})

describe('catalog validation — extremely large catalog', () => {
  it('buildScheduleReadyCatalog(400, 200) validates structurally; no size cap is enforced', () => {
    const doc = buildScheduleReadyCatalog(400, 200)
    expect(doc.cocktail_candidates).toHaveLength(400)
    expect(doc.ingredient_candidates).toHaveLength(200)
    expect(doc.drinks.length).toBeGreaterThan(1000)

    const preview = previewCatalogImport(doc)
    // Current behavior: the schema and validator impose no maximum on pool size, so a
    // catalog far over the 72/39 slot targets is structurally valid and ready.
    expect(preview.structurallyValid).toBe(true)
    expect(preview.schemaErrors).toEqual([])
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.counts.cocktailCandidates).toBe(400)
    expect(preview.counts.cocktailEligible).toBe(400)
    expect(preview.counts.ingredientCandidates).toBe(200)
    expect(preview.counts.ingredientEligible).toBe(200)
    expect(preview.shortages.cocktailShortage).toBe(0)
    expect(preview.shortages.ingredientShortage).toBe(0)
    expect(preview.readiness).toBe('ready_for_scheduling')
    expect(isReadyToStage(preview)).toBe(true)
    expect(preview.mutatedDatabase).toBe(false)
  })
})

describe('catalog validation — readiness boundary (72 cocktails / 39 ingredients)', () => {
  it('slot targets are 72 and 39', () => {
    expect(COCKTAIL_SLOT_TARGET).toBe(72)
    expect(INGREDIENT_SLOT_TARGET).toBe(39)
  })

  it('(71, 39) is not ready: one cocktail short', () => {
    const preview = previewCatalogImport(buildScheduleReadyCatalog(71, 39))
    expect(preview.schemaErrors).toEqual([])
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.counts.cocktailEligible).toBe(71)
    expect(preview.shortages.cocktailShortage).toBe(1)
    expect(preview.shortages.ingredientShortage).toBe(0)
    expect(preview.readiness).toBe('valid_not_ready')
    expect(preview.warnings.some((w) => w.code === 'COCKTAIL_POOL_SHORTAGE')).toBe(true)
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('(72, 38) is not ready: one ingredient short', () => {
    const preview = previewCatalogImport(buildScheduleReadyCatalog(72, 38))
    expect(preview.schemaErrors).toEqual([])
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.counts.ingredientEligible).toBe(38)
    expect(preview.shortages.cocktailShortage).toBe(0)
    expect(preview.shortages.ingredientShortage).toBe(1)
    expect(preview.readiness).toBe('valid_not_ready')
    expect(preview.warnings.some((w) => w.code === 'INGREDIENT_POOL_SHORTAGE')).toBe(true)
    expect(isReadyToStage(preview)).toBe(false)
  })

  it('(72, 39) is ready for scheduling and ready to stage', () => {
    const preview = previewCatalogImport(buildScheduleReadyCatalog(72, 39))
    expect(preview.schemaErrors).toEqual([])
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.counts.cocktailEligible).toBe(72)
    expect(preview.counts.ingredientEligible).toBe(39)
    expect(preview.shortages.cocktailShortage).toBe(0)
    expect(preview.shortages.ingredientShortage).toBe(0)
    expect(preview.readiness).toBe('ready_for_scheduling')
    expect(isReadyToStage(preview)).toBe(true)
    // The pure-TS preview is DB-blind and must never claim publish safety.
    expect(preview.safeToPublish).toBe(false)
    expect(preview.mutatedDatabase).toBe(false)
  })

  it('(71, 38) and (0, 0) are not ready', () => {
    expect(isReadyToStage(previewCatalogImport(buildScheduleReadyCatalog(71, 38)))).toBe(false)
    expect(isReadyToStage(previewCatalogImport(buildScheduleReadyCatalog(0, 0)))).toBe(false)
  })
})
