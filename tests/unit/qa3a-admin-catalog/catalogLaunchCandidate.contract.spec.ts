/**
 * QA3A — launch-candidate-v1.json contract (static file + pure-TS validator).
 *
 * UNIT tests: they read the JSON from disk and run the DB-blind validator. They do not
 * prove the file is staged/published or that the database matches it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  COCKTAIL_SLOT_TARGET,
  INGREDIENT_SLOT_TARGET,
  isReadyToStage,
  previewCatalogImport,
  type CatalogImportDocument,
} from '@/lib/catalog'

const root = join(__dirname, '../../..')

function loadLaunchCandidate(): CatalogImportDocument {
  return JSON.parse(
    readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8'),
  ) as CatalogImportDocument
}

describe('launch-candidate-v1.json contract', () => {
  const doc = loadLaunchCandidate()
  const preview = previewCatalogImport(doc)

  it('identifies as schema 1.1 star-princess-launch-candidate-v1 full_snapshot', () => {
    expect(doc.schema_version).toBe('1.1')
    expect(doc.catalog_id).toBe('star-princess-launch-candidate-v1')
    expect(doc.mode).toBe('full_snapshot')
    expect(preview.metadata.schemaVersion).toBe('1.1')
    expect(preview.metadata.catalogId).toBe('star-princess-launch-candidate-v1')
    expect(preview.metadata.mode).toBe('full_snapshot')
  })

  it('previewCatalogImport accepts it structurally with no schema or cross-reference errors', () => {
    expect(preview.structurallyValid).toBe(true)
    expect(preview.schemaErrors).toEqual([])
    expect(preview.crossReferenceErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.mutatedDatabase).toBe(false)
    // Pure-TS preview is DB-blind and never claims publish safety.
    expect(preview.safeToPublish).toBe(false)
  })

  it('is ready_for_scheduling and ready to stage', () => {
    expect(preview.readiness).toBe('ready_for_scheduling')
    expect(isReadyToStage(preview)).toBe(true)
    expect(preview.shortages.cocktailShortage).toBe(0)
    expect(preview.shortages.ingredientShortage).toBe(0)
  })

  it('has exactly 13 bars', () => {
    expect(doc.bars).toHaveLength(13)
    expect(preview.counts.bars).toBe(13)
    expect(new Set(doc.bars.map((b) => b.key)).size).toBe(13)
  })

  it('has >= 72 eligible cocktail candidates and >= 39 eligible ingredient candidates', () => {
    expect(preview.counts.cocktailEligible).toBeGreaterThanOrEqual(COCKTAIL_SLOT_TARGET)
    expect(preview.counts.ingredientEligible).toBeGreaterThanOrEqual(INGREDIENT_SLOT_TARGET)
    expect(preview.counts.cocktailCandidates).toBeGreaterThanOrEqual(COCKTAIL_SLOT_TARGET)
    expect(preview.counts.ingredientCandidates).toBeGreaterThanOrEqual(INGREDIENT_SLOT_TARGET)
  })

  it('does NOT include the Mobile Order virtual source among the catalog bars', () => {
    const keys = doc.bars.map((b) => b.key)
    expect(keys).not.toContain('mobile-order')
    expect(doc.bars.some((b) => /mobile/i.test(b.key) || /mobile order/i.test(b.name))).toBe(false)
    // ...and no offering or candidate smuggles it in either.
    for (const drink of doc.drinks) {
      for (const offering of drink.bar_offerings) {
        expect(offering.bar_key).not.toBe('mobile-order')
      }
    }
    for (const c of doc.cocktail_candidates) {
      expect(c.designated_bar_key).not.toBe('mobile-order')
    }
    expect(doc.source_notes.verified_bar_keys).not.toContain('mobile-order')
    expect(doc.source_notes.carried_forward_bar_keys).not.toContain('mobile-order')
  })

  it('every bar is active and every candidate designates a listed bar', () => {
    const barKeys = new Set(doc.bars.map((b) => b.key))
    expect(doc.bars.every((b) => b.active)).toBe(true)
    for (const c of doc.cocktail_candidates) {
      expect(barKeys.has(c.designated_bar_key)).toBe(true)
    }
  })

  it('one cocktail candidate per drink concept (no duplicate concepts padding the pool)', () => {
    const concepts = doc.cocktail_candidates.map((c) => c.drink_key)
    expect(new Set(concepts).size).toBe(concepts.length)
  })
})
