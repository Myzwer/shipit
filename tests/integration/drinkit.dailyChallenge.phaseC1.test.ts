/**
 * Phase C1 — final Daily Challenge schedule, participation modes, Admin announcements.
 * Synthetic identities + disposable development-only environment only.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertDisposableDevEnvironment } from '../helpers/devEnvironmentGuard'
import {
  activateReadyCatalogAndSchedule,
  DEV_BASE_OFFSET_MIN,
  slotUtc,
} from '../helpers/bountyFixtures'
import { playerId } from '../helpers/drinkitSubmit'
import {
  createLocalClient,
  loadLocalFixtures,
  signInAs,
} from '../helpers/localSupabase'
import { ensureSyntheticRoleIdentities } from '../helpers/syntheticRoles'
import { seedNowAlignedSchedule } from '../helpers/nowAlignedCruise'
import type { ClockFixtures } from '../helpers/clockFixtures'
import {
  DAILY_CHALLENGE_INSTRUCTIONS_PENDING,
  FINAL_DAILY_CHALLENGES,
} from '../../content/dailyChallenges/finalSchedule'

const TINY_JPEG = readFileSync(join(process.cwd(), 'tests/fixtures/tiny.jpg'))

let fixtures: ClockFixtures
let service: SupabaseClient

beforeAll(async () => {
  const base = await loadLocalFixtures()
  if (!base.available || !base.summary || !base.serviceRoleKey) {
    throw new Error('C1 daily tests require local Supabase + LOCAL_TEST_PASSWORD + identities')
  }
  const withRoles = await ensureSyntheticRoleIdentities(base)
  const svc = createLocalClient(withRoles.summary!.supabase_url, withRoles.serviceRoleKey!)
  await assertDisposableDevEnvironment(withRoles, svc)
  const admin = await signInAs(withRoles, 'admin')
  fixtures = { ...withRoles, admin, service: svc }
  service = svc
}, 180000)

afterAll(async () => {
  // Leave development-only cruise on the final C1 schedule (no fixture titles).
  if (!service) return
  await service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateReadyCatalogAndSchedule(service, `phase-c1-restore-${randomUUID().slice(0, 8)}`)
  await seedNowAlignedSchedule(service, { targetHour: 13, cruiseDay: 4 })
})

beforeEach(async () => {
  await assertDisposableDevEnvironment(fixtures, service)
  await service.rpc('dev_reset_scavenger_test_data')
  await service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateReadyCatalogAndSchedule(service, `phase-c1-${randomUUID().slice(0, 8)}`)
})

async function stageDailyPhoto(client: Awaited<ReturnType<typeof signInAs>>) {
  const begin = await client.rpc('begin_photo_upload', {
    p_game: 'drinkit',
    p_purpose: 'daily',
    p_mime_type: 'image/jpeg',
    p_byte_size: TINY_JPEG.length,
    p_width: 32,
    p_height: 24,
    p_original_filename: 'daily-c1.jpg',
    p_client_request_id: randomUUID(),
  })
  expect(begin.error).toBeNull()
  expect(begin.data.ok).toBe(true)
  const up = await client.storage.from(begin.data.bucket).upload(begin.data.storage_path, TINY_JPEG, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  expect(up.error).toBeNull()
  const confirm = await client.rpc('confirm_photo_upload', { p_photo_id: begin.data.photo_id })
  expect(confirm.data.ok).toBe(true)
  return begin.data.photo_id as string
}

describe('Phase C1 Daily Challenge schedule', () => {
  it('seeds the exact seven-day titles, locations, bars, modes, and 50 points', async () => {
    const { data: cruise } = await service
      .from('cruise_config')
      .select('id')
      .eq('is_active', true)
      .single()
    const { data: rows, error } = await service
      .from('daily_challenges')
      .select(
        'day_number, title, location_name, bar_canonical_key, participation_mode, is_all_hands, points, instructions, photo_required, admin_announcement',
      )
      .eq('cruise_config_id', cruise!.id)
      .order('day_number')
    expect(error).toBeNull()
    expect(rows).toHaveLength(7)

    for (let i = 0; i < 7; i++) {
      const expected = FINAL_DAILY_CHALLENGES[i]!
      const row = rows![i]!
      expect(row.day_number).toBe(expected.day_number)
      expect(row.title).toBe(expected.title)
      expect(row.location_name).toBe(expected.location_name)
      expect(row.bar_canonical_key).toBe(expected.bar_canonical_key)
      expect(row.participation_mode).toBe(expected.participation_mode)
      expect(row.is_all_hands).toBe(expected.participation_mode === 'all_hands')
      expect(row.points).toBe(50)
      expect(row.photo_required).toBe(true)
      expect(row.instructions).toBe(DAILY_CHALLENGE_INSTRUCTIONS_PENDING)
    }

    // No alternate/fixture challenge titles remain active.
    const titles = rows!.map((r) => r.title)
    expect(titles.some((t) => String(t).startsWith('Fixture '))).toBe(false)
  })

  it('exposes the schedule through timed sim reads for each cruise day', async () => {
    for (const expected of FINAL_DAILY_CHALLENGES) {
      const at = slotUtc(expected.day_number, expected.day_number === 7 ? '15:00:00' : '13:00:00')
      const daily = await service.rpc('dev_get_current_daily_challenge_at', { p_at_utc: at })
      expect(daily.error).toBeNull()
      expect(daily.data.status).toBe('active')
      expect(daily.data.cruise_day).toBe(expected.day_number)
      expect(daily.data.title).toBe(expected.title)
      expect(daily.data.location_name).toBe(expected.location_name)
      expect(daily.data.bar_canonical_key).toBe(expected.bar_canonical_key)
      expect(daily.data.participation_mode).toBe(expected.participation_mode)
      expect(daily.data.is_all_hands).toBe(expected.participation_mode === 'all_hands')
      expect(daily.data.points).toBe(50)
      expect(daily.data.admin_announcement).toBeNull()
    }
  })

  it('preserves challenge ids and announcements across reseeds', async () => {
    const { data: cruise } = await service
      .from('cruise_config')
      .select('id')
      .eq('is_active', true)
      .single()
    const { data: before } = await service
      .from('daily_challenges')
      .select('id, day_number, admin_announcement')
      .eq('cruise_config_id', cruise!.id)
      .order('day_number')

    const admin = await signInAs(fixtures, 'admin')
    const set = await admin.rpc('admin_set_daily_challenge_announcement', {
      p_day_number: 1,
      p_announcement: 'Meet at Lido after lunch',
      p_client_request_id: randomUUID(),
    })
    expect(set.error).toBeNull()
    expect(set.data.ok).toBe(true)
    expect(set.data.admin_announcement).toBe('Meet at Lido after lunch')

    const reseed = await service.rpc('dev_seed_daily_assignments')
    expect(reseed.error).toBeNull()
    expect(reseed.data.daily_challenges).toBe(7)

    const { data: after } = await service
      .from('daily_challenges')
      .select('id, day_number, title, admin_announcement')
      .eq('cruise_config_id', cruise!.id)
      .order('day_number')

    expect(after!.map((r) => r.id)).toEqual(before!.map((r) => r.id))
    expect(after![0]!.title).toBe('Tequila Shot')
    expect(after![0]!.admin_announcement).toBe('Meet at Lido after lunch')
  })
})

describe('Phase C1 Admin announcements', () => {
  it('lets Admin create, edit, clear; survives later reads; denies non-admin', async () => {
    const admin = await signInAs(fixtures, 'admin')
    const list = await admin.rpc('admin_list_daily_challenges')
    expect(list.error).toBeNull()
    expect(list.data.ok).toBe(true)
    expect(list.data.challenges).toHaveLength(7)

    const create = await admin.rpc('admin_set_daily_challenge_announcement', {
      p_day_number: 2,
      p_announcement: 'Meet @ 3 PM',
      p_client_request_id: randomUUID(),
    })
    expect(create.data.ok).toBe(true)
    expect(create.data.changed).toBe(true)
    expect(create.data.admin_announcement).toBe('Meet @ 3 PM')

    const edit = await admin.rpc('admin_set_daily_challenge_announcement', {
      p_day_number: 2,
      p_announcement: '  Meet at Sea View after lunch  \n',
      p_client_request_id: randomUUID(),
    })
    expect(edit.data.ok).toBe(true)
    expect(edit.data.admin_announcement).toBe('Meet at Sea View after lunch')

    const reread = await admin.rpc('admin_list_daily_challenges')
    const day2 = (reread.data.challenges as Array<Record<string, unknown>>).find(
      (c) => c.day_number === 2,
    )
    expect(day2?.admin_announcement).toBe('Meet at Sea View after lunch')

    const clear = await admin.rpc('admin_set_daily_challenge_announcement', {
      p_day_number: 2,
      p_announcement: '   ',
      p_client_request_id: randomUUID(),
    })
    expect(clear.data.ok).toBe(true)
    expect(clear.data.admin_announcement).toBeNull()

    const emptyOk = await admin.rpc('admin_set_daily_challenge_announcement', {
      p_day_number: 6,
      p_announcement: null,
      p_client_request_id: randomUUID(),
    })
    expect(emptyOk.data.ok).toBe(true)
    expect(emptyOk.data.admin_announcement).toBeNull()

    const player = await signInAs(fixtures, 'drink_only')
    const deniedList = await player.rpc('admin_list_daily_challenges')
    expect(deniedList.error).toBeTruthy()
    const deniedSet = await player.rpc('admin_set_daily_challenge_announcement', {
      p_day_number: 1,
      p_announcement: 'hack',
      p_client_request_id: randomUUID(),
    })
    expect(deniedSet.error).toBeTruthy()
  })

  it('rejects oversized announcements and returns normalized plain text', async () => {
    const admin = await signInAs(fixtures, 'admin')
    const tooLong = await admin.rpc('admin_set_daily_challenge_announcement', {
      p_day_number: 1,
      p_announcement: 'x'.repeat(281),
      p_client_request_id: randomUUID(),
    })
    expect(tooLong.error).toBeNull()
    expect(tooLong.data.ok).toBe(false)
    expect(tooLong.data.code).toBe('ANNOUNCEMENT_TOO_LONG')
  })
})

describe('Phase C1 claims and announcement non-gating', () => {
  it('awards 50 once per player/day; duplicate replay does not double points; Bring a Friend needs no crewmate', async () => {
    await seedNowAlignedSchedule(service, { targetHour: 13, cruiseDay: 3 })
    const drink = await signInAs(fixtures, 'drink_only')
    const current = await drink.rpc('get_my_current_daily_challenge')
    expect(current.error).toBeNull()
    expect(current.data.status).toBe('active')
    expect(current.data.title).toBe('Irish Pub Pick')
    expect(current.data.participation_mode).toBe('bring_a_friend')
    expect(current.data.points).toBe(50)

    // Announcement unset does not block claim.
    expect(current.data.admin_announcement).toBeNull()

    const photoId = await stageDailyPhoto(drink)
    const key = randomUUID()
    const ok = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: key,
        challenge_id: current.data.challenge_id,
        photo_id: photoId,
        caption: null,
      },
    })
    expect(ok.error).toBeNull()
    expect(ok.data.ok).toBe(true)
    expect(ok.data.awarded_points).toBe(50)
    expect(ok.data.code).toBe('ACCEPTED')

    const replay = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: key,
        challenge_id: current.data.challenge_id,
        photo_id: photoId,
        caption: null,
      },
    })
    expect(replay.error).toBeNull()
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.submission_id).toBe(ok.data.submission_id)

    const pid = playerId(fixtures, 'drink_only')
    const { data: cruise } = await service
      .from('cruise_config')
      .select('id')
      .eq('is_active', true)
      .single()
    const { data: claims } = await service
      .from('bounty_claims')
      .select('id, points, status')
      .eq('player_id', pid)
      .eq('cruise_config_id', cruise!.id)
      .eq('game_day', 3)
      .eq('category', 'daily')
      .eq('status', 'active')
    expect(claims).toHaveLength(1)
    expect(claims![0]!.points).toBe(50)

    const claimed = await drink.rpc('get_my_current_daily_challenge')
    expect(claimed.data.status).toBe('already_claimed')
    expect(claimed.data.participation_mode).toBe('bring_a_friend')
  })

  it('does not let announcements gate All Hands claims', async () => {
    await seedNowAlignedSchedule(service, { targetHour: 13, cruiseDay: 1 })
    const admin = await signInAs(fixtures, 'admin')
    const announce = await admin.rpc('admin_set_daily_challenge_announcement', {
      p_day_number: 1,
      p_announcement: 'Meet @ 3 PM',
      p_client_request_id: randomUUID(),
    })
    expect(announce.error).toBeNull()
    expect(announce.data.ok).toBe(true)

    const drink = await signInAs(fixtures, 'drink_only')
    const current = await drink.rpc('get_my_current_daily_challenge')
    expect(current.data.status).toBe('active')
    expect(current.data.admin_announcement).toBe('Meet @ 3 PM')
    expect(current.data.participation_mode).toBe('all_hands')

    const photoId = await stageDailyPhoto(drink)
    const submit = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: current.data.challenge_id,
        photo_id: photoId,
        caption: 'announcement present',
      },
    })
    expect(submit.data.ok).toBe(true)
  })

  it('keeps Friday noon–6 PM open and closes after ship-local 6 PM', async () => {
    const fridayLate = await service.rpc('dev_get_current_daily_challenge_at', {
      p_at_utc: slotUtc(7, '18:30:00'),
    })
    expect(fridayLate.data.status).not.toBe('active')

    const fridayOpen = await service.rpc('dev_get_current_daily_challenge_at', {
      p_at_utc: slotUtc(7, '15:00:00'),
    })
    expect(fridayOpen.data.status).toBe('active')
    expect(fridayOpen.data.title).toBe('Miami Vice Finale')
    expect(fridayOpen.data.participation_mode).toBe('all_hands')
  })
})
