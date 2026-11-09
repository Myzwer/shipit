/**
 * Stage A2 — organizer-authorized loggable exceptions.
 * Uses a disposable development-only catalog copy; does not rewrite private roster content.
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
import { noonDay1Utc } from '../helpers/bountyFixtures'
import { drinkPayload, exposeCurrentSlots, lookupOffering, playerId, submitAt } from '../helpers/drinkitSubmit'
import type { ClockFixtures } from '../helpers/clockFixtures'
import { signInAs } from '../helpers/localSupabase'

const POOL = ['lido-bar', 'the-mix', 'promenade-bars', 'star-bar'] as const

let fixtures: ClockFixtures
let service: SupabaseClient
let drinkClient: SupabaseClient

beforeAll(async () => {
  fixtures = await loadAchievementFixtures()
  service = fixtures.service!
  await assertDisposableDevEnvironment(fixtures, service)
  drinkClient = await signInAs(fixtures, 'drink_only')
}, 180000)

beforeEach(async () => {
  await assertDisposableDevEnvironment(fixtures, service)
  await clearTestAchievementsInDisposableEnv(service, fixtures)
  await service.from('game_control').update({ status: 'active', finalized_at_utc: null }).eq('game', 'drinkit')
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateLaunchCopy()
}, 180000)

afterAll(async () => {
  await clearTestAchievementsInDisposableEnv(service, fixtures)
}, 180000)

describe('Stage A2 authorized exceptions', () => {
  it('lists specials only at authorized bars and sorts Princess Live exceptions last', async () => {
    for (const bar of POOL) {
      const list = await drinkClient.rpc('list_drinkit_bar_drinks', { p_bar_canonical_key: bar })
      expect(list.error).toBeNull()
      const keys = (list.data as Array<{ canonical_key: string }>).map((row) => row.canonical_key)
      expect(keys).toContain('tequila-shot')
      expect(keys).toContain('loaded-corona')
      expect(keys).not.toContain('fireball-shot')
      expect(keys).not.toContain('sambuca-shot')
      expect(keys.indexOf('tequila-shot')).toBeGreaterThan(keys.indexOf(keys.find((k) => !isException(k))!))
    }

    const live = await drinkClient.rpc('list_drinkit_bar_drinks', {
      p_bar_canonical_key: 'princess-live',
    })
    expect(live.error).toBeNull()
    const liveKeys = (live.data as Array<{ canonical_key: string }>).map((row) => row.canonical_key)
    expect(liveKeys).toContain('fireball-shot')
    expect(liveKeys).toContain('sambuca-shot')
    expect(liveKeys).not.toContain('tequila-shot')
    const firstOrdinary = liveKeys.find((key) => !isException(key))!
    expect(liveKeys.indexOf('fireball-shot')).toBeGreaterThan(liveKeys.indexOf(firstOrdinary))
    expect(liveKeys.indexOf('sambuca-shot')).toBeGreaterThan(liveKeys.indexOf(firstOrdinary))
    expect(Math.max(liveKeys.indexOf('fireball-shot'), liveKeys.indexOf('sambuca-shot'))).toBe(
      liveKeys.length - 1,
    )
  })

  it('logs specials through ordinary named_catalog submit and excludes them from gauntlets', async () => {
    const author = playerId(fixtures, 'drink_only')
    const tequila = await lookupOffering(service, 'lido-bar', 'tequila-shot')
    const fireball = await lookupOffering(service, 'princess-live', 'fireball-shot')
    const at = noonDay1Utc()
    await exposeCurrentSlots(service, at)

    const tequilaLog = await submitAt(
      service,
      author,
      drinkPayload({ barKey: 'lido-bar', offeringId: tequila.offering_id }),
      at,
    )
    expect(tequilaLog.error).toBeNull()
    expect(tequilaLog.data.ok).toBe(true)

    const fireballLog = await submitAt(
      service,
      author,
      drinkPayload({ barKey: 'princess-live', offeringId: fireball.offering_id }),
      at,
    )
    expect(fireballLog.error).toBeNull()
    expect(fireballLog.data.ok).toBe(true)

    const { data: version } = await service
      .from('active_catalog_pointer')
      .select('catalog_version_id')
      .eq('id', 1)
      .single()
    const { data: tags } = await service
      .from('catalog_version_offering_tags')
      .select('offering_id, tag')
      .eq('catalog_version_id', version!.catalog_version_id)
      .in('offering_id', [tequila.offering_id, fireball.offering_id])
    const byOffering = new Map<string, string[]>()
    for (const row of tags ?? []) {
      const list = byOffering.get(row.offering_id) ?? []
      list.push(row.tag)
      byOffering.set(row.offering_id, list)
    }
    for (const offeringId of [tequila.offering_id, fireball.offering_id]) {
      expect(byOffering.get(offeringId)).toEqual(
        expect.arrayContaining(['collection-excluded', 'organizer-authorized-exception']),
      )
    }

    const { data: def, error: defError } = await service
      .from('achievement_definitions')
      .insert({
        stable_key: `a2-gauntlet-${randomUUID()}`,
        game: 'drinkit',
        owner_type: 'player',
        group_key: 'other',
        title: 'Lorem ipsum',
        display_description: 'Lorem ipsum dolor sit amet.',
        secret: false,
        exclusive: false,
        enabled: true,
        test_only: true,
        condition_type: 'offering_collection',
        condition_config: { bar_key: 'lido-bar' },
      })
      .select('id')
      .single()
    expect(defError).toBeNull()

    const { data: status, error: statusError } = await service.rpc('achievement_collection_status', {
      p_definition_id: def!.id,
      p_owner_player: author,
    })
    expect(statusError).toBeNull()
    expect(status.ok).toBe(true)
    expect(status.live_target).toBe(18)
    expect(
      (status.items as Array<{ concept_key: string }>).some((item) =>
        ['tequila-shot', 'loaded-corona'].includes(item.concept_key),
      ),
    ).toBe(false)

    const { count: cocktailCandidates } = await service
      .from('cocktail_candidates')
      .select('offering_id', { count: 'exact', head: true })
      .eq('catalog_version_id', version!.catalog_version_id)
      .in('drink_concept_id', [tequila.drink_concept_id, fireball.drink_concept_id])
    expect(cocktailCandidates).toBe(0)
  })
})

async function activateLaunchCopy() {
  const doc = JSON.parse(
    readFileSync(join(process.cwd(), 'content/catalogs/launch-candidate-v1.json'), 'utf8'),
  )
  doc.catalog_id = uniqueCatalogId('a2-exceptions')
  const { error } = await service.rpc('dev_activate_catalog_fixture', { p_payload: doc })
  if (error) throw error
  const { error: scheduleError } = await service.rpc('dev_generate_bounty_schedule', {
    p_seed: doc.catalog_id,
  })
  if (scheduleError) throw scheduleError
  const { error: dailyError } = await service.rpc('dev_seed_daily_assignments')
  if (dailyError) throw dailyError
}

function isException(key: string) {
  return ['tequila-shot', 'loaded-corona', 'fireball-shot', 'sambuca-shot'].includes(key)
}
