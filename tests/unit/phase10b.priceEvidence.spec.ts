import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { previewCatalogImport } from '@/lib/catalog'
import {
  FILTERED_SOURCE_APPROVAL_ID,
  offeringSupportsBountyEligibility,
} from '@/lib/catalog/priceEvidenceApprovals'
import { buildScheduleReadyCatalog, cloneCatalog } from '../fixtures/catalog/builders'

const root = process.cwd()

function loadLaunchCandidate() {
  const path = join(root, 'content/catalogs/launch-candidate-v1.json')
  expect(existsSync(path)).toBe(true)
  return JSON.parse(readFileSync(path, 'utf8'))
}

describe('Phase 10B price evidence policy', () => {
  it('launch-candidate uses Category B (not invented $15) and reaches scheduling readiness', () => {
    const doc = loadLaunchCandidate()
    expect(doc.catalog_id).toBe('star-princess-launch-candidate-v1')
    expect(doc.bars).toHaveLength(13)
    expect(doc.source_notes.price_evidence_approvals?.[0]?.approval_id).toBe(
      FILTERED_SOURCE_APPROVAL_ID,
    )

    let catA = 0
    let catB = 0
    let catC = 0
    let catD = 0
    for (const d of doc.drinks) {
      for (const o of d.bar_offerings) {
        if (o.price_status === 'verified_within_limit') {
          catA += 1
          expect(o.price_usd).not.toBeNull()
        } else if (o.price_status === 'approved_filtered_within_limit') {
          catB += 1
          expect(o.price_usd).toBeNull()
          expect(o.price_evidence_approval_id).toBe(FILTERED_SOURCE_APPROVAL_ID)
        } else if (o.price_status === 'unverified') {
          catC += 1
          expect(o.bar_key).toBe('good-spirits-at-sea')
        } else if (o.price_status === 'verified_over_limit') {
          catD += 1
        }
      }
    }
    expect(catA).toBe(0)
    expect(catB).toBe(191)
    expect(catC).toBe(19)
    expect(catD).toBe(0)

    const preview = previewCatalogImport(doc)
    expect(preview.safeToPublish).toBe(false)
    expect(preview.readiness).toBe('ready_for_scheduling')
    expect(preview.counts.cocktailEligible).toBe(79)
    expect(preview.counts.ingredientEligible).toBe(44)

    const pendingGs = doc.cocktail_candidates.filter((c: { eligible?: boolean }) => c.eligible === false)
    expect(pendingGs).toHaveLength(10)
    expect(
      pendingGs.every((c: { designated_bar_key: string }) => c.designated_bar_key === 'good-spirits-at-sea'),
    ).toBe(true)
  })

  it('approved filtered-source offering counts toward bounty eligibility', () => {
    expect(
      offeringSupportsBountyEligibility({
        bar_key: 'crooners',
        price_status: 'approved_filtered_within_limit',
        price_usd: null,
        price_evidence_approval_id: FILTERED_SOURCE_APPROVAL_ID,
      }),
    ).toBe(true)
  })

  it('unapproved unknown-price source does not count toward bounty eligibility', () => {
    expect(
      offeringSupportsBountyEligibility({
        bar_key: 'good-spirits-at-sea',
        price_status: 'unverified',
        price_usd: null,
      }),
    ).toBe(false)
    expect(
      offeringSupportsBountyEligibility({
        bar_key: 'good-spirits-at-sea',
        price_status: 'approved_filtered_within_limit',
        price_usd: null,
        price_evidence_approval_id: FILTERED_SOURCE_APPROVAL_ID,
      }),
    ).toBe(false)
  })

  it('explicit >$15 offering cannot justify a Cocktail Bounty', () => {
    const doc = cloneCatalog(buildScheduleReadyCatalog())
    const before = previewCatalogImport(doc).counts.cocktailEligible
    doc.drinks.push({
      key: 'premium-martini',
      name: 'Premium Martini',
      kind: 'named_cocktail',
      bar_offerings: [
        {
          bar_key: 'wake-view',
          ingredient_keys: ['dark-rum'],
          display_ingredients: ['Dark Rum'],
          price_usd: 22,
          price_status: 'verified_over_limit',
          evidence_reference: 'fixture-over-22',
        },
      ],
    })
    doc.cocktail_candidates.push({
      drink_key: 'premium-martini',
      designated_bar_key: 'wake-view',
      tier: 'familiar',
      points: 25,
      eligible: true,
    })
    const preview = previewCatalogImport(doc)
    expect(doc.drinks.some((d) => d.key === 'premium-martini')).toBe(true)
    // Over-limit candidate must not increase the eligible pool.
    expect(preview.counts.cocktailEligible).toBe(before)
    const overIssues = [
      ...preview.businessRuleErrors,
      ...preview.warnings,
      ...preview.crossReferenceErrors,
    ]
    expect(
      overIssues.some((e) => e.code === 'COCKTAIL_CANDIDATE_OVER_PRICE') ||
        !offeringSupportsBountyEligibility({
          bar_key: 'wake-view',
          price_status: 'verified_over_limit',
          price_usd: 22,
        }),
    ).toBe(true)
    expect(
      offeringSupportsBountyEligibility({
        bar_key: 'wake-view',
        price_status: 'verified_over_limit',
        price_usd: 22,
      }),
    ).toBe(false)
  })

  it('ranking cut stays loggable without cocktail candidate', () => {
    const doc = loadLaunchCandidate()
    expect(doc.drinks.some((d: { key: string }) => d.key === 'aperol-spritz')).toBe(true)
    expect(
      doc.cocktail_candidates.some((c: { drink_key: string }) => c.drink_key === 'aperol-spritz'),
    ).toBe(false)
  })

  it('Good Spirits unresolved status remains accurate', () => {
    const doc = loadLaunchCandidate()
    const gs = doc.drinks.flatMap(
      (d: { bar_offerings: Array<{ bar_key: string; price_status: string }> }) =>
        d.bar_offerings.filter((o) => o.bar_key === 'good-spirits-at-sea'),
    )
    expect(gs.length).toBe(19)
    expect(gs.every((o: { price_status: string }) => o.price_status === 'unverified')).toBe(true)
  })

  it('never invents dollar values on Category B offerings', () => {
    const doc = loadLaunchCandidate()
    for (const d of doc.drinks) {
      for (const o of d.bar_offerings) {
        if (o.price_status === 'approved_filtered_within_limit') {
          expect(o.price_usd).toBeNull()
        }
      }
    }
  })

  it('forged approval cannot create Category B eligibility', () => {
    const doc = cloneCatalog(buildScheduleReadyCatalog())
    for (const drink of doc.drinks) {
      for (const o of drink.bar_offerings) {
        o.price_status = 'approved_filtered_within_limit'
        o.price_usd = null
        o.price_evidence_approval_id = 'forged-approval-not-in-allowlist'
      }
    }
    doc.source_notes.price_evidence_approvals = [{ approval_id: 'forged-approval-not-in-allowlist' }]
    const forged = previewCatalogImport(doc)
    expect(forged.crossReferenceErrors.some((e) => e.code === 'APPROVED_FILTERED_UNKNOWN_APPROVAL')).toBe(
      true,
    )
    expect(forged.counts.cocktailEligible).toBe(0)

    const doc2 = cloneCatalog(buildScheduleReadyCatalog())
    for (const drink of doc2.drinks) {
      for (const o of drink.bar_offerings) {
        o.price_status = 'approved_filtered_within_limit'
        o.price_usd = null
        o.price_evidence_approval_id = FILTERED_SOURCE_APPROVAL_ID
      }
    }
    doc2.source_notes.price_evidence_approvals = [{ approval_id: FILTERED_SOURCE_APPROVAL_ID }]
    const wrongBars = previewCatalogImport(doc2)
    expect(
      wrongBars.crossReferenceErrors.some((e) => e.code === 'APPROVED_FILTERED_BAR_NOT_AUTHORIZED'),
    ).toBe(true)

    const doc3 = loadLaunchCandidate()
    let mutated = false
    for (const drink of doc3.drinks) {
      for (const o of drink.bar_offerings) {
        if (o.price_status === 'approved_filtered_within_limit') {
          o.price_usd = 15
          mutated = true
          break
        }
      }
      if (mutated) break
    }
    expect(mutated).toBe(true)
    const invented = previewCatalogImport(doc3)
    expect(invented.crossReferenceErrors.some((e) => e.code === 'APPROVED_FILTERED_INVENTS_PRICE')).toBe(
      true,
    )
  })

  it('evidence_reference / approval_id alone cannot authorize Category B without status', () => {
    expect(
      offeringSupportsBountyEligibility({
        bar_key: 'crooners',
        price_status: 'unverified',
        price_usd: null,
        price_evidence_approval_id: FILTERED_SOURCE_APPROVAL_ID,
      }),
    ).toBe(false)
  })

  it('demo preview artifact matches launch-candidate byte-for-byte', () => {
    const launch = readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8')
    const preview = readFileSync(join(root, 'content/catalogs/development-preview-v1.json'), 'utf8')
    expect(launch).toBe(preview)
  })
})
