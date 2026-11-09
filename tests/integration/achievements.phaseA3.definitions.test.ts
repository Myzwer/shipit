/**
 * Stage A3 — Drinking with Davids predicates + all-bar gauntlets + Cooler exception.
 * Uses synthetic identities only (never private family UUIDs).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  clearTestAchievementsInDisposableEnv,
  loadAchievementFixtures,
} from '../helpers/achievementFixtures'
import { assertDisposableDevEnvironment } from '../helpers/devEnvironmentGuard'
import { uniqueCatalogId } from '../helpers/catalogPublish'
import { noonDay1Utc, slotUtc } from '../helpers/bountyFixtures'
import {
  drinkPayload,
  exposeCurrentSlots,
  lookupOffering,
  playerId,
  submitAt,
} from '../helpers/drinkitSubmit'
import type { ClockFixtures } from '../helpers/clockFixtures'

const POOL = ['lido-bar', 'the-mix', 'promenade-bars', 'star-bar'] as const

let fixtures: ClockFixtures
let service: SupabaseClient
let alpha: string
let davidF: string
let davidB: string
let createdPlayers: string[] = []

beforeAll(async () => {
  fixtures = await loadAchievementFixtures()
  service = fixtures.service!
  await assertDisposableDevEnvironment(fixtures, service)
  alpha = playerId(fixtures, 'drink_only')
}, 180000)

beforeEach(async () => {
  await assertDisposableDevEnvironment(fixtures, service)
  await clearTestAchievementsInDisposableEnv(service, fixtures)
  await service.from('game_control').update({ status: 'active', finalized_at_utc: null }).eq('game', 'drinkit')
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateLaunchCopy()
  await deleteSyntheticPlayers()
  createdPlayers = []
  davidF = await createSyntheticPlayer('a3-david-f')
  davidB = await createSyntheticPlayer('a3-david-b')
}, 180000)

afterAll(async () => {
  await clearTestAchievementsInDisposableEnv(service, fixtures)
  await deleteSyntheticPlayers()
}, 180000)

describe('Stage A3 Drinking with Davids', () => {
  it('requires same-log constraints; either David qualifies; Jimmy Buffett needs David F', async () => {
    const margarita = await insertDef('same_log', {
      player_ids: [davidF, davidB],
      drink_tag: 'margarita',
    }, 'drinking_with_davids')
    const jimmy = await insertDef('same_log', {
      player_ids: [davidF],
      drink_concept_key: 'loaded-corona',
      bar_keys: [...POOL],
    }, 'drinking_with_davids')
    const fireball = await insertDef('same_log', {
      player_ids: [davidF, davidB],
      drink_concept_key: 'fireball-shot',
      bar_key: 'princess-live',
    }, 'drinking_with_davids')

    const guava = await lookupOffering(service, 'lido-bar', 'guava-margarita')
    const corona = await lookupOffering(service, 'lido-bar', 'loaded-corona')
    const shot = await lookupOffering(service, 'princess-live', 'fireball-shot')
    await exposeCurrentSlots(service, noonDay1Utc())

    // Split log: margarita alone then companion later — no award.
    expectOk(await logNamed(alpha, 'lido-bar', guava.offering_id, noonDay1Utc()))
    expect(await activeAward(margarita, alpha)).toBeNull()

    // Same log with David B → Margarita Kickoff for author only.
    expectOk(await logNamed(alpha, 'lido-bar', guava.offering_id, slotUtc(1, '12:10:00'), [davidB]))
    expect(await activeAward(margarita, alpha)).not.toBeNull()
    expect(await activeAward(margarita, davidB)).toBeNull()

    // Jimmy Buffett rejects David B companion.
    expectOk(await logNamed(alpha, 'lido-bar', corona.offering_id, slotUtc(1, '13:20:00'), [davidB]))
    expect(await activeAward(jimmy, alpha)).toBeNull()
    const coronaMix = await lookupOffering(service, 'the-mix', 'loaded-corona')
    expectOk(await logNamed(alpha, 'the-mix', coronaMix.offering_id, slotUtc(1, '13:30:00'), [davidF]))
    expect(await activeAward(jimmy, alpha)).not.toBeNull()

    // David F authoring Fireball alone qualifies himself.
    expectOk(await logNamed(davidF, 'princess-live', shot.offering_id, slotUtc(1, '14:40:00')))
    expect(await activeAward(fireball, davidF)).not.toBeNull()

    // Replay does not duplicate.
    const before = await activeAwards(fireball)
    expectOk(await logNamed(davidF, 'princess-live', shot.offering_id, slotUtc(1, '14:50:00')))
    expect(await activeAwards(fireball)).toHaveLength(before.length)
  })

  it('honors Sunset Toast ship-local window and Friday cutoff', async () => {
    const sunset = await insertDef('same_log', {
      player_ids: [davidF, davidB],
      hour_start: 17,
      hour_end: 19,
    }, 'drinking_with_davids')

    expectOk(await logGeneric(alpha, slotUtc(1, '16:59:00'), [davidF]))
    expect(await activeAward(sunset, alpha)).toBeNull()
    expectOk(await logGeneric(alpha, slotUtc(1, '17:00:00'), [davidF]))
    expect(await activeAward(sunset, alpha)).not.toBeNull()

    const friday = await insertDef('same_log', {
      player_ids: [davidB],
      hour_start: 17,
      hour_end: 19,
    }, 'drinking_with_davids')
    expectOk(await logGeneric(alpha, slotUtc(7, '17:30:00'), [davidB]))
    expect(await activeAward(friday, alpha)).not.toBeNull()
    const ended = await logGeneric(alpha, slotUtc(7, '18:30:00'), [davidB])
    expect(ended.error).toBeNull()
    expect(ended.data.ok).toBe(false)
    expect(ended.data.code).toMatch(/GAME_ENDED/)
  })
})

describe('Stage A3 all-bar gauntlets + Cooler exclusion', () => {
  it('creates personal/collective defs for every eligible bar and excludes specials', async () => {
    const pack = JSON.parse(
      readFileSync(join(process.cwd(), 'content/achievements/barGauntlets.json'), 'utf8'),
    )
    expect(pack.report).toHaveLength(13)
    expect(pack.report.filter((r: { included: boolean }) => r.included)).toHaveLength(12)
    expect(
      pack.report.find((r: { bar_key: string }) => r.bar_key === 'good-spirits-at-sea')?.included,
    ).toBe(false)

    const inserted: Array<{ id: string; bar: string; scope: string }> = []
    for (const def of pack.definitions) {
      const id = await insertDef(
        def.conditionType,
        def.conditionConfig,
        'bar_gauntlets',
        def.stableKey,
      )
      inserted.push({
        id,
        bar: def.conditionConfig.bar_key,
        scope: def.conditionConfig.scope,
      })
    }
    expect(inserted).toHaveLength(24)

    const lidoPersonal = inserted.find((r) => r.bar === 'lido-bar' && r.scope === 'personal')!
    const status = await collectionStatus(lidoPersonal.id, alpha)
    expect(status.live_target).toBe(18)
    expect(
      (status.items as Array<{ concept_key: string }>).some((i) =>
        ['tequila-shot', 'loaded-corona', 'princess-ultimate-cooler'].includes(i.concept_key),
      ),
    ).toBe(false)

    const cooler = await lookupOffering(service, 'star-bar', 'princess-ultimate-cooler')
    await exposeCurrentSlots(service, noonDay1Utc())
    const beforeCooler = await collectionStatus(lidoPersonal.id, alpha)
    expectOk(await logNamed(alpha, 'star-bar', cooler.offering_id, slotUtc(1, '15:00:00')))
    const afterCooler = await collectionStatus(lidoPersonal.id, alpha)
    // Excluded special must not change any bar gauntlet denominator progress.
    expect(afterCooler.live_current).toBe(beforeCooler.live_current)
    expect(afterCooler.live_target).toBe(18)

    // Cooler is loggable at four pool bars only.
    for (const bar of POOL) {
      const off = await lookupOffering(service, bar, 'princess-ultimate-cooler')
      expect(off.offering_id).toBeTruthy()
    }
    await expect(
      lookupOffering(service, 'princess-live', 'princess-ultimate-cooler'),
    ).rejects.toBeTruthy()
  })

  it('collective completion grants zero-contribution members', async () => {
    const wake = await insertDef(
      'offering_collection',
      { bar_key: 'wake-view-bar', scope: 'collective', mode: 'full_menu' },
      'bar_gauntlets',
    )
    const open = await collectionStatus(wake, alpha)
    expect(open.live_target).toBeGreaterThan(1)
    const keep = (open.items as Array<{ offering_id: string }>).slice(0, 2)
    const drop = (open.items as Array<{ offering_id: string }>)
      .slice(2)
      .map((item) => item.offering_id)
    await excludeOfferings(drop)
    expect((await collectionStatus(wake, alpha)).live_target).toBe(2)

    await exposeCurrentSlots(service, noonDay1Utc())
    expectOk(await logNamed(davidF, 'wake-view-bar', keep[0].offering_id, noonDay1Utc()))
    expect(await activeAward(wake, alpha)).toBeNull()
    expectOk(await logNamed(davidF, 'wake-view-bar', keep[1].offering_id, slotUtc(1, '12:20:00')))
    expect(await activeAward(wake, davidF)).not.toBeNull()
    expect(await activeAward(wake, alpha)).not.toBeNull()
    expect(await activeAward(wake, davidB)).not.toBeNull()
  })
})

async function activateLaunchCopy() {
  const doc = JSON.parse(
    readFileSync(join(process.cwd(), 'content/catalogs/launch-candidate-v1.json'), 'utf8'),
  )
  doc.catalog_id = uniqueCatalogId('a3-defs')
  const { error } = await service.rpc('dev_activate_catalog_fixture', { p_payload: doc })
  if (error) throw error
  const { error: scheduleError } = await service.rpc('dev_generate_bounty_schedule', {
    p_seed: doc.catalog_id,
  })
  if (scheduleError) throw scheduleError
  const { error: dailyError } = await service.rpc('dev_seed_daily_assignments')
  if (dailyError) throw dailyError
}

async function insertDef(
  type: string,
  config: Record<string, unknown>,
  group: 'drinking_with_davids' | 'bar_gauntlets' | 'other' = 'other',
  stableKey?: string,
) {
  const { data, error } = await service
    .from('achievement_definitions')
    .insert({
      stable_key: stableKey ?? `a3-${randomUUID()}`,
      game: 'drinkit',
      owner_type: 'player',
      group_key: group,
      title: 'Lorem ipsum',
      display_description: 'Lorem ipsum dolor sit amet.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: type,
      condition_config: config,
      icon_key: group === 'drinking_with_davids' ? 'score.friends' : 'score.bar',
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

async function createSyntheticPlayer(label: string) {
  const token = randomUUID().slice(0, 8)
  const { data, error } = await service
    .from('players')
    .insert({
      display_name: `Synthetic ${label} ${token}`,
      login_alias: `synthetic-${label}-${token}@star-princess.local`,
      is_admin: false,
      active: true,
    })
    .select('id')
    .single()
  if (error) throw error
  const id = data.id as string
  createdPlayers.push(id)
  const { error: membershipError } = await service.from('game_memberships').insert({
    player_id: id,
    game: 'drinkit',
    enabled: true,
  })
  if (membershipError) throw membershipError
  return id
}

async function deleteSyntheticPlayers() {
  const { data } = await service.from('players').select('id').like('login_alias', 'synthetic-a3-%')
  const ids = [...new Set([...(data ?? []).map((r) => r.id as string), ...createdPlayers])]
  if (ids.length === 0) return
  await service.from('submissions').delete().in('author_player_id', ids)
  await service.from('achievement_awards').delete().in('owner_player_id', ids)
  await service.from('game_memberships').delete().in('player_id', ids)
  await service.from('players').delete().in('id', ids)
  createdPlayers = []
}

async function logNamed(
  author: string,
  barKey: string,
  offeringId: string,
  at: string,
  companions: string[] = [],
) {
  return submitAt(
    service,
    author,
    drinkPayload({ barKey, offeringId, companions }),
    at,
  )
}

async function logGeneric(author: string, at: string, companions: string[] = []) {
  return submitAt(
    service,
    author,
    drinkPayload({ barKey: 'lido-bar', mode: 'generic_beer', companions }),
    at,
  )
}

async function activeAward(definitionId: string, owner: string) {
  const { data, error } = await service
    .from('achievement_awards')
    .select('id')
    .eq('definition_id', definitionId)
    .eq('owner_player_id', owner)
    .eq('status', 'active')
    .maybeSingle()
  if (error) throw error
  return data
}

async function activeAwards(definitionId: string) {
  const { data, error } = await service
    .from('achievement_awards')
    .select('id')
    .eq('definition_id', definitionId)
    .eq('status', 'active')
  if (error) throw error
  return data ?? []
}

async function collectionStatus(definitionId: string, owner: string) {
  const { data, error } = await service.rpc('achievement_collection_status', {
    p_definition_id: definitionId,
    p_owner_player: owner,
  })
  if (error) throw error
  return data
}

function expectOk(result: { error: unknown; data?: { ok?: boolean; code?: string; message?: string } }) {
  expect(result.error).toBeNull()
  if (!result.data?.ok) {
    throw new Error(`submit failed: ${JSON.stringify(result.data)}`)
  }
}

async function excludeOfferings(offeringIds: string[]) {
  const { data: version } = await service
    .from('active_catalog_pointer')
    .select('catalog_version_id')
    .eq('id', 1)
    .single()
  if (!version?.catalog_version_id || offeringIds.length === 0) return
  const rows = offeringIds.map((offering_id) => ({
    catalog_version_id: version.catalog_version_id,
    offering_id,
    tag: 'collection-excluded',
  }))
  const { error } = await service.from('catalog_version_offering_tags').upsert(rows)
  if (error) throw error
}
