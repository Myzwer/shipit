import { describe, expect, it } from 'vitest'
import {
  WORKING_ACHIEVEMENT_CATALOG,
  workingCatalogSummary,
} from '@/lib/achievements/workingCatalog'
import { validateAchievementCondition } from '@/lib/achievements/conditionTypes'
import { composeWorkingAchievements } from '../../scripts/lib/composeWorkingAchievements.mjs'

describe('FINAL working achievement catalog base', () => {
  it('covers FINAL base rows with enabled conditions', () => {
    const summary = workingCatalogSummary()
    expect(summary.total).toBe(140)
    expect(summary.retired ?? 0).toBe(0)
    expect(summary.enabled).toBe(140)
    expect(summary.blocked_organizer ?? 0).toBe(0)
    expect(summary.blocked_metadata ?? 0).toBe(0)

    const refs = WORKING_ACHIEVEMENT_CATALOG.map((r) => r.snapshotRef)
    expect(new Set(refs).size).toBe(140)
    expect(WORKING_ACHIEVEMENT_CATALOG.filter((r) => r.game === 'shipit')).toHaveLength(48)
  })

  it('uses stable keys independent of titles', () => {
    const keys = WORKING_ACHIEVEMENT_CATALOG.map((r) => r.stableKey)
    expect(new Set(keys).size).toBe(140)
    for (const key of keys) {
      expect(key).toMatch(/^working-(drinkit|shipit)-[sd]\d{3}$/)
    }
    const bonVoyage = WORKING_ACHIEVEMENT_CATALOG.find((r) => r.title === 'Bon Voyage!')
    expect(bonVoyage?.stableKey).toBe('working-drinkit-d001')
  })

  it('keeps nine Ship It! exclusive Firsts', () => {
    const exclusives = WORKING_ACHIEVEMENT_CATALOG.filter((r) => r.exclusive)
    expect(exclusives).toHaveLength(9)
    expect(exclusives.every((r) => r.game === 'shipit')).toBe(true)
  })

  it('validates enabled condition configs across composed active catalog', () => {
    const { active } = composeWorkingAchievements()
    for (const row of active) {
      if (!row.enabledInDev || !row.conditionType || !row.conditionConfig) continue
      const res = validateAchievementCondition({
        type: row.conditionType,
        ...row.conditionConfig,
      })
      expect(res.ok, `${row.snapshotRef} ${row.stableKey}`).toBe(true)
    }
  })

  it('enables previously blocked organizer rows that are in FINAL', () => {
    const wrinkles = WORKING_ACHIEVEMENT_CATALOG.find((r) => r.stableKey === 'working-drinkit-d082')
    const limit = WORKING_ACHIEVEMENT_CATALOG.find((r) => r.stableKey === 'working-drinkit-d085')
    expect(wrinkles?.readiness).toBe('enabled')
    expect(limit?.readiness).toBe('enabled')
    expect(wrinkles?.conditionType).toBe('companion_predicate')
    expect(limit?.conditionType).toBe('day_bounty_score')
  })
})
