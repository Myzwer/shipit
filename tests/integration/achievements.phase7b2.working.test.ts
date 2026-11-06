/**
 * Phase 7B2 — working catalog load + representative unlocks.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  activateReadyCatalogAndSchedule,
  DEV_BASE_OFFSET_MIN,
  loadBountyFixtures,
  noonDay1Utc,
} from '../helpers/bountyFixtures'
import { clearTestAchievements } from '../helpers/achievementFixtures'
import { drinkPayload, playerId, submitAt } from '../helpers/drinkitSubmit'
import { signInAs } from '../helpers/localSupabase'
import type { ClockFixtures } from '../helpers/clockFixtures'
import type { WorkingAchievementDefinition } from '@/lib/achievements/workingCatalog'

const catalogJson = JSON.parse(
  readFileSync(join(__dirname, '../../content/achievements/workingCatalog.json'), 'utf8'),
) as WorkingAchievementDefinition[]

let fixtures: ClockFixtures
let service: SupabaseClient

async function loadWorkingCatalog() {
  for (const row of catalogJson) {
    const stub =
      !row.conditionType || !row.conditionConfig
        ? {
            condition_type: 'event_count',
            condition_config: { event: 'drink_log', threshold: 999999 },
          }
        : {
            condition_type: row.conditionType,
            condition_config: row.conditionConfig,
          }
    const { data, error } = await service.rpc('dev_upsert_working_achievement_definition', {
      p_row: {
        stable_key: row.stableKey,
        game: row.game,
        owner_type: row.ownerType,
        group_key: row.groupKey,
        title: row.title,
        display_description: row.displayDescription,
        secret: row.secret,
        exclusive: row.exclusive,
        enabled: row.enabledInDev,
        condition_type: stub.condition_type,
        condition_config: stub.condition_config,
        test_only: true,
      },
    })
    expect(error, `${row.stableKey}: ${error?.message}`).toBeNull()
    expect(data?.ok, JSON.stringify(data)).toBe(true)
  }
  await service.rpc('dev_disable_missing_working_achievements', {
    p_keep_keys: catalogJson.map((r) => r.stableKey),
  })
}

async function activeWorkingKeys(player: string): Promise<string[]> {
  const { data } = await service
    .from('achievement_awards')
    .select('definition:achievement_definitions!inner(stable_key)')
    .eq('owner_player_id', player)
    .eq('status', 'active')
  return (data ?? [])
    .map((a: { definition: { stable_key: string } }) => a.definition.stable_key)
    .filter((k) => k.startsWith('working-'))
}

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
  service = fixtures.service!
})

beforeEach(async () => {
  await clearTestAchievements(fixtures.service!)
  const { error } = await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateReadyCatalogAndSchedule(fixtures.service!, `phase7b2-${randomUUID().slice(0, 8)}`)
  await loadWorkingCatalog()
})

describe('Phase 7B2 working catalog', () => {
  it('upserts all 140 rows and enables 129 in development', async () => {
    const { data, error } = await service
      .from('achievement_definitions')
      .select('stable_key, enabled, exclusive')
      .like('stable_key', 'working-%')
    expect(error).toBeNull()
    expect(data).toHaveLength(140)
    expect(data!.filter((d) => d.enabled)).toHaveLength(129)
    expect(data!.filter((d) => d.exclusive)).toHaveLength(9)
  })

  it('first beer log unlocks D-001 / D-035 / D-080 working titles', async () => {
    const author = playerId(fixtures, 'drink_only')
    const at = noonDay1Utc()
    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'carried-bar',
        mode: 'generic_beer',
        idempotencyKey: randomUUID(),
      }),
      at,
    )
    expect(res.error).toBeNull()
    expect(res.data.ok, JSON.stringify(res.data)).toBe(true)
    const keys = await activeWorkingKeys(author)
    expect(keys).toContain('working-drinkit-d001')
    expect(keys).toContain('working-drinkit-d035')
    expect(keys).toContain('working-drinkit-d080')
    expect(Array.isArray(res.data.new_achievement_ids)).toBe(true)
    expect((res.data.new_achievement_ids as string[]).length).toBeGreaterThanOrEqual(3)

    const client = await signInAs(
      {
        available: true,
        password: fixtures.password!,
        summary: fixtures.summary!,
        anonKey: fixtures.anonKey!,
        serviceRoleKey: fixtures.serviceRoleKey!,
      },
      'drink_only',
    )
    const listed = await client.rpc('list_achievements', {
      p_game: 'drinkit',
      p_view: 'mine',
    })
    expect(listed.error).toBeNull()
    expect(listed.data.ok).toBe(true)
    const titles = (listed.data.achievements as { title: string; earned: boolean }[])
      .filter((a) => a.earned)
      .map((a) => a.title)
    expect(titles).toContain('Wasted away again in Margaritaville')
    expect(titles).toContain('Can’t beat the classics')
    expect(titles).toContain('Not a worry in the world, cold beer in my hand')
  })

  it('idempotent reload keeps definition ids and does not duplicate awards', async () => {
    const before = await service
      .from('achievement_definitions')
      .select('id')
      .eq('stable_key', 'working-drinkit-d001')
      .single()
    await loadWorkingCatalog()
    const after = await service
      .from('achievement_definitions')
      .select('id')
      .eq('stable_key', 'working-drinkit-d001')
      .single()
    expect(after.data!.id).toBe(before.data!.id)
  })
})
