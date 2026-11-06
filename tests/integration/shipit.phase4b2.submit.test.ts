/**
 * Phase 4B2 — submit_scavenger atomic scoring + photo bind.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEV_BASE_OFFSET_MIN,
  loadBountyFixtures,
  noonDay1Utc,
  slotUtc,
} from '../helpers/bountyFixtures'
import { playerId } from '../helpers/drinkitSubmit'
import { createLocalClient, loadLocalFixtures, signInAs } from '../helpers/localSupabase'
import { seedNowAlignedSchedule } from '../helpers/nowAlignedCruise'
import type { ClockFixtures } from '../helpers/clockFixtures'

const TINY_JPEG = readFileSync(join(process.cwd(), 'tests/fixtures/tiny.jpg'))

let fixtures: ClockFixtures
let challengeId: string
let challengePoints: number
let challengeMoviesId: string
let challengeDomeId: string
let challengeThirdId: string

beforeAll(async () => {
  // Bound scavenger photos block cruise reseed (SET NULL vs immutability) — wipe first.
  const local = await loadLocalFixtures()
  if (local.available && local.summary && local.serviceRoleKey) {
    const boot = createLocalClient(local.summary.supabase_url, local.serviceRoleKey)
    await boot.rpc('dev_reset_scavenger_test_data')
  }
  fixtures = await loadBountyFixtures()
  const { data: ch } = await fixtures.service!
    .from('scavenger_challenges')
    .select('id, points, canonical_key, sort_order')
    .in('canonical_key', ['the-piazza-grandeur', 'movies-under-the-stars', 'under-the-dome'])
  const byKey = new Map((ch ?? []).map((r) => [r.canonical_key, r]))
  challengeId = byKey.get('the-piazza-grandeur')!.id
  challengePoints = byKey.get('the-piazza-grandeur')!.points
  challengeMoviesId = byKey.get('movies-under-the-stars')!.id
  challengeDomeId = byKey.get('under-the-dome')!.id
  const { data: third } = await fixtures.service!
    .from('scavenger_challenges')
    .select('id')
    .eq('sort_order', 3)
    .single()
  challengeThirdId = third!.id
})

beforeEach(async () => {
  const reset = await fixtures.service!.rpc('dev_reset_scavenger_test_data')
  expect(reset.error).toBeNull()
  await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
})

async function stageScavengerPhoto(
  client: Awaited<ReturnType<typeof signInAs>>,
  beginId?: string,
) {
  const begin = await client.rpc('begin_photo_upload', {
    p_game: 'shipit',
    p_purpose: 'scavenger',
    p_mime_type: 'image/jpeg',
    p_byte_size: TINY_JPEG.length,
    p_width: 32,
    p_height: 24,
    p_original_filename: 't.jpg',
    p_client_request_id: beginId ?? randomUUID(),
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

describe('Phase 4B2 submit_scavenger', () => {
  it('authenticated submit accepts staged photo and awards points (now-aligned cruise)', async () => {
    await seedNowAlignedSchedule(fixtures.service!, { targetHour: 13, cruiseDay: 1 })
    const both = await signInAs(
      {
        available: true,
        password: fixtures.password!,
        summary: fixtures.summary!,
        anonKey: fixtures.anonKey!,
        serviceRoleKey: fixtures.serviceRoleKey!,
      },
      'both',
    )
    const photoId = await stageScavengerPhoto(both)
    const res = await both.rpc('submit_scavenger', {
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: photoId,
        caption: 'Piazza!',
      },
    })
    expect(res.error).toBeNull()
    expect(res.data.ok).toBe(true)
    expect(res.data.awarded_points).toBe(challengePoints)
    expect(res.data.code).toBe('ACCEPTED')

    const photo = await both.rpc('get_my_photo', { p_photo_id: photoId })
    expect(photo.data.status).toBe('bound')

    const board = await both.rpc('get_my_shipit_home')
    expect(board.data.team.completed).toBeGreaterThanOrEqual(1)
    expect(board.data.team.points).toBeGreaterThanOrEqual(challengePoints)
  })

  it('rejects missing / wrong-purpose photos', async () => {
    const at = noonDay1Utc()
    const player = playerId(fixtures, 'both')
    const missing = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: player,
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: randomUUID(),
        caption: null,
      },
      p_at_utc: at,
    })
    expect(missing.data.ok).toBe(false)
    expect(missing.data.code).toMatch(/PHOTO/)

    const both = await signInAs(
      {
        available: true,
        password: fixtures.password!,
        summary: fixtures.summary!,
        anonKey: fixtures.anonKey!,
        serviceRoleKey: fixtures.serviceRoleKey!,
      },
      'both',
    )
    const drinkBegin = await both.rpc('begin_photo_upload', {
      p_game: 'drinkit',
      p_purpose: 'drink_log',
      p_mime_type: 'image/jpeg',
      p_byte_size: TINY_JPEG.length,
      p_width: 1,
      p_height: 1,
      p_client_request_id: randomUUID(),
    })
    await both.storage
      .from(drinkBegin.data.bucket)
      .upload(drinkBegin.data.storage_path, TINY_JPEG, { contentType: 'image/jpeg', upsert: true })
    await both.rpc('confirm_photo_upload', { p_photo_id: drinkBegin.data.photo_id })
    const wrongPurpose = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: player,
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: drinkBegin.data.photo_id,
        caption: null,
      },
      p_at_utc: at,
    })
    expect(wrongPurpose.data.ok).toBe(false)
    expect(wrongPurpose.data.code).toBe('PHOTO_CONTEXT_MISMATCH')
  })

  it('same UUID replays; changed payload rejects; teammate gets TEAM_CHALLENGE_DONE', async () => {
    const at = noonDay1Utc()
    const both = await signInAs(
      {
        available: true,
        password: fixtures.password!,
        summary: fixtures.summary!,
        anonKey: fixtures.anonKey!,
        serviceRoleKey: fixtures.serviceRoleKey!,
      },
      'both',
    )
    const photoId = await stageScavengerPhoto(both)
    const key = randomUUID()
    const payload = {
      idempotency_key: key,
      challenge_id: challengeId,
      photo_id: photoId,
      caption: 'one',
    }
    const first = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_payload: payload,
      p_at_utc: at,
    })
    expect(first.data.ok).toBe(true)
    const replay = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_payload: payload,
      p_at_utc: at,
    })
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.submission_id).toBe(first.data.submission_id)

    const mismatch = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_payload: { ...payload, caption: 'two' },
      p_at_utc: at,
    })
    expect(mismatch.data.ok).toBe(false)
    expect(mismatch.data.code).toBe('IDEMPOTENCY_PAYLOAD_MISMATCH')

    // Replay still works after finale wall time via same UUID.
    const afterFinale = slotUtc(7, '19:00:00')
    const replayFinale = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_payload: payload,
      p_at_utc: afterFinale,
    })
    expect(replayFinale.data.ok).toBe(true)
    expect(replayFinale.data.idempotent_replay).toBe(true)

    const ship = await signInAs(
      {
        available: true,
        password: fixtures.password!,
        summary: fixtures.summary!,
        anonKey: fixtures.anonKey!,
        serviceRoleKey: fixtures.serviceRoleKey!,
      },
      'ship_only',
    )
    // ship_only is a different team in fixtures — use admin? Find teammate of both.
    const bothPid = playerId(fixtures, 'both')
    const { data: tm } = await fixtures.service!
      .from('team_memberships')
      .select('team_id')
      .eq('player_id', bothPid)
      .is('active_to', null)
      .single()
    const { data: mates } = await fixtures.service!
      .from('team_memberships')
      .select('player_id')
      .eq('team_id', tm!.team_id)
      .is('active_to', null)
    const mateId = mates?.find((m) => m.player_id !== bothPid)?.player_id
    if (!mateId) {
      // No teammate provisioned — skip concurrent teammate assert but keep ship_only independent below.
      void ship
      return
    }
    const mateKey = fixtures.summary!.identities.find((i) => i.player_id === mateId)?.key
    if (!mateKey) return
    const mate = await signInAs(
      {
        available: true,
        password: fixtures.password!,
        summary: fixtures.summary!,
        anonKey: fixtures.anonKey!,
        serviceRoleKey: fixtures.serviceRoleKey!,
      },
      mateKey,
    )
    const matePhoto = await stageScavengerPhoto(mate)
    const denied = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: mateId,
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeId,
        photo_id: matePhoto,
        caption: null,
      },
      p_at_utc: at,
    })
    expect(denied.data.ok).toBe(false)
    expect(denied.data.code).toBe('TEAM_CHALLENGE_DONE')
    const still = await mate.rpc('get_my_photo', { p_photo_id: matePhoto })
    expect(still.data.status).toBe('staged')
  })

  it('Drink It! pause does not block Ship It!; finale blocks new submits', async () => {
    const at = noonDay1Utc()
    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    const both = await signInAs(
      {
        available: true,
        password: fixtures.password!,
        summary: fixtures.summary!,
        anonKey: fixtures.anonKey!,
        serviceRoleKey: fixtures.serviceRoleKey!,
      },
      'both',
    )
    const photoId = await stageScavengerPhoto(both)
    const pausedOk = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeMoviesId,
        photo_id: photoId,
        caption: null,
      },
      p_at_utc: at,
    })
    expect(pausedOk.data.ok).toBe(true)
    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })

    const photo2 = await stageScavengerPhoto(both)
    const ended = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeThirdId,
        photo_id: photo2,
        caption: null,
      },
      p_at_utc: slotUtc(7, '19:00:00'),
    })
    expect(ended.data.ok).toBe(false)
    expect(ended.data.code).toBe('GAME_ENDED')
  })

  it('different teams can complete the same challenge', async () => {
    const at = noonDay1Utc()
    const both = await signInAs(
      {
        available: true,
        password: fixtures.password!,
        summary: fixtures.summary!,
        anonKey: fixtures.anonKey!,
        serviceRoleKey: fixtures.serviceRoleKey!,
      },
      'both',
    )
    // Local fixtures put both+ship_only on one team; admin (organizer) is the other team.
    const admin = await signInAs(
      {
        available: true,
        password: fixtures.password!,
        summary: fixtures.summary!,
        anonKey: fixtures.anonKey!,
        serviceRoleKey: fixtures.serviceRoleKey!,
      },
      'admin',
    )
    const a = await stageScavengerPhoto(both)
    const b = await stageScavengerPhoto(admin)
    const ra = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeDomeId,
        photo_id: a,
        caption: null,
      },
      p_at_utc: at,
    })
    const rb = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'admin'),
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challengeDomeId,
        photo_id: b,
        caption: null,
      },
      p_at_utc: at,
    })
    expect(ra.data).toMatchObject({ ok: true })
    expect(rb.data).toMatchObject({ ok: true })
    expect(ra.data.submission_id).not.toBe(rb.data.submission_id)
  })
})
