import { describe, expect, it } from 'vitest'
import {
  WORKING_ACHIEVEMENT_CATALOG,
  workingCatalogSummary,
} from '@/lib/achievements/workingCatalog'
import { validateAchievementCondition } from '@/lib/achievements/conditionTypes'

describe('working achievement catalog (7B2)', () => {
  it('covers all 140 snapshot rows exactly once', () => {
    const summary = workingCatalogSummary()
    expect(summary.total).toBe(140)
    expect(summary.missing_capability).toBe(0)
    expect(summary.blocked_organizer).toBe(3)
    expect(summary.blocked_metadata).toBe(8)
    expect(summary.enabled).toBe(129)

    const refs = WORKING_ACHIEVEMENT_CATALOG.map((r) => r.snapshotRef)
    expect(new Set(refs).size).toBe(140)
    expect(refs.filter((r) => r.startsWith('S-'))).toHaveLength(48)
    expect(refs.filter((r) => r.startsWith('D-'))).toHaveLength(92)
    expect(refs).not.toContain('D-027')
  })

  it('uses stable keys independent of titles and preserves duplicate titles', () => {
    const keys = WORKING_ACHIEVEMENT_CATALOG.map((r) => r.stableKey)
    expect(new Set(keys).size).toBe(140)
    for (const key of keys) {
      expect(key).toMatch(/^working-(drinkit|shipit)-[sd]\d{3}$/)
    }
    const margaritas = WORKING_ACHIEVEMENT_CATALOG.filter(
      (r) => r.title === 'Wasted away again in Margaritaville',
    )
    expect(margaritas.map((r) => r.snapshotRef).sort()).toEqual(['D-001', 'D-087'])
    expect(new Set(margaritas.map((r) => r.stableKey)).size).toBe(2)
  })

  it('keeps nine Ship It! exclusive Firsts', () => {
    const exclusives = WORKING_ACHIEVEMENT_CATALOG.filter((r) => r.exclusive)
    expect(exclusives).toHaveLength(9)
    expect(exclusives.every((r) => r.game === 'shipit')).toBe(true)
  })

  it('validates enabled condition configs', () => {
    for (const row of WORKING_ACHIEVEMENT_CATALOG) {
      if (!row.enabledInDev || !row.conditionType || !row.conditionConfig) continue
      const res = validateAchievementCondition({
        type: row.conditionType,
        ...row.conditionConfig,
      })
      expect(res.ok, `${row.snapshotRef} ${row.stableKey}`).toBe(true)
    }
  })

  it('does not invent conditions for organizer-blocked rows', () => {
    for (const ref of ['D-082', 'D-083', 'D-085']) {
      const row = WORKING_ACHIEVEMENT_CATALOG.find((r) => r.snapshotRef === ref)!
      expect(row.readiness).toBe('blocked_organizer')
      expect(row.enabledInDev).toBe(false)
      expect(row.conditionType).toBeNull()
    }
  })
})
