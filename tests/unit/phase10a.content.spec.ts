import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { workingCatalogSummary, WORKING_ACHIEVEMENT_CATALOG } from '@/lib/achievements/workingCatalog'

const root = process.cwd()

function assertLocalSupabaseUrl(url: string) {
  const host = new URL(url).hostname
  const local =
    host === '127.0.0.1' || host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.endsWith('.local')
  if (!local) throw new Error(`DEMO_SAFETY: refusing demo seed against non-local host "${host}".`)
}

describe('Phase 10A content readiness (retained)', () => {
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
    // Local preview may create roster.local.json; it must remain gitignored (never asserted absent).
    expect(gi).toMatch(/private\/roster\//)
  })

  it('working achievement catalog still reports 129 enabled / blocked organizer rows', () => {
    expect(WORKING_ACHIEVEMENT_CATALOG).toHaveLength(140)
    const summary = workingCatalogSummary()
    expect(summary.enabled).toBe(129)
    expect(summary.blocked_organizer).toBe(3)
    expect(summary.blocked_metadata).toBe(8)
  })
})
