/**
 * Phase 5A — Gallery feed, reactions, unread, photo privacy.
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
} from '../helpers/bountyFixtures'
import { drinkPayload, exposeCurrentSlots, lookupOffering, playerId, submitAt } from '../helpers/drinkitSubmit'
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
  await fixtures.service!.from('read_cursors').delete().neq('player_id', randomUUID())
  await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateReadyCatalogAndSchedule(fixtures.service!, `phase5a-${randomUUID().slice(0, 8)}`)
})

function local() {
  return {
    available: true as const,
    password: fixtures.password!,
    summary: fixtures.summary!,
    anonKey: fixtures.anonKey!,
    serviceRoleKey: fixtures.serviceRoleKey!,
  }
}

async function stagePhoto(
  client: Awaited<ReturnType<typeof signInAs>>,
  purpose: 'drink_log' | 'daily' | 'scavenger',
  game: 'drinkit' | 'shipit',
) {
  const begin = await client.rpc('begin_photo_upload', {
    p_game: game,
    p_purpose: purpose,
    p_mime_type: 'image/jpeg',
    p_byte_size: TINY_JPEG.length,
    p_width: 32,
    p_height: 24,
    p_original_filename: 'g.jpg',
    p_client_request_id: randomUUID(),
  })
  expect(begin.data.ok).toBe(true)
  await client.storage.from(begin.data.bucket).upload(begin.data.storage_path, TINY_JPEG, {
    contentType: 'image/jpeg',
    upsert: true,
  })
  await client.rpc('confirm_photo_upload', { p_photo_id: begin.data.photo_id })
  return begin.data.photo_id as string
}

describe('Phase 5A Gallery feed', () => {
  it('lists Drink It! posts with keyset pages and no duplicates', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const author = playerId(fixtures, 'drink_only')
    for (let i = 0; i < 7; i++) {
      const res = await submitAt(
        fixtures.service!,
        author,
        drinkPayload({
          barKey: 'wake-view',
          offeringId: offering.offering_id,
          caption: `post-${i}`,
        }),
        at,
      )
      expect(res.data.ok).toBe(true)
    }

    const drink = await signInAs(local(), 'drink_only')
    const page1 = await drink.rpc('list_gallery_feed', {
      p_game: 'drinkit',
      p_filter: 'everyone',
      p_limit: 5,
    })
    expect(page1.data.ok).toBe(true)
    expect(page1.data.events).toHaveLength(5)
    expect(page1.data.has_more).toBe(true)
    const ids1 = page1.data.events.map((e: { event_id: string }) => e.event_id)

    const page2 = await drink.rpc('list_gallery_feed', {
      p_game: 'drinkit',
      p_filter: 'everyone',
      p_limit: 5,
      p_before_created_at: page1.data.next_cursor.created_at_utc,
      p_before_id: page1.data.next_cursor.id,
    })
    expect(page2.data.ok).toBe(true)
    expect(page2.data.events.length).toBeGreaterThanOrEqual(2)
    const ids2 = page2.data.events.map((e: { event_id: string }) => e.event_id)
    expect(ids1.some((id: string) => ids2.includes(id))).toBe(false)

    const ship = await signInAs(local(), 'ship_only')
    const denied = await ship.rpc('list_gallery_feed', {
      p_game: 'drinkit',
      p_filter: 'everyone',
      p_limit: 5,
    })
    expect(denied.error || denied.data?.ok === false).toBeTruthy()
  })

  it('My Gallery / My Team filters and Everyone scopes', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    await submitAt(
      fixtures.service!,
      playerId(fixtures, 'drink_only'),
      drinkPayload({ barKey: 'wake-view', offeringId: offering.offering_id, caption: 'mine' }),
      at,
    )
    await submitAt(
      fixtures.service!,
      playerId(fixtures, 'both'),
      drinkPayload({ barKey: 'wake-view', offeringId: offering.offering_id, caption: 'peer' }),
      at,
    )

    const drink = await signInAs(local(), 'drink_only')
    const mine = await drink.rpc('list_gallery_feed', {
      p_game: 'drinkit',
      p_filter: 'mine',
      p_limit: 5,
    })
    expect(mine.data.events.every((e: { caption: string }) => e.caption === 'mine')).toBe(true)

    const everyone = await drink.rpc('list_gallery_feed', {
      p_game: 'drinkit',
      p_filter: 'everyone',
      p_limit: 5,
    })
    expect(everyone.data.events.length).toBeGreaterThanOrEqual(2)
  })

  it('reactions toggle/replace; unauthorized denied; no score change', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const sub = await submitAt(
      fixtures.service!,
      playerId(fixtures, 'drink_only'),
      drinkPayload({ barKey: 'wake-view', offeringId: offering.offering_id }),
      at,
    )
    const eventId = sub.data.gallery_event_id as string

    const drink = await signInAs(local(), 'drink_only')
    const add = await drink.rpc('set_gallery_reaction', {
      p_event_id: eventId,
      p_emoji: 'heart',
    })
    expect(add.data.ok).toBe(true)
    expect(add.data.my_reaction).toBe('heart')
    expect(add.data.reactions.heart).toBe(1)

    const swap = await drink.rpc('set_gallery_reaction', {
      p_event_id: eventId,
      p_emoji: 'laugh',
    })
    expect(swap.data.my_reaction).toBe('laugh')
    expect(swap.data.reactions.heart).toBe(0)
    expect(swap.data.reactions.laugh).toBe(1)

    const remove = await drink.rpc('set_gallery_reaction', {
      p_event_id: eventId,
      p_emoji: 'laugh',
    })
    expect(remove.data.my_reaction).toBeNull()

    const ship = await signInAs(local(), 'ship_only')
    const denied = await ship.rpc('set_gallery_reaction', {
      p_event_id: eventId,
      p_emoji: 'heart',
    })
    expect(denied.error || denied.data?.ok === false).toBeTruthy()

    const { count } = await fixtures.service!
      .from('bounty_claims')
      .select('id', { count: 'exact', head: true })
      .eq('submission_id', sub.data.submission_id)
    expect(count ?? 0).toBe(0)
  })

  it('unread marks delivered Everyone only; own posts and mine filter do not clear', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')

    const drink = await signInAs(local(), 'drink_only')
    // Peer posts
    const peer = await submitAt(
      fixtures.service!,
      playerId(fixtures, 'both'),
      drinkPayload({ barKey: 'wake-view', offeringId: offering.offering_id, caption: 'peer' }),
      at,
    )
    expect(peer.data.ok).toBe(true)

    const unread1 = await drink.rpc('get_gallery_unread', { p_game: 'drinkit' })
    expect(unread1.data.has_unread).toBe(true)

    // Own post does not clear
    await submitAt(
      fixtures.service!,
      playerId(fixtures, 'drink_only'),
      drinkPayload({ barKey: 'wake-view', offeringId: offering.offering_id, caption: 'own' }),
      at,
    )
    const unread2 = await drink.rpc('get_gallery_unread', { p_game: 'drinkit' })
    expect(unread2.data.has_unread).toBe(true)

    // Mine filter load does not mark
    await drink.rpc('list_gallery_feed', { p_game: 'drinkit', p_filter: 'mine', p_limit: 5 })
    const unread3 = await drink.rpc('get_gallery_unread', { p_game: 'drinkit' })
    expect(unread3.data.has_unread).toBe(true)

    const feed = await drink.rpc('list_gallery_feed', {
      p_game: 'drinkit',
      p_filter: 'everyone',
      p_limit: 5,
    })
    const newest = feed.data.newest_event
    await drink.rpc('mark_gallery_seen', {
      p_game: 'drinkit',
      p_event_id: newest.id,
      p_created_at_utc: newest.created_at_utc,
    })
    const unread4 = await drink.rpc('get_gallery_unread', { p_game: 'drinkit' })
    expect(unread4.data.has_unread).toBe(false)
  })

  it('same-game bound photo access; cross-game and unbound denied', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const drink = await signInAs(local(), 'drink_only')
    const both = await signInAs(local(), 'both')
    const photoId = await stagePhoto(drink, 'drink_log', 'drinkit')
    const sub = await submitAt(
      fixtures.service!,
      playerId(fixtures, 'drink_only'),
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        photoId,
      }),
      at,
    )
    expect(sub.data.ok).toBe(true)

    const peerOk = await both.rpc('create_drinkit_photo_signed_url', {
      p_photo_id: photoId,
    })
    expect(peerOk.data.ok).toBe(true)

    const ship = await signInAs(local(), 'ship_only')
    const cross = await ship.rpc('create_drinkit_photo_signed_url', { p_photo_id: photoId })
    expect(cross.data.ok).toBe(false)

    const staged = await stagePhoto(drink, 'drink_log', 'drinkit')
    const unbound = await both.rpc('create_drinkit_photo_signed_url', { p_photo_id: staged })
    expect(unbound.data.ok).toBe(false)
  })

  it('Ship It! scavenger appears in Everyone and My Team', async () => {
    await seedNowAlignedSchedule(fixtures.service!, { targetHour: 13, cruiseDay: 1 })
    const { data: challenge } = await fixtures.service!
      .from('scavenger_challenges')
      .select('id')
      .eq('canonical_key', 'the-piazza-grandeur')
      .single()
    expect(challenge?.id).toBeTruthy()
    const both = await signInAs(local(), 'both')
    const photoId = await stagePhoto(both, 'scavenger', 'shipit')
    const ok = await both.rpc('submit_scavenger', {
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challenge!.id,
        photo_id: photoId,
        caption: 'team post',
      },
    })
    expect(ok.data.ok).toBe(true)

    const everyone = await both.rpc('list_gallery_feed', {
      p_game: 'shipit',
      p_filter: 'everyone',
      p_limit: 5,
    })
    expect(everyone.data.events.some((e: { kind: string }) => e.kind === 'scavenger')).toBe(true)

    const team = await both.rpc('list_gallery_feed', {
      p_game: 'shipit',
      p_filter: 'team',
      p_limit: 5,
    })
    expect(team.data.events.length).toBeGreaterThanOrEqual(1)

    const drinkOnly = await signInAs(local(), 'drink_only')
    const denied = await drinkOnly.rpc('list_gallery_feed', {
      p_game: 'shipit',
      p_filter: 'everyone',
      p_limit: 5,
    })
    expect(denied.error || denied.data?.ok === false).toBeTruthy()
  })
})
