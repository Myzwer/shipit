/**
 * Phase 4B3 Gate B — Ship It! bound photo Storage access requires shipit membership.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEV_BASE_OFFSET_MIN,
  loadBountyFixtures,
} from '../helpers/bountyFixtures'
import { playerId } from '../helpers/drinkitSubmit'
import { createLocalClient, signInAs } from '../helpers/localSupabase'
import { seedNowAlignedSchedule } from '../helpers/nowAlignedCruise'
import type { ClockFixtures } from '../helpers/clockFixtures'

const TINY_JPEG = readFileSync(join(process.cwd(), 'tests/fixtures/tiny.jpg'))

let fixtures: ClockFixtures
let challengeId: string

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
  const { data } = await fixtures.service!
    .from('scavenger_challenges')
    .select('id')
    .eq('canonical_key', 'the-piazza-grandeur')
    .single()
  challengeId = data!.id
})

beforeEach(async () => {
  await fixtures.service!.rpc('dev_reset_scavenger_test_data')
  await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
})

async function stageAndSubmit(
  client: Awaited<ReturnType<typeof signInAs>>,
  authorId: string,
  atUtc: string,
) {
  const begin = await client.rpc('begin_photo_upload', {
    p_game: 'shipit',
    p_purpose: 'scavenger',
    p_mime_type: 'image/jpeg',
    p_byte_size: TINY_JPEG.length,
    p_width: 8,
    p_height: 8,
    p_original_filename: 't.jpg',
    p_client_request_id: randomUUID(),
  })
  expect(begin.data.ok).toBe(true)
  await client.storage.from(begin.data.bucket).upload(begin.data.storage_path, TINY_JPEG, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  await client.rpc('confirm_photo_upload', { p_photo_id: begin.data.photo_id })
  const res = await fixtures.service!.rpc('dev_submit_scavenger_at', {
    p_player_id: authorId,
    p_at_utc: atUtc,
    p_payload: {
      idempotency_key: randomUUID(),
      challenge_id: challengeId,
      photo_id: begin.data.photo_id,
      caption: null,
    },
  })
  expect(res.error).toBeNull()
  expect(res.data?.ok).toBe(true)
  return { path: begin.data.storage_path as string, bucket: begin.data.bucket as string, photoId: begin.data.photo_id as string }
}

describe('Phase 4B3 Gate B — shipit photo privacy', () => {
  it('same-team shipit member can download; drinkit-only / other team / anon denied', async () => {
    await seedNowAlignedSchedule(fixtures.service!, { targetHour: 13, cruiseDay: 1 })
    const at = new Date().toISOString()
    const local = {
      available: true as const,
      password: fixtures.password!,
      summary: fixtures.summary!,
      anonKey: fixtures.anonKey!,
      serviceRoleKey: fixtures.serviceRoleKey!,
    }
    const both = await signInAs(local, 'both')
    const bound = await stageAndSubmit(both, playerId(fixtures, 'both'), at)

    // Same team shipit teammate (ship_only shares Demo Team Alpha with both)
    const ship = await signInAs(local, 'ship_only')
    const peerOk = await ship.storage.from(bound.bucket).download(bound.path)
    expect(peerOk.error).toBeNull()
    expect(peerOk.data).toBeTruthy()

    // Drink It!-only: ensure they have a team row matching both's team, but no shipit game.
    const drinkOnlyId = playerId(fixtures, 'drink_only')
    const bothTeam = await fixtures.service!
      .from('team_memberships')
      .select('team_id')
      .eq('player_id', playerId(fixtures, 'both'))
      .is('active_to', null)
      .maybeSingle()
    expect(bothTeam.data?.team_id).toBeTruthy()
    await fixtures.service!.from('team_memberships').delete().eq('player_id', drinkOnlyId)
    await fixtures.service!.from('team_memberships').insert({
      player_id: drinkOnlyId,
      team_id: bothTeam.data!.team_id,
      active_to: null,
    })
    try {
      // Confirm drink_only has drinkit, not shipit
      const { data: gm } = await fixtures.service!
        .from('game_memberships')
        .select('game, enabled')
        .eq('player_id', drinkOnlyId)
      const games = new Map((gm ?? []).map((r) => [r.game, r.enabled]))
      expect(games.get('drinkit')).toBe(true)
      expect(games.get('shipit')).not.toBe(true)

      const drinkOnly = await signInAs(local, 'drink_only')
      const drinkDeny = await drinkOnly.storage.from(bound.bucket).download(bound.path)
      expect(drinkDeny.error).toBeTruthy()

      // Different-team shipit member (admin)
      const admin = await signInAs(local, 'admin')
      const adminDeny = await admin.storage.from(bound.bucket).download(bound.path)
      expect(adminDeny.error).toBeTruthy()

      // Anonymous
      const anon = createLocalClient(fixtures.summary!.supabase_url, fixtures.anonKey!)
      const anonDeny = await anon.storage.from(bound.bucket).download(bound.path)
      expect(anonDeny.error).toBeTruthy()

      // Unbound photo owned by another player
      const begin2 = await both.rpc('begin_photo_upload', {
        p_game: 'shipit',
        p_purpose: 'scavenger',
        p_mime_type: 'image/jpeg',
        p_byte_size: TINY_JPEG.length,
        p_width: 8,
        p_height: 8,
        p_original_filename: 'u.jpg',
        p_client_request_id: randomUUID(),
      })
      await both.storage.from(begin2.data.bucket).upload(begin2.data.storage_path, TINY_JPEG, {
        contentType: 'image/jpeg',
        upsert: true,
      })
      await both.rpc('confirm_photo_upload', { p_photo_id: begin2.data.photo_id })
      const unboundDeny = await ship.storage.from(begin2.data.bucket).download(begin2.data.storage_path)
      expect(unboundDeny.error).toBeTruthy()
    } finally {
      // Restore drink_only fixture: no active team membership.
      await fixtures.service!.from('team_memberships').delete().eq('player_id', drinkOnlyId)
    }
  })
})
