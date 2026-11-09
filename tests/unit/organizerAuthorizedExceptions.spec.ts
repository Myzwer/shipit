import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isReadyToStage, previewCatalogImport } from '@/lib/catalog'
import { cloneCatalog } from '../fixtures/catalog/builders'

const root = process.cwd()
const POOL = ['lido-bar', 'the-mix', 'promenade-bars', 'star-bar'] as const
const SPECIALS = {
  'tequila-shot': POOL,
  'loaded-corona': POOL,
  'fireball-shot': ['princess-live'],
  'sambuca-shot': ['princess-live'],
} as const

function loadLaunch() {
  return JSON.parse(readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8'))
}

describe('organizer-authorized exceptions (Stage A2)', () => {
  it('launch-candidate includes the four specials at authorized bars only', () => {
    const doc = loadLaunch()
    for (const [drinkKey, bars] of Object.entries(SPECIALS)) {
      const drink = doc.drinks.find((d: { key: string }) => d.key === drinkKey)
      expect(drink, drinkKey).toBeTruthy()
      expect(drink.kind).toBe('other_alcoholic')
      expect(drink.bar_offerings.map((o: { bar_key: string }) => o.bar_key).sort()).toEqual(
        [...bars].sort(),
      )
      for (const offering of drink.bar_offerings) {
        expect(offering.price_usd).toBeNull()
        expect(offering.price_status).toBe('unverified')
        expect(offering.price_evidence_approval_id).toBeUndefined()
        expect(offering.price_evidence_recipe_fingerprint).toBeUndefined()
        expect(offering.classification_tags).toEqual(
          expect.arrayContaining(['collection-excluded', 'organizer-authorized-exception']),
        )
      }
    }
    expect(
      doc.cocktail_candidates.some((c: { drink_key: string }) =>
        Object.keys(SPECIALS).includes(c.drink_key),
      ),
    ).toBe(false)
    expect(doc.source_notes.organizer_authorized_exceptions).toHaveLength(10)
  })

  it('launch-candidate remains stage-ready after exceptions are merged', () => {
    const preview = previewCatalogImport(loadLaunch())
    expect(preview.schemaErrors).toEqual([])
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(isReadyToStage(preview)).toBe(true)
  })

  it('rejects forging Category B evidence or cocktail candidacy on an exception', () => {
    const doc = cloneCatalog(loadLaunch())
    const shot = doc.drinks.find((d) => d.key === 'tequila-shot')!
    shot.bar_offerings[0].price_status = 'approved_filtered_within_limit'
    shot.bar_offerings[0].price_evidence_approval_id = 'star-princess-filtered-source-2026-11-07'
    doc.cocktail_candidates.push({
      drink_key: 'tequila-shot',
      designated_bar_key: 'lido-bar',
      tier: 'familiar',
      points: 25,
      eligible: true,
    })
    const preview = previewCatalogImport(doc)
    const codes = [
      ...preview.schemaErrors,
      ...preview.crossReferenceErrors,
      ...preview.businessRuleErrors,
    ].map((e) => e.code)
    expect(codes).toContain('ORGANIZER_EXCEPTION_FORGED_CATEGORY_B')
    expect(codes).toContain('ORGANIZER_EXCEPTION_IN_COCKTAIL_CANDIDATES')
    expect(isReadyToStage(preview)).toBe(false)
  })
})
