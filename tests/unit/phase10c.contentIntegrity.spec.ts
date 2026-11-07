import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { previewCatalogImport } from '@/lib/catalog'
import {
  FILTERED_SOURCE_APPROVAL_ID,
  offeringSupportsBountyEligibility,
} from '@/lib/catalog/priceEvidenceApprovals'
import {
  FILTERED_SOURCE_OFFERING_COUNT,
  getApprovedFilteredOffering,
} from '@/lib/catalog/filteredSourceOfferings'
import { cloneCatalog } from '../fixtures/catalog/builders'

const root = process.cwd()

function loadLaunchCandidate() {
  return JSON.parse(readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8'))
}

describe('Phase 10C content integrity', () => {
  it('Category B allowlist covers exactly 191 approved offerings with fingerprints', () => {
    expect(FILTERED_SOURCE_OFFERING_COUNT).toBe(191)
    const doc = loadLaunchCandidate()
    let catB = 0
    for (const d of doc.drinks) {
      for (const o of d.bar_offerings) {
        if (o.price_status !== 'approved_filtered_within_limit') continue
        catB += 1
        expect(o.price_usd).toBeNull()
        expect(o.price_evidence_approval_id).toBe(FILTERED_SOURCE_APPROVAL_ID)
        expect(o.price_evidence_recipe_fingerprint).toMatch(/^[a-f0-9]{64}$/)
        const approved = getApprovedFilteredOffering(d.key, o.bar_key)
        expect(approved).not.toBeNull()
        expect(approved!.recipe_fingerprint).toBe(o.price_evidence_recipe_fingerprint)
        expect(
          offeringSupportsBountyEligibility(o, { drink_key: d.key }),
        ).toBe(true)
      }
    }
    expect(catB).toBe(191)
  })

  it('forged new cocktail at authorized bar with REAL approval ID is not bounty-eligible', () => {
    const doc = cloneCatalog(loadLaunchCandidate())
    const before = previewCatalogImport(doc).counts.cocktailEligible

    doc.drinks.push({
      key: 'forged-neon-sour',
      name: 'Forged Neon Sour',
      kind: 'named_cocktail',
      bar_offerings: [
        {
          bar_key: 'crooners',
          ingredient_keys: ['lime-flavor'],
          display_ingredients: ['Lime', 'Mystery Elixir'],
          price_usd: null,
          price_status: 'approved_filtered_within_limit',
          price_evidence_approval_id: FILTERED_SOURCE_APPROVAL_ID,
          // Borrow a real fingerprint from another drink — identity still fails.
          price_evidence_recipe_fingerprint: doc.drinks
            .flatMap((d: { bar_offerings: Array<{ price_status: string; price_evidence_recipe_fingerprint?: string }> }) =>
              d.bar_offerings,
            )
            .find((o: { price_status: string }) => o.price_status === 'approved_filtered_within_limit')!
            .price_evidence_recipe_fingerprint,
          evidence_reference: 'forged',
        },
      ],
    })
    doc.cocktail_candidates.push({
      drink_key: 'forged-neon-sour',
      designated_bar_key: 'crooners',
      tier: 'familiar',
      points: 25,
      eligible: true,
    })

    const preview = previewCatalogImport(doc)
    expect(
      preview.crossReferenceErrors.some((e) => e.code === 'APPROVED_FILTERED_OFFERING_NOT_IN_SET'),
    ).toBe(true)
    expect(preview.counts.cocktailEligible).toBe(before)
    expect(
      offeringSupportsBountyEligibility(
        doc.drinks.find((d) => d.key === 'forged-neon-sour')!.bar_offerings[0]!,
        { drink_key: 'forged-neon-sour' },
      ),
    ).toBe(false)
  })

  it('materially changed recipe fingerprint fails Category B even for known drink@bar', () => {
    const doc = cloneCatalog(loadLaunchCandidate())
    const drink = doc.drinks.find((d: { key: string }) =>
      d.bar_offerings.some(
        (o: { price_status: string; bar_key: string }) =>
          o.price_status === 'approved_filtered_within_limit' && o.bar_key === 'crooners',
      ),
    )
    expect(drink).toBeTruthy()
    const off = drink.bar_offerings.find(
      (o: { bar_key: string }) => o.bar_key === 'crooners',
    )
    off.price_evidence_recipe_fingerprint = 'a'.repeat(64)
    const preview = previewCatalogImport(doc)
    expect(
      preview.crossReferenceErrors.some((e) => e.code === 'APPROVED_FILTERED_OFFERING_NOT_IN_SET'),
    ).toBe(true)
    expect(offeringSupportsBountyEligibility(off, { drink_key: drink.key })).toBe(false)
  })

  it('printed ingredient map expands canonical keys without inventing bounty objectives', () => {
    const doc = loadLaunchCandidate()
    expect(doc.ingredients.length).toBeGreaterThan(45)
    expect(doc.ingredient_candidates.length).toBe(44)
    const bountyKeys = new Set(doc.ingredient_candidates.map((c: { ingredient_key: string }) => c.ingredient_key))
    expect(bountyKeys.size).toBe(44)
    // Non-bounty mapped ingredients exist (e.g. branded vodka/gin) but are not candidates.
    expect(doc.ingredients.some((i: { key: string }) => i.key === 'meili-vodka')).toBe(true)
    expect(bountyKeys.has('meili-vodka')).toBe(false)

    let empty = 0
    for (const d of doc.drinks) {
      for (const o of d.bar_offerings) {
        if (o.ingredient_keys.length === 0) empty += 1
      }
    }
    // Only genuinely unmapped-only recipes should be empty; should be rare.
    expect(empty).toBeLessThan(15)
  })

  it('launch candidate remains schedule-ready with ≥72/≥39 pools', () => {
    const preview = previewCatalogImport(loadLaunchCandidate())
    expect(preview.readiness).toBe('ready_for_scheduling')
    expect(preview.safeToPublish).toBe(false)
    expect(preview.counts.cocktailEligible).toBeGreaterThanOrEqual(72)
    expect(preview.counts.ingredientEligible).toBeGreaterThanOrEqual(39)
  })

  it('achievement coverage matrix and private roster template exist', () => {
    expect(existsSync(join(root, 'docs/ACHIEVEMENT_EVIDENCE_COVERAGE.md'))).toBe(true)
    expect(existsSync(join(root, 'content/catalogs/printed-ingredient-map-v1.json'))).toBe(true)
    expect(existsSync(join(root, 'content/approvals/filtered-source-offerings-v1.json'))).toBe(true)
    expect(existsSync(join(root, 'private/roster.example/roster.template.json'))).toBe(true)
    expect(existsSync(join(root, 'private/roster/roster.local.json'))).toBe(false)
  })

  it('demo twin matches launch-candidate', () => {
    const a = readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8')
    const b = readFileSync(join(root, 'content/catalogs/development-preview-v1.json'), 'utf8')
    expect(a).toBe(b)
  })
})
