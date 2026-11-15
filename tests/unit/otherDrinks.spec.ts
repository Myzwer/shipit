import { describe, expect, it } from 'vitest'
import {
  OTHER_DRINKS_MENU_HIDE_CONCEPT_KEYS,
  OTHER_DRINKS_OPTIONS,
  getOtherDrinksOption,
  otherDrinksGrouped,
} from '@/lib/drinkLog/otherDrinks'
import { buildDrinkPayloadDrink } from '@/lib/drinkLog/api'
import {
  findMissingOrganizerAuthorizedExceptions,
  previewCatalogImport,
  isReadyToStage,
} from '@/lib/catalog'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cloneCatalog } from '../fixtures/catalog/builders'

const root = process.cwd()

describe('Other Drinks catalog-independent list', () => {
  it('exposes exactly 16 options in fixed order', () => {
    expect(OTHER_DRINKS_OPTIONS).toHaveLength(16)
    expect(OTHER_DRINKS_OPTIONS.map((o) => o.label)).toEqual([
      'Wine',
      'Beer',
      'Loaded Corona',
      'Princess Cooler',
      'Tequila Shot',
      'Sambuca Shot',
      'Fireball Shot',
      'Vodka Shot',
      'Rum — Custom Drink',
      'Tequila — Custom Drink',
      'Gin — Custom Drink',
      'Vodka — Custom Drink',
      'Whiskey — Custom Drink',
      'Bourbon — Custom Drink',
      'Tennessee Whiskey — Custom Drink',
      'Scotch — Custom Drink',
    ])
  })

  it('groups General / Shots / Custom without nesting', () => {
    const groups = otherDrinksGrouped()
    expect(groups.map((g) => g.section)).toEqual(['general', 'shots', 'custom'])
    expect(groups[0]?.options).toHaveLength(4)
    expect(groups[1]?.options).toHaveLength(4)
    expect(groups[2]?.options).toHaveLength(8)
    expect(groups.reduce((n, g) => n + g.options.length, 0)).toBe(16)
    expect(OTHER_DRINKS_OPTIONS.some((o) => o.id === 'bourbon-shot')).toBe(false)
  })

  it('maps Princess Cooler to princess-ultimate-cooler identity', () => {
    const cooler = getOtherDrinksOption('princess-cooler')!
    expect(cooler.label).toBe('Princess Cooler')
    expect(cooler.drinkConceptKey).toBe('princess-ultimate-cooler')
  })

  it('hides legacy exception concept keys from photographed menu display', () => {
    expect(OTHER_DRINKS_MENU_HIDE_CONCEPT_KEYS.has('tequila-shot')).toBe(true)
    expect(OTHER_DRINKS_MENU_HIDE_CONCEPT_KEYS.has('princess-ultimate-cooler')).toBe(true)
  })

  it('builds unlisted payload with other_drinks keys and no featured/ingredient honor', () => {
    const payload = buildDrinkPayloadDrink({
      mode: 'unlisted_named',
      displayName: 'Whiskey — Custom Drink',
      customName: 'Whiskey — Custom Drink',
      unlistedDrinkKind: 'named_cocktail',
      otherDrinksKey: 'custom-whiskey',
    })
    expect(payload).toEqual({
      mode: 'unlisted_named',
      custom_name: 'Whiskey — Custom Drink',
      unlisted_drink_kind: 'named_cocktail',
      other_drinks_key: 'custom-whiskey',
    })
    expect(payload).not.toHaveProperty('confirm_featured_cocktail')
    expect(payload).not.toHaveProperty('unlisted_contains_ingredient_key')
  })

  it('adds Tennessee Whiskey and Scotch custom identities after Bourbon', () => {
    const labels = OTHER_DRINKS_OPTIONS.filter((o) => o.section === 'custom').map((o) => o.label)
    expect(labels).toEqual([
      'Rum — Custom Drink',
      'Tequila — Custom Drink',
      'Gin — Custom Drink',
      'Vodka — Custom Drink',
      'Whiskey — Custom Drink',
      'Bourbon — Custom Drink',
      'Tennessee Whiskey — Custom Drink',
      'Scotch — Custom Drink',
    ])
    expect(getOtherDrinksOption('custom-tennessee-whiskey')?.id).toBe('custom-tennessee-whiskey')
    expect(getOtherDrinksOption('custom-scotch')?.logMode).toBe('unlisted_named')
  })
})

describe('organizer exception retention — catalog independence', () => {
  it('February / launch-candidate still validates with embedded exceptions', () => {
    const doc = JSON.parse(
      readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8'),
    )
    expect(findMissingOrganizerAuthorizedExceptions(doc)).toEqual([])
    const preview = previewCatalogImport(doc)
    expect(isReadyToStage(preview)).toBe(true)
  })

  it('new full_snapshot without injected exceptions can validate when otherwise valid', () => {
    const stripped = cloneCatalog(
      JSON.parse(readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8')),
    )
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
    stripped.catalog_id = 'reconstructed-menu-photo-v2'
    stripped.source_notes.evidence_summary = 'Photographed menu reconstruction without Other Drinks rows'

    expect(findMissingOrganizerAuthorizedExceptions(stripped)).toEqual([])
    const preview = previewCatalogImport(stripped)
    const codes = [
      ...preview.crossReferenceErrors,
      ...preview.businessRuleErrors,
    ].map((e) => e.code)
    expect(codes.filter((c) => c.startsWith('ORGANIZER_EXCEPTION_MISSING'))).toEqual([])
  })

  it('still rejects forging Category B / cocktail candidacy on legacy exception rows', () => {
    const doc = cloneCatalog(
      JSON.parse(readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8')),
    )
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
