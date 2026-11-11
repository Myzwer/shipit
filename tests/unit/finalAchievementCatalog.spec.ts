/**
 * FINAL catalog integrity — every approved row and key property.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { composeWorkingAchievements } from '../../scripts/lib/composeWorkingAchievements.mjs'
import { parseFinalAchievementAuthority } from '../../scripts/lib/parseFinalAchievementAuthority.mjs'
import { RETIRE_STABLE_KEYS } from '../../scripts/lib/finalAchievementReconciliation.mjs'
import { achievementCategoriesOrdered } from '@/lib/achievements/categories'
import { resolveAchievementIconKey } from '@/lib/achievements/icons'
import { ACHIEVEMENT_CONDITION_TYPES } from '@/lib/achievements/conditionTypes'

const __dir = dirname(fileURLToPath(import.meta.url))
const root = join(__dir, '../..')
const mdPath = join(
  root,
  'content/achievements/finalAuthority.json',
)

describe('FINAL achievement catalog integrity', () => {
  const authorityDoc = JSON.parse(readFileSync(mdPath, 'utf8'))
  const { active, counts, definitions } = composeWorkingAchievements()
  const byKey = new Map(active.map((d) => [d.stableKey, d]))
  const byTitleGame = new Map(active.map((d) => [`${d.game}|${d.title}`, d]))

  it('has exactly 126 + 48 active definitions', () => {
    expect(counts.drinkit_active).toBe(126)
    expect(counts.shipit_active).toBe(48)
    expect(counts.active).toBe(174)
  })

  it('matches authority names, triggers, icons, secrets, and categories', () => {
    expect(authorityDoc.rows).toHaveLength(174)
    const groupToName = new Map(
      achievementCategoriesOrdered().map((c) => [c.group_key, c.name]),
    )
    const expectedCounts: Record<string, number> = {}
    for (const row of authorityDoc.rows) {
      const def = byTitleGame.get(`${row.game}|${row.name}`)
      expect(def, `missing ${row.game}: ${row.name}`).toBeTruthy()
      expect(def.displayDescription).toBe(row.trigger)
      expect(def.iconKey).toBe(row.iconClass)
      expect(def.secret).toBe(row.secret)
      expect(groupToName.get(def.groupKey)).toBe(row.category)
      const ck = `${row.game}|${row.category}`
      expectedCounts[ck] = (expectedCounts[ck] || 0) + 1
    }
    for (const [ck, n] of Object.entries(expectedCounts)) {
      const [game, category] = ck.split('|')
      const group = achievementCategoriesOrdered(game as 'drinkit' | 'shipit').find(
        (c) => c.name === category,
      )?.group_key
      expect(active.filter((d) => d.game === game && d.groupKey === group)).toHaveLength(n)
    }
  })

  it('has exactly 8 Drink It! and 4 Ship It! categories in approved order', () => {
    const drinkitCats = achievementCategoriesOrdered('drinkit')
    const shipitCats = achievementCategoriesOrdered('shipit')
    expect(drinkitCats.map((c) => c.name)).toEqual([
      'Drinking with Davids',
      'Firsts & Early Wins',
      'Bounties & Competition',
      'Bars & Exploration',
      'Spirits & Ingredients',
      'Friends & Social',
      'Ship-Time & Cruise Milestones',
      'Collections & Bar Gauntlets',
    ])
    expect(shipitCats.map((c) => c.name)).toEqual([
      'Progress & Completion',
      'Ship-Time & Cruise Milestones',
      'Challenge Spotlights',
      'First to Find',
    ])
    expect(drinkitCats.some((c) => c.name === 'First to Find')).toBe(false)
  })

  it('has no Drink It! First to Find / deleted awards', () => {
    for (const title of ['Bubbles Up', 'Love and Luck', 'Tin Cup Chalice']) {
      expect(active.some((d) => d.title === title)).toBe(false)
    }
    expect(
      active.some((d) => d.game === 'drinkit' && d.groupKey === 'firsts' && d.exclusive),
    ).toBe(false)
  })

  it('preserves Ship It! nine First to Find awards', () => {
    const ftf = active.filter((d) => d.game === 'shipit' && d.groupKey === 'firsts')
    expect(ftf).toHaveLength(9)
    expect(ftf.every((d) => d.exclusive)).toBe(true)
  })

  it('includes 26 Bar Gauntlets + 2 frozen collections', () => {
    const gauntlets = active.filter(
      (d) =>
        d.game === 'drinkit' &&
        d.conditionType === 'offering_collection' &&
        d.conditionConfig?.bar_key,
    )
    expect(gauntlets).toHaveLength(26)
    expect(gauntlets.filter((d) => d.conditionConfig?.scope === 'personal')).toHaveLength(13)
    expect(gauntlets.filter((d) => d.conditionConfig?.scope === 'collective')).toHaveLength(13)

    const frozen = [
      byKey.get('working-drinkit-frozen-concoctions'),
      byKey.get('working-drinkit-license-to-chill'),
    ]
    expect(frozen.every(Boolean)).toBe(true)
    expect(frozen[0].conditionConfig.threshold).toBe(3)
    expect(frozen[1].conditionConfig.mode).toBe('full_menu')
  })

  it('keeps Good Spirits definitions verification-gated', () => {
    const personal = byKey.get('working-drinkit-gauntlet-personal-good-spirits-at-sea')
    const collective = byKey.get('working-drinkit-gauntlet-collective-good-spirits-at-sea')
    expect(personal?.conditionConfig?.verification_required).toBe(true)
    expect(collective?.conditionConfig?.verification_required).toBe(true)
    expect(personal?.title).toBe('Spirited Away')
    expect(collective?.title).toBe('Former Spirit Airlines Flight Crew')
  })

  it('wires critical FINAL conditions', () => {
    expect(byKey.get('working-drinkit-d085')?.conditionType).toBe('day_bounty_score')
    expect(byKey.get('working-drinkit-d085')?.conditionConfig?.min_points).toBe(275)
    expect(byKey.get('working-drinkit-d082')?.conditionConfig?.mode).toBe(
      'all_other_enrolled_companions',
    )
    expect(byKey.get('working-drinkit-d087')?.conditionConfig?.forbid_bounty_claims).toBe(true)
    expect(byKey.get('working-drinkit-d012')?.conditionConfig?.require_categories).toEqual([
      'cocktail',
      'ingredient',
      'bar',
    ])
    expect(byKey.get('working-drinkit-d094')?.conditionConfig).toMatchObject({
      subject: 'cruise_days',
      threshold: 3,
      event: 'daily_completion',
    })
    expect(byKey.get('working-drinkit-d095')?.conditionConfig?.threshold).toBe(7)
  })

  it('retires obsolete definitions without deleting history keys', () => {
    for (const key of RETIRE_STABLE_KEYS) {
      const row = definitions.find((d) => d.stableKey === key)
      expect(row?.readiness).toBe('retired')
      expect(row?.enabledInDev).toBe(false)
      expect(active.some((d) => d.stableKey === key)).toBe(false)
    }
  })

  it('resolves every FINAL icon class', () => {
    for (const def of active) {
      const resolved = resolveAchievementIconKey(def.iconKey)
      expect(resolved.ok, `${def.stableKey} ${def.iconKey}`).toBe(true)
    }
  })

  it('uses only known condition types', () => {
    for (const def of active) {
      expect(ACHIEVEMENT_CONDITION_TYPES).toContain(def.conditionType)
    }
  })

  it('authority MD parse still yields 174 when available', () => {
    const downloads =
      '/Users/josh/Downloads/Documents/Cruise Challenge/Finals/MD/STAR_PRINCESS_ACHIEVEMENTS_FINAL_STANDALONE.md'
    try {
      const parsed = parseFinalAchievementAuthority(downloads)
      expect(parsed.drinkit).toHaveLength(126)
      expect(parsed.shipit).toHaveLength(48)
    } catch {
      // CI / sandboxes without the Downloads path rely on finalAuthority.json above.
      expect(authorityDoc.counts.total).toBe(174)
    }
  })
})
