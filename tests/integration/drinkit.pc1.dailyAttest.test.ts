/**
 * PC1 — Daily Challenge attest_participation honor contract.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  activateReadyCatalogAndSchedule,
  DEV_BASE_OFFSET_MIN,
  loadBountyFixtures,
  noonDay1Utc,
  slotUtc,
} from '../helpers/bountyFixtures'
import { assertDisposableDevEnvironment } from '../helpers/devEnvironmentGuard'
import { playerId } from '../helpers/drinkitSubmit'
import { signInAs } from '../helpers/localSupabase'
import { seedNowAlignedSchedule } from '../helpers/nowAlignedCruise'
import type { ClockFixtures } from '../helpers/clockFixtures'

const TINY_JPEG = readFileSync(join(process.cwd(), 'tests/fixtures/tiny.jpg'))

let fixtures: ClockFixtures

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
  await assertDisposableDevEnvironment(fixtures, fixtures.service!)
})

beforeEach(async () => {
  await fixtures.service!.rpc('dev_reset_scavenger_test_data')
  await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateReadyCatalogAndSchedule(
    fixtures.service!,
    `pc1-attest-${randomUUID().slice(0, 8)}`,
  )
})

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

function local() {
  return {
    available: true as const,
    password: fixtures.password!,
    summary: fixtures.summary!,
    anonKey: fixtures.anonKey!,
    serviceRoleKey: fixtures.serviceRoleKey!,
  }
}

describe('PC1 Daily Challenge attest_participation', () => {
  it('All Hands: missing/false acknowledgment rejected; true accepted', async () => {
    await seedNowAlignedSchedule(fixtures.service!, { targetHour: 13, cruiseDay: 1 })
    const drink = await signInAs(local(), 'drink_only')
    const current = await drink.rpc('get_my_current_daily_challenge')
    expect(current.data.status).toBe('active')
    expect(current.data.participation_mode).toBe('all_hands')
    const challengeId = current.data.challenge_id as string

    const missing = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: await stageDailyPhoto(drink),
        caption: null,
      },
    })
    expect(missing.data.ok).toBe(false)
    expect(missing.data.code).toBe('ATTEST_PARTICIPATION_REQUIRED')

    const deniedFalse = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: await stageDailyPhoto(drink),
        caption: null,
        attest_participation: false,
      },
    })
    expect(deniedFalse.data.ok).toBe(false)
    expect(deniedFalse.data.code).toBe('ATTEST_PARTICIPATION_REQUIRED')

    const photoId = await stageDailyPhoto(drink)
    const key = randomUUID()
    const ok = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: key,
        challenge_id: challengeId,
        photo_id: photoId,
        caption: 'attended',
        attest_participation: true,
      },
    })
    expect(ok.data.ok).toBe(true)
    expect(ok.data.awarded_points).toBe(50)
    expect(ok.data.participation_mode).toBe('all_hands')
    expect(ok.data.attest_participation).toBe(true)

    const replay = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: key,
        challenge_id: challengeId,
        photo_id: photoId,
        caption: 'attended',
        attest_participation: true,
      },
    })
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.submission_id).toBe(ok.data.submission_id)
  })

  it('Bring a Friend: missing acknowledgment rejected; true accepted without companion picker', async () => {
    await seedNowAlignedSchedule(fixtures.service!, { targetHour: 13, cruiseDay: 3 })
    const drink = await signInAs(local(), 'drink_only')
    const current = await drink.rpc('get_my_current_daily_challenge')
    expect(current.data.participation_mode).toBe('bring_a_friend')
    const challengeId = current.data.challenge_id as string

    const missing = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: await stageDailyPhoto(drink),
        caption: null,
      },
    })
    expect(missing.data.ok).toBe(false)
    expect(missing.data.code).toBe('ATTEST_PARTICIPATION_REQUIRED')
    expect(String(missing.data.message ?? '')).toMatch(/another Drink It! player/i)

    const ok = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: await stageDailyPhoto(drink),
        caption: null,
        attest_participation: true,
      },
    })
    expect(ok.data.ok).toBe(true)
    expect(ok.data.awarded_points).toBe(50)
    expect(ok.data.participation_mode).toBe('bring_a_friend')
  })

  it('photo still required; late evening upload remains eligible while open', async () => {
    await seedNowAlignedSchedule(fixtures.service!, { targetHour: 20, cruiseDay: 1 })
    const drink = await signInAs(local(), 'drink_only')
    const current = await drink.rpc('get_my_current_daily_challenge')
    expect(current.data.status).toBe('active')
    expect(current.data.participation_mode).toBe('all_hands')

    const noPhoto = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: current.data.challenge_id,
        photo_id: randomUUID(),
        caption: null,
        attest_participation: true,
      },
    })
    expect(noPhoto.data.ok).toBe(false)
    expect(String(noPhoto.data.code)).toMatch(/PHOTO_/)

    // Late evening claim (well after any meetup announcement) still eligible while open.
    const lateOk = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: current.data.challenge_id,
        photo_id: await stageDailyPhoto(drink),
        caption: 'after meetup',
        attest_participation: true,
      },
    })
    expect(lateOk.data.ok).toBe(true)
    expect(lateOk.data.awarded_points).toBe(50)
  })

  it('Friday 6 PM ship-time cutoff still blocks new Daily accepts', async () => {
    const fridayOpen = await fixtures.service!.rpc('dev_get_current_daily_challenge_at', {
      p_at_utc: slotUtc(7, '15:00:00'),
    })
    expect(fridayOpen.data.status).toBe('active')
    const fridayChallengeId = fridayOpen.data.challenge_id as string

    const fridayClosed = await fixtures.service!.rpc('dev_submit_daily_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_at_utc: slotUtc(7, '18:00:00'),
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: fridayChallengeId,
        photo_id: randomUUID(),
        caption: null,
        attest_participation: true,
      },
    })
    expect(fridayClosed.data.ok).toBe(false)
    expect(fridayClosed.data.code).toBe('GAME_ENDED')
  })

  it('historical pre-attest accepted claim still replays without the new field', async () => {
    const at = noonDay1Utc()
    const author = playerId(fixtures, 'drink_only')
    const daily = await fixtures.service!.rpc('dev_get_current_daily_challenge_at', {
      p_at_utc: at,
    })
    expect(daily.data.status).toBe('active')
    const challengeId = daily.data.challenge_id as string

    const drink = await signInAs(local(), 'drink_only')
    const photoId = await stageDailyPhoto(drink)
    const key = randomUUID()

    // Simulate a pre-PC1 accepted submission: insert using legacy fingerprint (no attest key).
    const legacyFp = await fixtures.service!.rpc('drinkit_daily_fingerprint', {
      p_payload: {
        idempotency_key: key,
        challenge_id: challengeId,
        photo_id: photoId,
        caption: 'legacy',
      },
    })
    expect(legacyFp.error).toBeNull()
    expect(legacyFp.data.canonical.attest_participation).toBeUndefined()

    const { data: cruise } = await fixtures.service!
      .from('cruise_config')
      .select('id')
      .eq('is_active', true)
      .single()

    const result = {
      ok: true,
      code: 'ACCEPTED',
      submission_id: null as string | null,
      awarded_points: 50,
      challenge_id: challengeId,
      photo_id: photoId,
      idempotent_replay: false,
    }

    const { data: sub, error: subErr } = await fixtures.service!
      .from('submissions')
      .insert({
        author_player_id: author,
        idempotency_key: key,
        game: 'drinkit',
        kind: 'daily_completion',
        cruise_config_id: cruise!.id,
        received_at_utc: at,
        ship_day: 1,
        status: 'accepted',
        caption: 'legacy',
        photo_storage_key: 'legacy-path',
        request_payload_hash: legacyFp.data.hash,
        request_payload_json: legacyFp.data.canonical,
        result_json: result,
        display_snapshot_json: { challenge_id: challengeId, kind: 'daily', points: 50 },
      })
      .select('id')
      .single()
    expect(subErr).toBeNull()
    result.submission_id = sub!.id
    await fixtures.service!
      .from('submissions')
      .update({ result_json: result })
      .eq('id', sub!.id)

    const replay = await fixtures.service!.rpc('dev_submit_daily_at', {
      p_player_id: author,
      p_at_utc: at,
      p_payload: {
        idempotency_key: key,
        challenge_id: challengeId,
        photo_id: photoId,
        caption: 'legacy',
      },
    })
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.submission_id).toBe(sub!.id)
  })

  it('does not collect companion ids or attendance timestamps on daily claims', async () => {
    await seedNowAlignedSchedule(fixtures.service!, { targetHour: 13, cruiseDay: 1 })
    const drink = await signInAs(local(), 'drink_only')
    const current = await drink.rpc('get_my_current_daily_challenge')
    const photoId = await stageDailyPhoto(drink)
    const key = randomUUID()
    const ok = await drink.rpc('submit_daily', {
      p_payload: {
        idempotency_key: key,
        challenge_id: current.data.challenge_id,
        photo_id: photoId,
        caption: null,
        attest_participation: true,
        companion_player_ids: [playerId(fixtures, 'both')],
        attended_at: '15:00:00',
      },
    })
    expect(ok.data.ok).toBe(true)

    const { data: sub } = await fixtures.service!
      .from('submissions')
      .select('request_payload_json, display_snapshot_json')
      .eq('id', ok.data.submission_id)
      .single()
    expect(sub!.request_payload_json.attest_participation).toBe(true)
    expect(sub!.request_payload_json.companion_player_ids).toBeUndefined()
    expect(sub!.request_payload_json.attended_at).toBeUndefined()
    expect(sub!.display_snapshot_json.companion_player_ids).toBeUndefined()
  })
})
