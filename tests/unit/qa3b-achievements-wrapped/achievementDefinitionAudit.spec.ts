/**
 * QA-3B — Achievement definition ↔ implementation audit (174).
 * Uses composed FINAL content packs + launch-candidate catalog. No DB mutation.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { composeWorkingAchievements } from '../../../scripts/lib/composeWorkingAchievements.mjs'
import { ACHIEVEMENT_CONDITION_TYPES } from '@/lib/achievements/conditionTypes'
import { activeAchievementCatalogCount } from '@/lib/achievements/activeCatalogCount'
import { achievementCategoriesOrdered } from '@/lib/achievements/categories'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..')
const authority = JSON.parse(
  readFileSync(join(root, 'content/achievements/finalAuthority.json'), 'utf8'),
)
const launch = JSON.parse(
  readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8'),
)
const prodMap = JSON.parse(
  readFileSync(join(root, 'content/achievements/productionReleaseMapping.json'), 'utf8'),
)

const { active, counts } = composeWorkingAchievements()
const byTitleGame = new Map(active.map((d: any) => [`${d.game}|${d.title}`, d]))
const byKey = new Map(active.map((d: any) => [d.stableKey, d]))
const knownTypes = new Set(ACHIEVEMENT_CONDITION_TYPES)
const drinkTags = new Set(
  launch.drinks.flatMap((d: any) => d.classification_tags ?? []),
)
const offeringTags = new Set(
  launch.drinks.flatMap((d: any) =>
    (d.bar_offerings ?? []).flatMap((o: any) => o.classification_tags ?? []),
  ),
)
const allPublishedDrinkTags = new Set([...drinkTags, ...offeringTags])
const prodKeys = new Set(prodMap.rows.map((r: any) => r.stableKey))

describe('QA3B achievement definition audit', () => {
  it('audits exactly 174 authority rows against 126+48 composed active defs', () => {
    expect(authority.rows).toHaveLength(174)
    expect(authority.counts).toEqual({ drinkit: 126, shipit: 48, total: 174 })
    expect(counts.drinkit_active).toBe(126)
    expect(counts.shipit_active).toBe(48)
    expect(counts.active).toBe(174)
    expect(activeAchievementCatalogCount('drinkit')).toBe(126)
    expect(activeAchievementCatalogCount('shipit')).toBe(48)
  })

  it('maps every authority row to a unique stableKey implementation', () => {
    const keys = new Set<string>()
    for (const row of authority.rows) {
      const def = byTitleGame.get(`${row.game}|${row.name}`)
      expect(def, `missing ${row.game}: ${row.name}`).toBeTruthy()
      expect(def.title).toBe(row.name)
      expect(def.displayDescription).toBe(row.trigger)
      expect(def.iconKey).toBe(row.iconClass)
      expect(def.secret).toBe(row.secret)
      expect(keys.has(def.stableKey)).toBe(false)
      keys.add(def.stableKey)
      expect(knownTypes.has(def.conditionType)).toBe(true)
      expect(def.ownerType).toBe(row.game === 'shipit' ? 'team' : 'player')
    }
    expect(keys.size).toBe(174)
  })

  it('keeps approved category order and Ship It! First to Find exclusives', () => {
    expect(achievementCategoriesOrdered('drinkit').map((c) => c.name)).toEqual([
      'Drinking with Davids',
      'Firsts & Early Wins',
      'Bounties & Competition',
      'Bars & Exploration',
      'Spirits & Ingredients',
      'Friends & Social',
      'Ship-Time & Cruise Milestones',
      'Collections & Bar Gauntlets',
    ])
    const ftf = active.filter((d: any) => d.game === 'shipit' && d.groupKey === 'firsts')
    expect(ftf).toHaveLength(9)
    expect(ftf.every((d: any) => d.exclusive)).toBe(true)
    expect(active.some((d: any) => d.game === 'drinkit' && d.exclusive)).toBe(false)
  })

  it('ACH-001: launch catalog must publish concrete frozen(+tropical) tags so License to Chill is reachable', () => {
    const chill = byKey.get('working-drinkit-license-to-chill')
    const frozen = byKey.get('working-drinkit-frozen-concoctions')
    expect(chill?.conditionConfig).toMatchObject({
      mode: 'full_menu',
      drink_tag: 'frozen',
      require_tropical: true,
    })
    expect(frozen?.conditionConfig).toMatchObject({
      mode: 'threshold',
      threshold: 3,
      drink_tag: 'frozen',
      require_tropical: true,
    })
    // Expected (FINAL §3.4): eligible frozen tropical set is concrete and reachable.
    // Observed: launch-candidate publishes zero `frozen` drink/offering tags.
    expect(
      allPublishedDrinkTags.has('frozen'),
      'launch-candidate must include frozen drink/offering classification tags',
    ).toBe(true)
  })

  it('keeps Good Spirits gauntlets verification-gated with zero launch eligible evidence', () => {
    const personal = byKey.get('working-drinkit-gauntlet-personal-good-spirits-at-sea')
    const collective = byKey.get('working-drinkit-gauntlet-collective-good-spirits-at-sea')
    expect(personal?.conditionConfig?.verification_required).toBe(true)
    expect(collective?.conditionConfig?.verification_required).toBe(true)
    const report = JSON.parse(
      readFileSync(join(root, 'content/achievements/barGauntlets.json'), 'utf8'),
    ).report.find((r: any) => r.bar_key === 'good-spirits-at-sea')
    expect(report.eligible_count).toBe(0)
    expect(report.included).toBe(false)
  })

  it('ACH-003: productionReleaseMapping must cover all FINAL 174 stable keys', () => {
    const missing = active
      .map((d: any) => d.stableKey)
      .filter((k: string) => !prodKeys.has(k))
    // Expected: production activation map enumerates the locked 174 catalog.
    // Observed: mapping still summarizes interim 140 rows and omits gauntlets/Davids/frozen/new rows.
    expect(prodMap.summary.total).toBe(174)
    expect(missing, `missing keys: ${missing.slice(0, 12).join(', ')}…`).toEqual([])
  })

  it('does not grant competitive points via achievement definitions', () => {
    for (const def of active) {
      const cfg = JSON.stringify(def.conditionConfig ?? {})
      expect(cfg).not.toMatch(/"award_points"\s*:/)
      expect(def).not.toHaveProperty('points')
      expect(def).not.toHaveProperty('bounty_points')
    }
  })
})
