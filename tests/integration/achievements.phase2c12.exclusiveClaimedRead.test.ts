/**
 * Phase 2C.12 — exclusive First-to-Find All-view disclosure must not false-earn
 * non-winning teams. Database awards remain on the winning team only.
 *
 * Disposable :55321 only. Never mutates organizer :54321 or hosted beta.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  clearTestAchievements,
  seedTestAchievementCatalog,
} from '../helpers/achievementFixtures'
import { ensureSyntheticRoleIdentities } from '../helpers/syntheticRoles'
import {
  createLocalClient,
  signInAs,
  type LocalFixtures,
} from '../helpers/localSupabase'
import {
  DEV_BASE_OFFSET_MIN,
  noonDay1Utc,
} from '../helpers/bountyFixtures'
import { playerId } from '../helpers/drinkitSubmit'

function loadDisposableEnv(): Record<string, string> {
  const path = join(process.cwd(), '.local/qa2a-disposable.env')
  if (!existsSync(path)) return {}
  const env: Record<string, string> = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return env
}

const fileEnv = loadDisposableEnv()
const API_URL = process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || ''
const ANON = process.env.VITE_SUPABASE_ANON_KEY || fileEnv.VITE_SUPABASE_ANON_KEY || ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY || ''
const PASSWORD = process.env.LOCAL_TEST_PASSWORD || fileEnv.LOCAL_TEST_PASSWORD || ''

const isDisposable = API_URL.includes(':55321') && !API_URL.includes(':54321') && !API_URL.includes(':56321')
const canRun = Boolean(isDisposable && ANON && SERVICE && PASSWORD)

function requireDisposable() {
  if (process.env.QA_ALLOW_ORGANIZER_MUTATION === '1') {
    throw new Error('REFUSE: QA_ALLOW_ORGANIZER_MUTATION must not be set')
  }
  if (!canRun) {
    throw new Error('Phase 2C.12 integration requires disposable :55321 env + LOCAL_TEST_PASSWORD')
  }
}

const TINY_JPEG = readFileSync(join(process.cwd(), 'tests/fixtures/tiny.jpg'))

async function stageScavengerPhoto(client: Awaited<ReturnType<typeof signInAs>>): Promise<string> {
  const begin = await client.rpc('begin_photo_upload', {
    p_game: 'shipit',
    p_purpose: 'scavenger',
    p_mime_type: 'image/jpeg',
    p_byte_size: TINY_JPEG.length,
    p_width: 32,
    p_height: 24,
    p_original_filename: 't.jpg',
    p_client_request_id: randomUUID(),
  })
  expect(begin.data.ok).toBe(true)
  await client.storage.from(begin.data.bucket).upload(begin.data.storage_path, TINY_JPEG, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  const confirm = await client.rpc('confirm_photo_upload', { p_photo_id: begin.data.photo_id })
  expect(confirm.data.ok).toBe(true)
  return begin.data.photo_id as string
}

describe.skipIf(!canRun)('Phase 2C.12 exclusive First-to-Find All-view attribution', () => {
  let fixtures: LocalFixtures
  let service: SupabaseClient

  beforeAll(async () => {
    requireDisposable()
    const base: LocalFixtures = {
      available: true,
      password: PASSWORD,
      anonKey: ANON,
      serviceRoleKey: SERVICE,
      summary: {
        supabase_url: API_URL,
        identities: [],
      },
    }
    fixtures = await ensureSyntheticRoleIdentities(base)
    service = createLocalClient(API_URL, SERVICE)

    const { data: cruise, error } = await service
      .from('cruise_config')
      .select('id, label')
      .eq('is_active', true)
      .maybeSingle()
    if (error) throw error
    if (!cruise || cruise.label !== 'development-only') {
      throw new Error(`REFUSE: expected development-only cruise, got ${cruise?.label}`)
    }
    if (cruise.id === '48fa40c6-e7cd-4f8f-8b81-e3e48d10eb13') {
      throw new Error('REFUSE: organizer cruise id')
    }
    if (cruise.id === '9d343fc6-df94-444c-b590-b47bc55d52cd') {
      throw new Error('REFUSE: hosted beta cruise id')
    }
  }, 180000)

  beforeEach(async () => {
    requireDisposable()
    await clearTestAchievements(service)
    const { error: clockErr } = await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: '2099-01-03',
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
      p_label: 'development-only',
    })
    expect(clockErr).toBeNull()
    await service.rpc('dev_set_drinkit_paused', { p_paused: false })
    await seedTestAchievementCatalog(service)
    await service.rpc('dev_reset_scavenger_test_data')
  }, 180000)

  afterAll(async () => {
    if (service) await clearTestAchievements(service)
  }, 180000)

  it('winner earns; non-winning team sees Claimed by, not earned; late complete still scores', async () => {
    const at = noonDay1Utc()
    const { data: challenge, error: chErr } = await service
      .from('scavenger_challenges')
      .select('id')
      .eq('canonical_key', 'the-piazza-grandeur')
      .single()
    expect(chErr).toBeNull()

    const both = await signInAs(fixtures, 'both') // Demo Team Alpha
    const admin = await signInAs(fixtures, 'admin') // Demo Team Bravo

    const alphaTeam = (
      await service
        .from('team_memberships')
        .select('team_id')
        .eq('player_id', playerId(fixtures, 'both'))
        .is('active_to', null)
        .single()
    ).data!.team_id as string
    const bravoTeam = (
      await service
        .from('team_memberships')
        .select('team_id')
        .eq('player_id', playerId(fixtures, 'admin'))
        .is('active_to', null)
        .single()
    ).data!.team_id as string
    expect(alphaTeam).not.toEqual(bravoTeam)

    const photo1 = await stageScavengerPhoto(both)
    const first = await service.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challenge!.id,
        photo_id: photo1,
        caption: null,
      },
      p_at_utc: at,
    })
    expect(first.error).toBeNull()
    expect(first.data.ok).toBe(true)

    const { data: awards } = await service
      .from('achievement_awards')
      .select(
        'id, owner_team_id, exclusive_slot, status, definition:achievement_definitions!inner(stable_key)',
      )
      .eq('status', 'active')
      .eq('exclusive_slot', true)
      .eq('definition.stable_key', 'test-first-team-piazza')
    expect(awards).toHaveLength(1)
    expect(awards![0].owner_team_id).toBe(alphaTeam)

    const alphaAll = await both.rpc('list_achievements', { p_game: 'shipit', p_view: 'all' })
    expect(alphaAll.error).toBeNull()
    const alphaCard = (alphaAll.data.achievements as Array<Record<string, unknown>>).find(
      (c) => c.stable_key === 'test-first-team-piazza',
    )
    expect(alphaCard).toMatchObject({
      earned: true,
      exclusive: true,
      exclusive_claimed: true,
    })
    expect(alphaCard!.award_id).toBeTruthy()

    const alphaMine = await both.rpc('list_achievements', { p_game: 'shipit', p_view: 'mine' })
    expect(
      (alphaMine.data.achievements as Array<Record<string, unknown>>).some(
        (c) => c.stable_key === 'test-first-team-piazza' && c.earned === true,
      ),
    ).toBe(true)

    const bravoAll = await admin.rpc('list_achievements', { p_game: 'shipit', p_view: 'all' })
    expect(bravoAll.error).toBeNull()
    const bravoCard = (bravoAll.data.achievements as Array<Record<string, unknown>>).find(
      (c) => c.stable_key === 'test-first-team-piazza',
    )
    expect(bravoCard).toBeTruthy()
    expect(bravoCard).toMatchObject({
      earned: false,
      exclusive: true,
      exclusive_claimed: true,
      award_id: null,
      awarded_at_utc: null,
    })
    expect(String(bravoCard!.exclusive_owner_name || '')).toMatch(/Alpha/i)
    expect(bravoCard!.title).toBe('Test First Piazza')

    const bravoMine = await admin.rpc('list_achievements', { p_game: 'shipit', p_view: 'mine' })
    expect(
      (bravoMine.data.achievements as Array<Record<string, unknown>>).some(
        (c) => c.stable_key === 'test-first-team-piazza',
      ),
    ).toBe(false)

    const photo2 = await stageScavengerPhoto(admin)
    const later = new Date(new Date(at).getTime() + 120_000).toISOString()
    const second = await service.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'admin'),
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challenge!.id,
        photo_id: photo2,
        caption: null,
      },
      p_at_utc: later,
    })
    expect(second.error).toBeNull()
    expect(second.data.ok).toBe(true)

    const { data: exclusivesAfter } = await service
      .from('achievement_awards')
      .select(
        'id, owner_team_id, status, exclusive_slot, definition:achievement_definitions!inner(stable_key)',
      )
      .eq('definition.stable_key', 'test-first-team-piazza')
      .eq('status', 'active')
      .eq('exclusive_slot', true)
    expect(exclusivesAfter).toHaveLength(1)
    expect(exclusivesAfter![0].owner_team_id).toBe(alphaTeam)

    const bravoAllAfter = await admin.rpc('list_achievements', { p_game: 'shipit', p_view: 'all' })
    const bravoCardAfter = (bravoAllAfter.data.achievements as Array<Record<string, unknown>>).find(
      (c) => c.stable_key === 'test-first-team-piazza',
    )
    expect(bravoCardAfter).toMatchObject({
      earned: false,
      exclusive_claimed: true,
    })
  }, 180000)
})
