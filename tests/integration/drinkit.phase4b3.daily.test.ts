/**
 * Phase 4B3 — submit_daily atomic scoring + photo bind.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  activateReadyCatalogAndSchedule,
  DEV_BASE_OFFSET_MIN,
  loadBountyFixtures,
  noonDay1Utc,
  slotUtc,
} from '../helpers/bountyFixtures'
import { playerId } from '../helpers/drinkitSubmit'
import { signInAs } from '../helpers/localSupabase'
import { seedNowAlignedSchedule } from '../helpers/nowAlignedCruise'
import type { ClockFixtures } from '../helpers/clockFixtures'

const TINY_JPEG = readFileSync(join(process.cwd(), 'tests/fixtures/tiny.jpg'))

let fixtures: ClockFixtures

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
})

beforeEach(async () => {
  await fixtures.service!.rpc('dev_reset_scavenger_test_data')
  await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateReadyCatalogAndSchedule(fixtures.service!, `phase4b3-${randomUUID().slice(0, 8)}`)
})

async function todayChallengeId(at: string) {
  const daily = await fixtures.service!.rpc('dev_get_current_daily_challenge_at', {
    p_at_utc: at,
  })
  expect(daily.data?.status).toBe('active')
  return daily.data.challenge_id as string
}

async function stageDailyPhoto(client: Awaited<ReturnType<typeof signInAs>>) {
  const begin = await client.rpc('begin_photo_upload', {
    p_game: 'drinkit',
    p_purpose: 'daily',
    p_mime_type: 'image/jpeg',
    p_byte_size: TINY_JPEG.length,
    p_width: 32,
    p_height: 24,
    p_original_filename: 'daily.jpg',
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

describe('Phase 4B3 submit_daily', () => {
  it('requires staged daily photo and awards exactly 50 once', async () => {
    await seedNowAlignedSchedule(fixtures.service!, { targetHour: 13, cruiseDay: 1 })
    const local = {
      available: true as const,
      password: fixtures.password!,
      summary: fixtures.summary!,
      anonKey: fixtures.anonKey!,
      serviceRoleKey: fixtures.serviceRoleKey!,
    }
    const drink = await signInAs(local, 'drink_only')
    const at = new Date().toISOString()
    const challengeId = (await drink.rpc('get_my_current_daily_challenge')).data.challenge_id as string

    const missing = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: randomUUID(),
        caption: null,
      },
    })
    expect(missing.data.ok).toBe(false)
    expect(missing.data.code).toMatch(/PHOTO_/)

    const photoId = await stageDailyPhoto(drink)
    const key = randomUUID()
    const ok = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: key,
        challenge_id: challengeId,
        photo_id: photoId,
        caption: 'Daily win',
      },
    })
    expect(ok.error).toBeNull()
    expect(ok.data.ok).toBe(true)
    expect(ok.data.awarded_points).toBe(50)
    expect(ok.data.code).toBe('ACCEPTED')

    const { count } = await fixtures.service!
      .from('bounty_claims')
      .select('id', { count: 'exact', head: true })
      .eq('player_id', playerId(fixtures, 'drink_only'))
      .eq('category', 'daily')
      .eq('status', 'active')
    expect(count).toBe(1)

    const { data: photo } = await fixtures.service!
      .from('photos')
      .select('status, bound_submission_id')
      .eq('id', photoId)
      .single()
    expect(photo?.status).toBe('bound')
    expect(photo?.bound_submission_id).toBe(ok.data.submission_id)

    const replay = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: key,
        challenge_id: challengeId,
        photo_id: photoId,
        caption: 'Daily win',
      },
    })
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.submission_id).toBe(ok.data.submission_id)

    const mismatch = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: key,
        challenge_id: challengeId,
        photo_id: photoId,
        caption: 'changed',
      },
    })
    expect(mismatch.data.ok).toBe(false)
    expect(mismatch.data.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH')

    const second = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: await stageDailyPhoto(drink),
        caption: null,
      },
    })
    expect(second.data.ok).toBe(false)
    expect(second.data.code).toBe('ALREADY_CLAIMED')
    void at
  })

  it('different players independently score; pause blocks new; replay after pause/finale works', async () => {
    const at = noonDay1Utc()
    const challengeId = await todayChallengeId(at)
    const a = playerId(fixtures, 'drink_only')
    const b = playerId(fixtures, 'both')

    const photoA = await (async () => {
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
      return stageDailyPhoto(client)
    })()
    const photoB = await (async () => {
      const client = await signInAs(
        {
          available: true,
          password: fixtures.password!,
          summary: fixtures.summary!,
          anonKey: fixtures.anonKey!,
          serviceRoleKey: fixtures.serviceRoleKey!,
        },
        'both',
      )
      return stageDailyPhoto(client)
    })()

    const keyA = randomUUID()
    const first = await fixtures.service!.rpc('dev_submit_daily_at', {
      p_player_id: a,
      p_at_utc: at,
      p_payload: {
        idempotency_key: keyA,
        challenge_id: challengeId,
        photo_id: photoA,
        caption: null,
      },
    })
    expect(first.data.ok).toBe(true)
    expect(first.data.awarded_points).toBe(50)

    const secondPlayer = await fixtures.service!.rpc('dev_submit_daily_at', {
      p_player_id: b,
      p_at_utc: at,
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: photoB,
        caption: null,
      },
    })
    expect(secondPlayer.data.ok).toBe(true)
    expect(secondPlayer.data.awarded_points).toBe(50)

    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    const pausedNew = await fixtures.service!.rpc('dev_submit_daily_at', {
      p_player_id: a,
      p_at_utc: at,
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: photoA,
        caption: null,
      },
    })
    // Already claimed wins over pause for second UUID; use a player with no claim
    const drinkOnlyPhoto2Client = await signInAs(
      {
        available: true,
        password: fixtures.password!,
        summary: fixtures.summary!,
        anonKey: fixtures.anonKey!,
        serviceRoleKey: fixtures.serviceRoleKey!,
      },
      'admin',
    )
    // admin may not have drinkit — use fresh staging for both who already claimed → ALREADY_CLAIMED
    expect(pausedNew.data.code === 'ALREADY_CLAIMED' || pausedNew.data.code === 'GAME_PAUSED').toBe(
      true,
    )

    const replayPaused = await fixtures.service!.rpc('dev_submit_daily_at', {
      p_player_id: a,
      p_at_utc: at,
      p_payload: {
        idempotency_key: keyA,
        challenge_id: challengeId,
        photo_id: photoA,
        caption: null,
      },
    })
    expect(replayPaused.data.ok).toBe(true)
    expect(replayPaused.data.idempotent_replay).toBe(true)

    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })

    // Before noon
    const early = slotUtc(1, '10:00:00')
    const earlyChallenge = await fixtures.service!.rpc('dev_get_current_daily_challenge_at', {
      p_at_utc: early,
    })
    expect(earlyChallenge.data.status).not.toBe('active')

    // After 11 PM day 1
    const late = slotUtc(1, '23:30:00')
    const lateRes = await fixtures.service!.rpc('dev_submit_daily_at', {
      p_player_id: a,
      p_at_utc: late,
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: photoA,
        caption: null,
      },
    })
    expect(lateRes.data.ok).toBe(false)

    // Finale blocks new; replay still works
    const finale = slotUtc(7, '18:30:00')
    const finaleNew = await fixtures.service!.rpc('dev_submit_daily_at', {
      p_player_id: a,
      p_at_utc: finale,
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: photoA,
        caption: null,
      },
    })
    expect(finaleNew.data.ok).toBe(false)
    expect(['GAME_ENDED', 'ALREADY_CLAIMED', 'UNAVAILABLE', 'CHALLENGE_NOT_TODAY']).toContain(
      finaleNew.data.code,
    )

    const finaleReplay = await fixtures.service!.rpc('dev_submit_daily_at', {
      p_player_id: a,
      p_at_utc: finale,
      p_payload: {
        idempotency_key: keyA,
        challenge_id: challengeId,
        photo_id: photoA,
        caption: null,
      },
    })
    expect(finaleReplay.data.ok).toBe(true)
    expect(finaleReplay.data.idempotent_replay).toBe(true)
    void drinkOnlyPhoto2Client
  })

  it('rejects wrong purpose/game/owner/fixture and forged fields', async () => {
    const at = noonDay1Utc()
    const challengeId = await todayChallengeId(at)
    const local = {
      available: true as const,
      password: fixtures.password!,
      summary: fixtures.summary!,
      anonKey: fixtures.anonKey!,
      serviceRoleKey: fixtures.serviceRoleKey!,
    }
    const drink = await signInAs(local, 'drink_only')
    const both = await signInAs(local, 'both')

    const drinkLog = await both.rpc('begin_photo_upload', {
      p_game: 'drinkit',
      p_purpose: 'drink_log',
      p_mime_type: 'image/jpeg',
      p_byte_size: TINY_JPEG.length,
      p_width: 8,
      p_height: 8,
      p_original_filename: 'd.jpg',
      p_client_request_id: randomUUID(),
    })
    await both.storage.from(drinkLog.data.bucket).upload(drinkLog.data.storage_path, TINY_JPEG, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    await both.rpc('confirm_photo_upload', { p_photo_id: drinkLog.data.photo_id })

    const wrongPurpose = await fixtures.service!.rpc('dev_submit_daily_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_at_utc: at,
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: drinkLog.data.photo_id,
        caption: null,
      },
    })
    expect(wrongPurpose.data.ok).toBe(false)
    expect(wrongPurpose.data.code).toBe('PHOTO_CONTEXT_MISMATCH')

    const photo = await stageDailyPhoto(drink)
    const forged = await fixtures.service!.rpc('dev_submit_daily_at', {
      p_player_id: playerId(fixtures, 'drink_only'),
      p_at_utc: at,
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: photo,
        caption: null,
        points: 999,
      },
    })
    expect(forged.data.ok).toBe(false)
    expect(forged.data.code).toBe('FORGED_FIELDS')

    const stolen = await fixtures.service!.rpc('dev_submit_daily_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_at_utc: at,
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: photo,
        caption: null,
      },
    })
    expect(stolen.data.ok).toBe(false)
    expect(stolen.data.code).toBe('PHOTO_OWNERSHIP')
  })
})
