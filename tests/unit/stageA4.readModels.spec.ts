import { describe, expect, it } from 'vitest'
import {
  achievementCategoriesOrdered,
  categoryKeyForGroup,
} from '@/lib/achievements/categories'
import {
  listWorkingAchievementIconCoverage,
  resolveAchievementIconKey,
} from '@/lib/achievements/icons'
import { filterCollectionChecklistItems } from '@/types/achievements'
import { buildBarGauntletDefinitions } from '../../scripts/lib/buildBarGauntletDefinitions.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('Stage A4 category and icon contracts', () => {
  it('orders Drinking with Davids first and Bar Gauntlets last from metadata', () => {
    const ordered = achievementCategoriesOrdered()
    expect(ordered[0].key).toBe('drinking-with-davids')
    expect(ordered[ordered.length - 1].key).toBe('bar-gauntlets')
    expect(ordered[ordered.length - 1].organize_children_by).toBe('bar_key')
    expect(categoryKeyForGroup('drinking_with_davids')).toBe('drinking-with-davids')
  })

  it('derives All / I Need / We Need from checklist flags', () => {
    const items = [
      { offering_id: 'a', concept_key: 'a', display_name: 'A', mine: true, everyone: true },
      { offering_id: 'b', concept_key: 'b', display_name: 'B', mine: false, everyone: true },
      { offering_id: 'c', concept_key: 'c', display_name: 'C', mine: false, everyone: false },
    ]
    expect(filterCollectionChecklistItems(items, 'all')).toHaveLength(3)
    expect(filterCollectionChecklistItems(items, 'i_need').map((i) => i.concept_key)).toEqual([
      'b',
      'c',
    ])
    expect(filterCollectionChecklistItems(items, 'we_need').map((i) => i.concept_key)).toEqual([
      'c',
    ])
  })

  it('reports icon coverage without treating photos as icons', () => {
    const coverage = listWorkingAchievementIconCoverage({ enabledOnly: true })
    expect(coverage.total).toBeGreaterThan(140)
    expect(coverage.missing_icon_keys).toEqual([])
    expect(coverage.unknown_icon_assignments).toEqual([])
    expect(resolveAchievementIconKey('score.friends').ok).toBe(true)
    expect(resolveAchievementIconKey(null).reason).toBe('missing')
    expect(resolveAchievementIconKey('score.friends', { masked: true }).reason).toBe('masked')
  })

  it('skips Good Spirits until within-limit price evidence exists', () => {
    const catalog = JSON.parse(
      readFileSync(join(process.cwd(), 'content/catalogs/launch-candidate-v1.json'), 'utf8'),
    )
    const { report } = buildBarGauntletDefinitions(catalog)
    expect(report.find((r) => r.bar_key === 'good-spirits-at-sea')?.included).toBe(false)
    expect(report.filter((r) => r.included)).toHaveLength(12)
  })
})
