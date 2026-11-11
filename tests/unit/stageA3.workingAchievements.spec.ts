import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { composeWorkingAchievements } from '../../scripts/lib/composeWorkingAchievements.mjs'
import { buildBarGauntletDefinitions } from '../../scripts/lib/buildBarGauntletDefinitions.mjs'
import {
  loadCompanionAliasVocabulary,
  resolveAliasesToPlayerIds,
  materializeConditionConfig,
} from '../../scripts/lib/resolveCompanionAliases.mjs'

const root = process.cwd()

describe('FINAL working achievements composition', () => {
  it('composes 174 active definitions (126 drinkit + 48 shipit)', () => {
    const { counts, active } = composeWorkingAchievements()
    expect(counts.base).toBe(140)
    expect(counts.drinking_with_davids).toBe(6)
    expect(counts.bar_gauntlets).toBe(26)
    expect(counts.frozen_collections).toBe(2)
    expect(counts.retired).toBe(3)
    expect(counts.active).toBe(174)
    expect(counts.drinkit_active).toBe(126)
    expect(counts.shipit_active).toBe(48)
    expect(active).toHaveLength(174)

    const d083 = composeWorkingAchievements().definitions.find(
      (d) => d.stableKey === 'working-drinkit-d083',
    )
    expect(d083?.readiness).toBe('retired')
    expect(d083?.enabledInDev).toBe(false)

    const davids = active.filter((d) => d.groupKey === 'drinking_with_davids')
    expect(davids).toHaveLength(6)

    const categories = JSON.parse(
      readFileSync(join(root, 'content/achievements/categories.json'), 'utf8'),
    )
    const drinkitOrdered = [...categories.categories]
      .filter((c) => !c.games || c.games.includes('drinkit'))
      .sort((a, b) => a.all_view_order - b.all_view_order)
    expect(drinkitOrdered[0].key).toBe('drinking-with-davids')
    expect(drinkitOrdered[drinkitOrdered.length - 1].key).toBe('collections-bar-gauntlets')
  })

  it('includes Good Spirits gauntlets only when includeUnverified is set', () => {
    const catalog = JSON.parse(
      readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8'),
    )
    const skipped = buildBarGauntletDefinitions(catalog)
    const gsSkipped = skipped.report.find((r) => r.bar_key === 'good-spirits-at-sea')!
    expect(gsSkipped.included).toBe(false)

    const included = buildBarGauntletDefinitions(catalog, { includeUnverified: true })
    const gs = included.report.find((r) => r.bar_key === 'good-spirits-at-sea')!
    expect(gs.included).toBe(true)
    expect(gs.eligible_count).toBe(0)
    const gsDefs = included.definitions.filter((d) =>
      d.stableKey.includes('good-spirits-at-sea'),
    )
    expect(gsDefs).toHaveLength(2)
    expect(gsDefs.every((d) => d.conditionConfig.verification_required === true)).toBe(true)

    const lido = included.report.find((r) => r.bar_key === 'lido-bar')!
    expect(lido.eligible_count).toBe(18)
  })

  it('keeps public aliases neutral and resolves only via private maps', () => {
    const vocab = loadCompanionAliasVocabulary()
    expect(vocab.aliases).toContain('companion-david-f')
    expect(vocab.aliases).toContain('companion-david-b')
    const raw = readFileSync(join(root, 'content/achievements/companionAliases.json'), 'utf8')
    expect(raw).not.toMatch(/forrester|bissett|becker|shirley/i)
    expect(raw).not.toMatch(/roster_key/)

    const resolved = resolveAliasesToPlayerIds({
      publicAliases: vocab.aliases,
      privateAliasMap: {
        'companion-david-f': { roster_key: 'synthetic-david-f' },
        'companion-david-b': { roster_key: 'synthetic-david-b' },
      },
      rosterPlayers: [
        { key: 'synthetic-david-f', login_alias: 'david.f@example.local' },
        { key: 'synthetic-david-b', login_alias: 'david.b@example.local' },
      ],
      loginAliasToPlayerId: new Map([
        ['david.f@example.local', '11111111-1111-1111-1111-111111111111'],
        ['david.b@example.local', '22222222-2222-2222-2222-222222222222'],
      ]),
      aliases: ['companion-david-f', 'companion-david-b'],
    })
    expect(resolved.unresolved).toEqual([])
    expect(resolved.playerIds).toHaveLength(2)

    const materialized = materializeConditionConfig(
      {
        player_aliases: ['companion-david-f', 'companion-david-b'],
        drink_tag: 'margarita',
      },
      {
        publicAliases: vocab.aliases,
        privateAliasMap: {
          'companion-david-f': { roster_key: 'synthetic-david-f' },
          'companion-david-b': { roster_key: 'synthetic-david-b' },
        },
        rosterPlayers: [
          { key: 'synthetic-david-f', login_alias: 'david.f@example.local' },
          { key: 'synthetic-david-b', login_alias: 'david.b@example.local' },
        ],
        loginAliasToPlayerId: new Map([
          ['david.f@example.local', '11111111-1111-1111-1111-111111111111'],
          ['david.b@example.local', '22222222-2222-2222-2222-222222222222'],
        ]),
      },
    )
    expect(materialized.unresolved).toEqual([])
    expect(materialized.config.player_ids).toHaveLength(2)
    expect(materialized.config.player_aliases).toBeUndefined()
  })
})
