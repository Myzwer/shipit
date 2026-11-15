import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  findMissingOrganizerAuthorizedExceptions,
  previewCatalogImport,
  isReadyToStage,
} from '@/lib/catalog'
import { cloneCatalog } from '../fixtures/catalog/builders'
import { mergeOrganizerAuthorizedExceptions } from '../../scripts/lib/mergeOrganizerAuthorizedExceptions.mjs'

const root = process.cwd()

function loadLaunch() {
  return JSON.parse(readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8'))
}

describe('full-snapshot organizer exception retention (catalog-independent Other Drinks)', () => {
  it('launch-candidate retains all registry exceptions with exclusions', () => {
    const missing = findMissingOrganizerAuthorizedExceptions(loadLaunch())
    expect(missing).toEqual([])
  })

  it('reconstructed snapshot without exceptions is allowed (Other Drinks are app-owned)', () => {
    const stripped = cloneCatalog(loadLaunch())
    stripped.drinks = stripped.drinks.filter(
      (d) =>
        ![
          'tequila-shot',
          'loaded-corona',
          'fireball-shot',
          'sambuca-shot',
          'princess-ultimate-cooler',
        ].includes(d.key),
    )
    stripped.source_notes.organizer_authorized_exceptions = []
    stripped.catalog_id = 'reconstructed-menu-test-v1'

    expect(findMissingOrganizerAuthorizedExceptions(stripped)).toEqual([])

    const previewBefore = previewCatalogImport(stripped)
    const beforeCodes = [
      ...previewBefore.crossReferenceErrors,
      ...previewBefore.businessRuleErrors,
    ].map((e) => e.code)
    expect(beforeCodes.some((code) => code.startsWith('ORGANIZER_EXCEPTION_MISSING'))).toBe(false)

    // Merge remains available for February-style recovery, but is no longer required.
    mergeOrganizerAuthorizedExceptions(stripped)
    expect(findMissingOrganizerAuthorizedExceptions(stripped)).toEqual([])
    const cooler = stripped.drinks.find((d) => d.key === 'princess-ultimate-cooler')!
    expect(cooler.bar_offerings).toHaveLength(4)
    expect(cooler.bar_offerings.every((o) => (o.ingredient_keys || []).length === 0)).toBe(true)
    expect(
      stripped.cocktail_candidates.some((c) => c.drink_key === 'princess-ultimate-cooler'),
    ).toBe(false)

    const previewAfter = previewCatalogImport(stripped)
    const afterCodes = [
      ...previewAfter.crossReferenceErrors,
      ...previewAfter.businessRuleErrors,
    ].map((e) => e.code)
    expect(afterCodes.filter((code) => code.startsWith('ORGANIZER_EXCEPTION_'))).toEqual([])
  })

  it('legacy exception rows still fail closed when tags/price are corrupted', () => {
    const doc = cloneCatalog(loadLaunch())
    const cooler = doc.drinks.find((d) => d.key === 'princess-ultimate-cooler')!
    cooler.bar_offerings[0].classification_tags = ['organizer-authorized-exception']
    const issues = findMissingOrganizerAuthorizedExceptions(doc)
    expect(issues.some((i) => i.code === 'ORGANIZER_EXCEPTION_TAGS_MISSING')).toBe(true)
  })
})
