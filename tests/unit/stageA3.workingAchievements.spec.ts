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

describe('Stage A3 working achievements composition', () => {
  it('preserves base 140 and adds Davids + eligible-bar gauntlets', () => {
    const { definitions, counts } = composeWorkingAchievements()
    expect(counts.base).toBe(140)
    expect(counts.drinking_with_davids).toBe(5)
    // Good Spirits is skipped while offerings remain unverified.
    expect(counts.bar_gauntlets).toBe(24)
    expect(counts.total).toBe(169)

    const d083 = definitions.find((d) => d.stableKey === 'working-drinkit-d083')
    expect(d083?.readiness).toBe('blocked_organizer')
    expect(d083?.enabledInDev).toBe(false)

    const davids = definitions.filter((d) => d.groupKey === 'drinking_with_davids')
    expect(davids).toHaveLength(5)
    expect(davids.every((d) => d.iconKey)).toBe(true)

    const categories = JSON.parse(
      readFileSync(join(root, 'content/achievements/categories.json'), 'utf8'),
    )
    const ordered = [...categories.categories].sort(
      (a, b) => a.all_view_order - b.all_view_order,
    )
    expect(ordered[0].key).toBe('drinking-with-davids')
    expect(ordered[ordered.length - 1].key).toBe('bar-gauntlets')
  })

  it('builds gauntlets only for bars with within-limit price evidence', () => {
    const catalog = JSON.parse(
      readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8'),
    )
    const { definitions, report } = buildBarGauntletDefinitions(catalog)
    const gs = report.find((r) => r.bar_key === 'good-spirits-at-sea')!
    expect(gs.included).toBe(false)
    expect(gs.eligible_count).toBe(0)
    expect(definitions).toHaveLength(report.filter((r) => r.included).length * 2)
    expect(
      definitions.every(
        (d) =>
          d.conditionType === 'offering_collection' &&
          d.conditionConfig.mode === 'full_menu' &&
          !('threshold' in d.conditionConfig) &&
          !Array.isArray(d.conditionConfig.offering_ids),
      ),
    ).toBe(true)
    const lido = report.find((r) => r.bar_key === 'lido-bar')!
    expect(lido.eligible_count).toBe(18)
  })

  it('keeps public aliases neutral and resolves only via private maps', () => {
    const vocab = loadCompanionAliasVocabulary()
    expect(vocab.aliases).toContain('companion-david-f')
    expect(vocab.aliases).toContain('companion-david-b')
    const raw = readFileSync(join(root, 'content/achievements/companionAliases.json'), 'utf8')
    expect(raw).not.toMatch(/forrester|bissett|becker|shirley/i)
    expect(raw).not.toMatch(/roster_key/)

    const ok = resolveAliasesToPlayerIds({
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
    expect(ok.unresolved).toEqual([])
    expect(ok.playerIds).toHaveLength(2)

    const missing = materializeConditionConfig(
      { player_aliases: ['companion-david-f'], drink_tag: 'margarita' },
      {
        publicAliases: vocab.aliases,
        privateAliasMap: null,
        rosterPlayers: [],
        loginAliasToPlayerId: new Map(),
      },
    )
    expect(missing.unresolved.some((u) => u.reason === 'private_alias_map_missing')).toBe(true)
    expect(missing.config.player_aliases).toBeUndefined()
  })

  it('documents exact margarita qualification tags without guessing', () => {
    const quals = JSON.parse(
      readFileSync(join(root, 'content/achievements/margaritaQualification.json'), 'utf8'),
    )
    const catalog = JSON.parse(
      readFileSync(join(root, 'content/catalogs/launch-candidate-v1.json'), 'utf8'),
    )
    const tagged = catalog.drinks
      .filter((d) => (d.classification_tags || []).includes('margarita'))
      .map((d) => d.key)
      .sort()
    expect([...quals.qualified_drink_concept_keys].sort()).toEqual(tagged)
    expect(quals.drink_tag).toBe('margarita')
  })
})
