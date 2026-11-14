import { describe, expect, it } from 'vitest'
import scavengerDevChallenges from '../../supabase/seed/scavenger_dev_challenges.json'
import {
  listShipItChallengeIconCoverage,
  resolveShipItChallengeIcon,
  SHIPIT_CHALLENGE_ICON_FALLBACK,
  SHIPIT_CHALLENGE_ICONS,
} from '@/lib/shipit/challengeIcons'
import { resolveIcon, type SemanticIconKey } from '@/ui/icons'

describe('Ship It! challenge icons (Phase S4)', () => {
  it('assigns a valid icon to every catalog challenge', () => {
    const coverage = listShipItChallengeIconCoverage()
    expect(coverage.total_challenges).toBe(50)
    expect(coverage.assigned).toBe(50)
    expect(coverage.missing_keys).toEqual([])
  })

  it('uses about 35–45 distinct icons and never reuses more than twice', () => {
    const coverage = listShipItChallengeIconCoverage()
    expect(coverage.unique_icons).toBeGreaterThanOrEqual(35)
    expect(coverage.unique_icons).toBeLessThanOrEqual(45)
    expect(coverage.over_reused).toEqual([])
    for (const row of coverage.reuse_counts) {
      expect(row.count).toBeLessThanOrEqual(2)
    }
  })

  it('resolves every assigned semantic key through the Pro registry', () => {
    const keys = [...new Set(Object.values(SHIPIT_CHALLENGE_ICONS))] as SemanticIconKey[]
    for (const key of keys) {
      const solid = resolveIcon(key, 'solid')
      const outline = resolveIcon(key, 'outline')
      expect(solid.prefix).toBe('fas')
      expect(outline.prefix).toBe('fal')
      expect(solid.iconName.length).toBeGreaterThan(0)
      expect(outline.iconName).toBe(solid.iconName)
    }
  })

  it('falls back for missing or unknown challenge keys', () => {
    expect(resolveShipItChallengeIcon(null).icon_key).toBe(SHIPIT_CHALLENGE_ICON_FALLBACK)
    expect(resolveShipItChallengeIcon('not-a-real-challenge').source).toBe('fallback')
    expect(resolveShipItChallengeIcon('the-piazza-grandeur')).toEqual({
      ok: true,
      icon_key: 'shipit.stairs',
      source: 'assigned',
    })
  })

  it('keeps stable icons across the seed catalog keys', () => {
    for (const row of scavengerDevChallenges as Array<{ canonical_key: string }>) {
      const first = resolveShipItChallengeIcon(row.canonical_key).icon_key
      const second = resolveShipItChallengeIcon(row.canonical_key).icon_key
      expect(first).toBe(second)
      expect(SHIPIT_CHALLENGE_ICONS[row.canonical_key]).toBe(first)
    }
  })
})
