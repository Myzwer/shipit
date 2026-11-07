import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { previewCatalogImport } from '@/lib/catalog/validateCatalog'
import { workingCatalogSummary, WORKING_ACHIEVEMENT_CATALOG } from '@/lib/achievements/workingCatalog'

const root = process.cwd()

function assertLocalSupabaseUrl(url: string) {
  const host = new URL(url).hostname
  const local =
    host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')
  if (!local) throw new Error(`DEMO_SAFETY: refusing demo seed against non-local host "${host}".`)
}

describe('Phase 10A content readiness', () => {
  it('development preview catalog is honest about price evidence and not launch-ready', () => {
    const path = join(root, 'content/catalogs/development-preview-v1.json')
    expect(existsSync(path)).toBe(true)
    const doc = JSON.parse(readFileSync(path, 'utf8'))
    expect(doc.schema_version).toBe('1.1')
    expect(doc.catalog_id).toBe('development-preview-star-princess-v1')
    expect(doc.bars).toHaveLength(13)
    expect(
      doc.source_notes.uncertainty_flags.some(
        (f: { code: string }) => f.code === 'FILTERED_WITHIN_LIMIT_EXACT_PRICE_ABSENT',
      ),
    ).toBe(true)
    expect(doc.source_notes.uncertainty_flags.some((f: { code: string }) => f.code === 'GOOD_SPIRITS_UNVERIFIED')).toBe(
      true,
    )
    expect(doc.drinks.some((d: { name: string }) => /Fixture Cocktail/i.test(d.name))).toBe(false)

    // No fabricated verified prices / $15 ceilings
    for (const d of doc.drinks) {
      for (const o of d.bar_offerings) {
        expect(o.price_status).toBe('unverified')
        expect(o.price_usd).toBeNull()
      }
    }

    const gsCandidate = doc.cocktail_candidates.find(
      (c: { designated_bar_key: string }) => c.designated_bar_key === 'good-spirits-at-sea',
    )
    expect(gsCandidate).toBeUndefined()

    // Provisional pools for local demo seeding only
    expect(doc.cocktail_candidates.length).toBeGreaterThanOrEqual(72)
    expect(doc.ingredient_candidates.length).toBeGreaterThanOrEqual(39)

    const preview = previewCatalogImport(doc)
    expect(preview.safeToPublish).toBe(false)
    expect(preview.mutatedDatabase).toBe(false)
    // Strict Princess Plus: category-2 filter evidence is NOT verified_within_limit
    expect(preview.counts.cocktailEligible).toBe(0)
    expect(preview.counts.ingredientEligible).toBe(0)
    expect(preview.shortages.cocktailShortage).toBe(72)
    expect(preview.shortages.ingredientShortage).toBe(39)
    expect(preview.readiness).not.toBe('ready_for_scheduling')
    expect(['valid_not_ready', 'structurally_valid', 'invalid']).toContain(preview.readiness)
  })

  it('Ship It! seed challenges are 50 authentic titles without [DEV]', () => {
    const rows = JSON.parse(
      readFileSync(join(root, 'supabase/seed/scavenger_dev_challenges.json'), 'utf8'),
    ) as Array<{ title: string; points: number; canonical_key: string }>
    expect(rows).toHaveLength(50)
    expect(rows.every((r) => !r.title.includes('[DEV]'))).toBe(true)
    expect(rows.filter((r) => r.points === 100)).toHaveLength(10)
    expect(rows.filter((r) => r.points === 200)).toHaveLength(10)
    expect(rows.filter((r) => r.points === 300)).toHaveLength(10)
    expect(rows.filter((r) => r.points === 400)).toHaveLength(10)
    expect(rows.filter((r) => r.points === 500)).toHaveLength(10)
    expect(rows.some((r) => r.canonical_key === 'victory-dance')).toBe(true)
  })

  it('demo safety rejects non-local Supabase URLs', () => {
    expect(() => assertLocalSupabaseUrl('http://127.0.0.1:54321')).not.toThrow()
    expect(() => assertLocalSupabaseUrl('http://localhost:54321')).not.toThrow()
    expect(() => assertLocalSupabaseUrl('https://abcdefgh.supabase.co')).toThrow(/DEMO_SAFETY/)
    expect(() => assertLocalSupabaseUrl('https://db.production.example.com')).toThrow(/DEMO_SAFETY/)
  })

  it('private roster/photos stay out of git via ignore rules and only examples are tracked', () => {
    const gi = readFileSync(join(root, '.gitignore'), 'utf8')
    expect(gi).toMatch(/private\/roster\//)
    expect(gi).toMatch(/private\/photos\//)
    expect(existsSync(join(root, 'private/roster.example/roster.template.json'))).toBe(true)
    expect(existsSync(join(root, 'private/photos.example/manifest.template.json'))).toBe(true)
    expect(existsSync(join(root, 'private/roster/roster.local.json'))).toBe(false)
  })

  it('working achievement catalog still reports 129 enabled / blocked organizer rows', () => {
    expect(WORKING_ACHIEVEMENT_CATALOG).toHaveLength(140)
    const summary = workingCatalogSummary()
    expect(summary.enabled).toBe(129)
    expect(summary.blocked_organizer).toBe(3)
    expect(summary.blocked_metadata).toBe(8)
  })
})
