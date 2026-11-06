import { describe, expect, it } from 'vitest'
import { baseCatalogSkeleton, buildScheduleReadyCatalog } from '../fixtures/catalog/builders'
import {
  previewCatalogImport,
  validateClassificationTags,
  countClassificationTagAssignments,
} from '@/lib/catalog'
import type { CatalogImportDocument } from '@/lib/catalog/types'

describe('catalog classification metadata (Phase 7B0)', () => {
  it('accepts schema 1.1 with curated tags and counts assignments in preview', () => {
    const doc = buildScheduleReadyCatalog(80, 45) as CatalogImportDocument
    doc.schema_version = '1.1'
    doc.ingredients[0].classification_tags = ['spirit-family-rum', 'spirit-dark']
    doc.drinks[0].classification_tags = ['margarita']
    doc.drinks[0].bar_offerings[0].classification_tags = ['frozen']
    const preview = previewCatalogImport(doc)
    expect(preview.schemaErrors).toEqual([])
    expect(preview.businessRuleErrors).toEqual([])
    expect(preview.metadata.classificationTagAssignments).toBe(4)
    expect(countClassificationTagAssignments(doc)).toBe(4)
  })

  it('rejects unknown tags and still accepts 1.0 without tags', () => {
    const bare = baseCatalogSkeleton()
    expect(previewCatalogImport(bare).structurallyValid).toBe(true)

    const bad = buildScheduleReadyCatalog(80, 45) as CatalogImportDocument
    bad.schema_version = '1.1'
    bad.ingredients[0].classification_tags = ['made-up-tag' as never]
    const preview = previewCatalogImport(bad)
    expect(preview.readiness).not.toBe('ready_for_scheduling')
    expect(
      validateClassificationTags(bad).some((e) => e.code === 'UNKNOWN_INGREDIENT_CLASSIFICATION_TAG'),
    ).toBe(true)
  })

  it('treats display aliases as non-scoring (validation ignores alias text)', () => {
    const doc = buildScheduleReadyCatalog(80, 45) as CatalogImportDocument
    doc.schema_version = '1.1'
    doc.ingredients.push({
      key: 'mystery-bottle',
      name: 'Espolon',
      aliases: ['tequila', 'spirit-family-tequila', 'frozen'],
    })
    // No classification_tags — aliases must not be interpreted as tags.
    expect(validateClassificationTags(doc)).toEqual([])
    expect(countClassificationTagAssignments(doc)).toBe(0)
  })
})
