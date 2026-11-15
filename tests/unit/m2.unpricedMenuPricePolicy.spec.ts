import { describe, expect, it } from 'vitest'
import { previewCatalogImport } from '@/lib/catalog'
import {
  offeringSupportsBountyEligibility,
  UNPRICED_MENU_COMPLETENESS,
  unpricedMenuAuthorizedBarKeys,
} from '@/lib/catalog/priceEvidenceApprovals'
import { FILTERED_SOURCE_APPROVAL_ID } from '@/lib/catalog/priceEvidenceApprovals'
import { corroborateIngredientEvidence } from '@/lib/catalog/validateCatalog'
import { buildScheduleReadyCatalog, cloneCatalog } from '../fixtures/catalog/builders'
import type { CatalogImportDocument } from '@/lib/catalog/types'

function authorizeUnpriced(doc: CatalogImportDocument, barKey: string, evidence = `photo:${barKey}-complete`) {
  doc.source_notes.unpriced_menu_authorizations = [
    ...(doc.source_notes.unpriced_menu_authorizations ?? []).filter((a) => a.bar_key !== barKey),
    {
      bar_key: barKey,
      completeness: UNPRICED_MENU_COMPLETENESS,
      evidence_reference: evidence,
    },
  ]
}

describe('M2 Category U unpriced-menu price policy', () => {
  it('$14 and $15 Category A remain bounty-eligible; $16 does not', () => {
    expect(
      offeringSupportsBountyEligibility({
        bar_key: 'wake-view',
        price_status: 'verified_within_limit',
        price_usd: 14,
      }),
    ).toBe(true)
    expect(
      offeringSupportsBountyEligibility({
        bar_key: 'wake-view',
        price_status: 'verified_within_limit',
        price_usd: 15,
      }),
    ).toBe(true)
    expect(
      offeringSupportsBountyEligibility({
        bar_key: 'wake-view',
        price_status: 'verified_over_limit',
        price_usd: 16,
      }),
    ).toBe(false)
    expect(
      offeringSupportsBountyEligibility({
        bar_key: 'wake-view',
        price_status: 'verified_within_limit',
        price_usd: 16,
      }),
    ).toBe(false)
  })

  it('ordinary unverified is not bounty-eligible', () => {
    expect(
      offeringSupportsBountyEligibility({
        bar_key: 'good-spirits',
        price_status: 'unverified',
        price_usd: null,
      }),
    ).toBe(false)
  })

  it('complete unpriced menu with bar authorization is eligible; never invents $15', () => {
    const doc = cloneCatalog(buildScheduleReadyCatalog())
    authorizeUnpriced(doc, 'good-spirits')
    const drink = doc.drinks.find((d) => d.key === 'chartreuse-swizzle')!
    const off = drink.bar_offerings.find((o) => o.bar_key === 'good-spirits')!
    off.price_status = 'approved_unpriced_menu_within_limit'
    off.price_usd = null
    delete off.price_evidence_approval_id
    delete off.price_evidence_recipe_fingerprint

    expect(
      offeringSupportsBountyEligibility(off, {
        drink_key: drink.key,
        unpricedMenuAuthorizedBarKeys: unpricedMenuAuthorizedBarKeys(doc),
      }),
    ).toBe(true)

    off.price_usd = 15
    const invented = previewCatalogImport(doc)
    expect(invented.crossReferenceErrors.some((e) => e.code === 'APPROVED_UNPRICED_INVENTS_PRICE')).toBe(
      true,
    )
  })

  it('Good Spirits eligible under Category U when authorized; not via Category B copy', () => {
    const doc = cloneCatalog(buildScheduleReadyCatalog())
    authorizeUnpriced(doc, 'good-spirits')
    const drink = doc.drinks.find((d) => d.key === 'chartreuse-swizzle')!
    const off = drink.bar_offerings.find((o) => o.bar_key === 'good-spirits')!
    off.price_status = 'approved_unpriced_menu_within_limit'
    off.price_usd = null

    const preview = previewCatalogImport(doc)
    const candidate = preview.counts.cocktailEligible
    expect(candidate).toBeGreaterThan(0)
    expect(
      offeringSupportsBountyEligibility(off, {
        drink_key: drink.key,
        unpricedMenuAuthorizedBarKeys: unpricedMenuAuthorizedBarKeys(doc),
      }),
    ).toBe(true)

    // Copying Category B approval onto Good Spirits remains rejected.
    const forgedB = cloneCatalog(buildScheduleReadyCatalog())
    const gs = forgedB.drinks.find((d) => d.key === 'chartreuse-swizzle')!
    const gso = gs.bar_offerings.find((o) => o.bar_key === 'good-spirits')!
    gso.price_status = 'approved_filtered_within_limit'
    gso.price_usd = null
    gso.price_evidence_approval_id = FILTERED_SOURCE_APPROVAL_ID
    gso.price_evidence_recipe_fingerprint = 'a'.repeat(64)
    forgedB.source_notes.price_evidence_approvals = [{ approval_id: FILTERED_SOURCE_APPROVAL_ID }]
    const badB = previewCatalogImport(forgedB)
    expect(
      badB.crossReferenceErrors.some(
        (e) =>
          e.code === 'APPROVED_FILTERED_BAR_NOT_AUTHORIZED' ||
          e.code === 'APPROVED_FILTERED_OFFERING_NOT_IN_SET',
      ),
    ).toBe(true)
  })

  it('fabricated unpriced status without bar authorization is rejected', () => {
    const doc = cloneCatalog(buildScheduleReadyCatalog())
    const drink = doc.drinks.find((d) => d.key === 'chartreuse-swizzle')!
    const off = drink.bar_offerings.find((o) => o.bar_key === 'good-spirits')!
    off.price_status = 'approved_unpriced_menu_within_limit'
    off.price_usd = null
    const preview = previewCatalogImport(doc)
    expect(
      preview.crossReferenceErrors.some((e) => e.code === 'APPROVED_UNPRICED_BAR_NOT_AUTHORIZED'),
    ).toBe(true)
    expect(
      offeringSupportsBountyEligibility(off, {
        drink_key: drink.key,
        unpricedMenuAuthorizedBarKeys: unpricedMenuAuthorizedBarKeys(doc),
      }),
    ).toBe(false)
  })

  it('authorization for one bar cannot enable another bar', () => {
    const doc = cloneCatalog(buildScheduleReadyCatalog())
    authorizeUnpriced(doc, 'wake-view')
    // Clear printed prices at wake-view first so auth can be valid for that bar alone —
    // convert wake-view offerings to Category U, leave poolside priced.
    for (const drink of doc.drinks) {
      for (const o of drink.bar_offerings) {
        if (o.bar_key === 'wake-view') {
          o.price_status = 'approved_unpriced_menu_within_limit'
          o.price_usd = null
        }
      }
    }
    // Attempt Category U at poolside without auth.
    const mai = doc.drinks.find((d) => d.key === 'mai-tai')!
    const pool = mai.bar_offerings.find((o) => o.bar_key === 'poolside')!
    pool.price_status = 'approved_unpriced_menu_within_limit'
    pool.price_usd = null

    const preview = previewCatalogImport(doc)
    expect(
      preview.crossReferenceErrors.some(
        (e) =>
          e.code === 'APPROVED_UNPRICED_BAR_NOT_AUTHORIZED' &&
          e.message.includes('poolside'),
      ),
    ).toBe(true)
  })

  it('isolated missing price on a priced menu cannot auto-qualify', () => {
    const doc = cloneCatalog(buildScheduleReadyCatalog())
    // wake-view already has printed prices; add an unverified row and try whole-bar auth.
    doc.drinks.push({
      key: 'mystery-missing-price',
      name: 'Mystery Missing Price',
      kind: 'named_cocktail',
      bar_offerings: [
        {
          bar_key: 'wake-view',
          ingredient_keys: ['dark-rum'],
          display_ingredients: ['Dark Rum'],
          price_usd: null,
          price_status: 'unverified',
        },
      ],
    })
    authorizeUnpriced(doc, 'wake-view')
    const preview = previewCatalogImport(doc)
    expect(
      preview.crossReferenceErrors.some((e) => e.code === 'UNPRICED_MENU_BAR_HAS_PRINTED_PRICES'),
    ).toBe(true)
  })

  it('cropped / incomplete price evidence cannot authorize Category U', () => {
    const doc = cloneCatalog(buildScheduleReadyCatalog())
    // Convert good-spirits to unpriced (fixture has Category A there — clear printed prices).
    for (const drink of doc.drinks) {
      for (const o of drink.bar_offerings) {
        if (o.bar_key === 'good-spirits') {
          o.price_status = 'approved_unpriced_menu_within_limit'
          o.price_usd = null
        }
      }
    }
    authorizeUnpriced(doc, 'good-spirits')
    doc.source_notes.uncertainty_flags = [
      {
        code: 'PRICE_AREA_CROPPED',
        message: 'Price column cropped out of frame',
        bar_key: 'good-spirits',
      },
    ]
    const preview = previewCatalogImport(doc)
    expect(
      preview.crossReferenceErrors.some((e) => e.code === 'UNPRICED_MENU_EVIDENCE_INCOMPLETE'),
    ).toBe(true)
  })

  it('ingredient rarity counts an authorized unpriced bar exactly once; over-limit never inflates', () => {
    const doc = cloneCatalog(buildScheduleReadyCatalog())
    // Ensure chartreuse appears at two qualifying bars via Category U at good-spirits
    // and keep Category A at another bar that already lists it — orgeat path is simpler:
    // mai-tai already at wake-view + poolside with orgeat.
    const before = corroborateIngredientEvidence(doc, 'orgeat')
    expect(before.corroboratedBarCount).toBe(2)

    // Add a third offering at a new active bar using Category U.
    if (!doc.bars.some((b) => b.key === 'unpriced-lounge')) {
      doc.bars.push({ key: 'unpriced-lounge', name: 'Unpriced Lounge', deck: '9', active: true })
    }
    authorizeUnpriced(doc, 'unpriced-lounge')
    const mai = doc.drinks.find((d) => d.key === 'mai-tai')!
    mai.bar_offerings.push({
      bar_key: 'unpriced-lounge',
      ingredient_keys: ['orgeat', 'lime-juice', 'dark-rum'],
      display_ingredients: ['Orgeat', 'Lime Juice', 'Dark Rum'],
      price_usd: null,
      price_status: 'approved_unpriced_menu_within_limit',
      evidence_reference: 'photo:unpriced-lounge-complete',
    })
    // Duplicate offering same bar must not double-count (one offering already).
    const after = corroborateIngredientEvidence(doc, 'orgeat')
    expect(after.corroboratedBarCount).toBe(3)

    // Over-limit offering with orgeat must not inflate.
    doc.drinks.push({
      key: 'premium-orgeat-sour',
      name: 'Premium Orgeat Sour',
      kind: 'named_cocktail',
      bar_offerings: [
        {
          bar_key: 'carried-bar',
          ingredient_keys: ['orgeat'],
          display_ingredients: ['Orgeat'],
          price_usd: 18,
          price_status: 'verified_over_limit',
        },
      ],
    })
    const over = corroborateIngredientEvidence(doc, 'orgeat')
    expect(over.corroboratedBarCount).toBe(3)
  })

  it('Category A/B/C/D baseline behavior remains intact on schedule-ready fixture', () => {
    const doc = cloneCatalog(buildScheduleReadyCatalog())
    const preview = previewCatalogImport(doc)
    expect(preview.readiness).toBe('ready_for_scheduling')
    expect(
      offeringSupportsBountyEligibility({
        bar_key: 'wake-view',
        price_status: 'verified_within_limit',
        price_usd: 12,
      }),
    ).toBe(true)
    expect(
      offeringSupportsBountyEligibility({
        bar_key: 'wake-view',
        price_status: 'unverified',
        price_usd: null,
      }),
    ).toBe(false)
  })
})
