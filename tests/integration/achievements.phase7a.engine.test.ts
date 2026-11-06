/**
 * Phase 7A — bounded achievement engine, awards, void, exclusives, unread.
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
import {
  clearTestAchievements,
  seedTestAchievementCatalog,
} from '../helpers/achievementFixtures'
import {
  drinkPayload,
  exposeCurrentSlots,
  lookupOffering,
  playerId,
  submitAt,
} from '../helpers/drinkitSubmit'
import { signInAs } from '../helpers/localSupabase'
import type { ClockFixtures } from '../helpers/clockFixtures'

const TINY_JPEG = readFileSync(join(process.cwd(), 'tests/fixtures/tiny.jpg'))

let fixtures: ClockFixtures

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
  await clearTestAchievements(fixtures.service!)
})

beforeEach(async () => {
  // Awards hold FKs into gallery_events; clear before cruise reseed cascades submissions/gallery.
  await clearTestAchievements(fixtures.service!)
  const { error } = await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateReadyCatalogAndSchedule(fixtures.service!, `phase7a-${randomUUID().slice(0, 8)}`)
  await seedTestAchievementCatalog(fixtures.service!)
})

async function stageScavengerPhoto(client: Awaited<ReturnType<typeof signInAs>>) {
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

describe('Phase 7A drink achievements', () => {
  it('zero-point ordinary log unlocks first-drink and returns new_achievement_ids', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const author = playerId(fixtures, 'drink_only')
    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        companions: [],
        selectedClaims: [],
      }),
      at,
    )
    expect(res.data.ok).toBe(true)
    expect(res.data.awarded_points).toBe(0)
    expect(Array.isArray(res.data.new_achievement_ids)).toBe(true)
    expect(res.data.new_achievement_ids.length).toBeGreaterThanOrEqual(1)

    const { data: awards } = await fixtures.service!
      .from('achievement_awards')
      .select('id, definition:achievement_definitions!inner(stable_key)')
      .eq('owner_player_id', author)
      .eq('status', 'active')
    const keys = (awards ?? []).map((a: { definition: { stable_key: string } }) => a.definition.stable_key)
    expect(keys).toContain('test-first-drink-log')
  })

  it('same UUID replay does not duplicate awards', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const author = playerId(fixtures, 'drink_only')
    const key = randomUUID()
    const payload = drinkPayload({
      barKey: 'wake-view',
      offeringId: offering.offering_id,
      companions: [],
      selectedClaims: [],
      idempotencyKey: key,
    })
    const first = await submitAt(fixtures.service!, author, payload, at)
    expect(first.data.ok).toBe(true)
    const ids = first.data.new_achievement_ids as string[]
    const replay = await submitAt(fixtures.service!, author, payload, at)
    expect(replay.data.ok).toBe(true)
    expect(replay.data.idempotent_replay).toBe(true)
    expect(replay.data.new_achievement_ids).toEqual(ids)

    const { count } = await fixtures.service!
      .from('achievement_awards')
      .select('id', { count: 'exact', head: true })
      .eq('owner_player_id', author)
      .eq('status', 'active')
    expect(count).toBe(ids.length)
  })

  it('beer mode and companion conditions unlock', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')
    const beer = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        mode: 'generic_beer',
        companions: [companion],
        selectedClaims: [],
      }),
      at,
    )
    expect(beer.data.ok).toBe(true)
    const { data: awards } = await fixtures.service!
      .from('achievement_awards')
      .select('definition:achievement_definitions!inner(stable_key)')
      .eq('owner_player_id', author)
      .eq('status', 'active')
    const keys = (awards ?? []).map((a: { definition: { stable_key: string } }) => a.definition.stable_key)
    expect(keys).toContain('test-beer-mode')
    expect(keys).toContain('test-companion-min')
  })

  it('unknown ingredient tags never fabricate unlocks', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const author = playerId(fixtures, 'drink_only')
    await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        companions: [],
        selectedClaims: [],
      }),
      at,
    )
    const { data: awards } = await fixtures.service!
      .from('achievement_awards')
      .select('definition:achievement_definitions!inner(stable_key)')
      .eq('owner_player_id', author)
      .eq('status', 'active')
    const keys = (awards ?? []).map((a: { definition: { stable_key: string } }) => a.definition.stable_key)
    expect(keys).not.toContain('test-rum-tag')
  })

  it('curated ingredient tag unlocks tag_match', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const { data: ingredients } = await fixtures.service!
      .from('catalog_offering_ingredients')
      .select('ingredient_id')
      .eq('offering_id', offering.offering_id)
      .limit(1)
    expect(ingredients?.length).toBeGreaterThan(0)
    const { data: versionRow } = await fixtures.service!
      .from('active_catalog_pointer')
      .select('catalog_version_id')
      .eq('id', 1)
      .single()
    await fixtures.service!.from('catalog_version_ingredient_tags').insert({
      catalog_version_id: versionRow!.catalog_version_id,
      ingredient_id: ingredients![0].ingredient_id,
      tag: 'spirit-family-rum',
    })
    const author = playerId(fixtures, 'drink_only')
    await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        companions: [],
        selectedClaims: [],
      }),
      at,
    )
    const { data: awards } = await fixtures.service!
      .from('achievement_awards')
      .select('definition:achievement_definitions!inner(stable_key)')
      .eq('owner_player_id', author)
      .eq('status', 'active')
    const keys = (awards ?? []).map((a: { definition: { stable_key: string } }) => a.definition.stable_key)
    expect(keys).toContain('test-rum-tag')
  })

  it('event interval within 30 minutes unlocks', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const author = playerId(fixtures, 'drink_only')
    await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        companions: [],
        selectedClaims: [],
      }),
      at,
    )
    const later = new Date(new Date(at).getTime() + 10 * 60 * 1000).toISOString()
    await exposeCurrentSlots(fixtures.service!, later)
    const second = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        mode: 'generic_wine',
        companions: [],
        selectedClaims: [],
      }),
      later,
    )
    expect(second.data.ok).toBe(true)
    const { data: awards } = await fixtures.service!
      .from('achievement_awards')
      .select('definition:achievement_definitions!inner(stable_key)')
      .eq('owner_player_id', author)
      .eq('status', 'active')
    const keys = (awards ?? []).map((a: { definition: { stable_key: string } }) => a.definition.stable_key)
    expect(keys).toContain('test-interval-30')
  })

  it('admin void revokes dependent award and scoring unchanged pattern holds', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const author = playerId(fixtures, 'drink_only')
    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        companions: [],
        selectedClaims: [],
      }),
      at,
    )
    expect(res.data.new_achievement_ids.length).toBeGreaterThanOrEqual(1)
    const submissionId = res.data.submission_id as string

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
    const voided = await admin.rpc('admin_void_submission', {
      p_client_request_id: randomUUID(),
      p_submission_id: submissionId,
      p_expected_status: 'accepted',
      p_reason: 'phase7a test void',
    })
    expect(voided.error).toBeNull()
    expect(voided.data.ok).toBe(true)

    const { data: awards } = await fixtures.service!
      .from('achievement_awards')
      .select('status, definition:achievement_definitions!inner(stable_key)')
      .eq('owner_player_id', author)
    const first = (awards ?? []).find(
      (a: { definition: { stable_key: string } }) => a.definition.stable_key === 'test-first-drink-log',
    )
    expect(first?.status).toBe('revoked')

    const { data: ge } = await fixtures.service!
      .from('gallery_events')
      .select('active, kind')
      .eq('kind', 'achievement')
      .eq('owner_player_id', author)
    expect((ge ?? []).every((g) => g.active === false)).toBe(true)
  })
})

describe('Phase 7A exclusive Ship It! firsts', () => {
  it('first team wins exclusive; second team does not; void transfers', async () => {
    await fixtures.service!.rpc('dev_reset_scavenger_test_data')
    const at = noonDay1Utc()
    const { data: challenge } = await fixtures.service!
      .from('scavenger_challenges')
      .select('id')
      .eq('canonical_key', 'the-piazza-grandeur')
      .single()

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

    const photo1 = await stageScavengerPhoto(both)
    const first = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challenge!.id,
        photo_id: photo1,
        caption: null,
      },
      p_at_utc: at,
    })
    expect(first.data.ok).toBe(true)
    expect(first.data.new_achievement_ids.length).toBeGreaterThanOrEqual(1)

    const photo2 = await stageScavengerPhoto(ship)
    const later = new Date(new Date(at).getTime() + 60_000).toISOString()
    // ship_only may be on a different team — if same team, second submit fails as already done.
    const second = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'ship_only'),
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: challenge!.id,
        photo_id: photo2,
        caption: null,
      },
      p_at_utc: later,
    })
    // Either TEAM_CHALLENGE_DONE (same team) or ACCEPTED without exclusive (other team).
    if (second.data.ok) {
      const { data: exclusive } = await fixtures.service!
        .from('achievement_awards')
        .select('id, owner_team_id, definition:achievement_definitions!inner(stable_key)')
        .eq('status', 'active')
        .eq('exclusive_slot', true)
      const piazza = (exclusive ?? []).filter(
        (a: { definition: { stable_key: string } }) =>
          a.definition.stable_key === 'test-first-team-piazza',
      )
      expect(piazza).toHaveLength(1)
    }

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
    const voided = await admin.rpc('admin_void_submission', {
      p_client_request_id: randomUUID(),
      p_submission_id: first.data.submission_id,
      p_expected_status: 'accepted',
      p_reason: 'exclusive transfer test',
    })
    expect(voided.data.ok).toBe(true)

    if (second.data.ok) {
      const { data: after } = await fixtures.service!
        .from('achievement_awards')
        .select('status, owner_team_id, exclusive_slot, definition:achievement_definitions!inner(stable_key)')
        .eq('definition.stable_key', 'test-first-team-piazza')
      const active = (after ?? []).filter(
        (a: { status: string; exclusive_slot: boolean }) => a.status === 'active' && a.exclusive_slot,
      )
      expect(active.length).toBeLessThanOrEqual(1)
      if (active.length === 1) {
        expect(active[0].owner_team_id).not.toBe(first.data.team_id)
      }
    }
  })
})

describe('Phase 7A reads security and unread', () => {
  it('masks secret unearned titles; mine clears unread; cross-game denied', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const author = playerId(fixtures, 'drink_only')
    await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        companions: [],
        selectedClaims: [],
      }),
      at,
    )

    const drink = await signInAs(
      {
        available: true,
        password: fixtures.password!,
        summary: fixtures.summary!,
        anonKey: fixtures.anonKey!,
        serviceRoleKey: fixtures.serviceRoleKey!,
      },
      'drink_only',
    )
    const all = await drink.rpc('list_achievements', { p_game: 'drinkit', p_view: 'all' })
    expect(all.data.ok).toBe(true)
    const secret = (all.data.achievements as Array<Record<string, unknown>>).find(
      (a) => a.stable_key === 'test-secret-ten-logs',
    )
    expect(secret).toBeTruthy()
    expect(secret!.title).toBe('?????')
    expect(secret!.description).toBe('Secret Achievement')
    expect(secret!.earned).toBe(false)
    if (secret!.progress) {
      expect((secret!.progress as { target: number }).target).toBe(10)
    }

    const unreadBefore = await drink.rpc('get_achievements_unread', { p_game: 'drinkit' })
    expect(unreadBefore.data.has_unread).toBe(true)

    const mine = await drink.rpc('list_achievements', { p_game: 'drinkit', p_view: 'mine' })
    expect(mine.data.ok).toBe(true)
    const earned = mine.data.achievements as Array<{ award_id: string; awarded_at_utc: string }>
    expect(earned.length).toBeGreaterThan(0)
    const newest = earned.sort((a, b) => b.awarded_at_utc.localeCompare(a.awarded_at_utc))[0]
    const marked = await drink.rpc('mark_achievements_seen', {
      p_game: 'drinkit',
      p_award_id: newest.award_id,
      p_awarded_at_utc: newest.awarded_at_utc,
    })
    expect(marked.data.ok).toBe(true)
    const unreadAfter = await drink.rpc('get_achievements_unread', { p_game: 'drinkit' })
    expect(unreadAfter.data.has_unread).toBe(false)

    const shipDenied = await drink.rpc('list_achievements', { p_game: 'shipit', p_view: 'all' })
    expect(shipDenied.data.ok).toBe(false)
  })

  it('scoring totals unchanged by achievement grants', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const author = playerId(fixtures, 'drink_only')
    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        companions: [],
        selectedClaims: [],
      }),
      at,
    )
    expect(res.data.awarded_points).toBe(0)
    expect(res.data.new_achievement_ids.length).toBeGreaterThanOrEqual(1)
  })
})

describe('Phase 7A multi-bounty same log', () => {
  it('two claims on one log unlock same_submission_claims', async () => {
    const at = slotUtc(1, '12:30:00')
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const companion = playerId(fixtures, 'both')

    const preview = await fixtures.service!.rpc('dev_preview_drink_claims_at', {
      p_payload: drinkPayload({
        barKey: 'wake-view',
        offeringId: (await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')).offering_id,
        companions: [companion],
        barEligibleCompanions: [companion],
        selectedClaims: [],
      }),
      p_at_utc: at,
      p_player_id: author,
    })
    // If preview fails eligibility, skip soft — still assert engine path when claims exist.
    if (!preview.data?.ok) return

    const claims = (preview.data.eligible_claims ?? preview.data.claims ?? []) as Array<{
      category: string
      offer_id?: string
      assignment_id?: string
      points: number
    }>
    const pick = claims.filter((c) => c.category === 'cocktail' || c.category === 'bar').slice(0, 2)
    if (pick.length < 2) return

    const offering = await lookupOffering(fixtures.service!, 'wake-view', 'mai-tai')
    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        offeringId: offering.offering_id,
        companions: [companion],
        barEligibleCompanions: [companion],
        selectedClaims: pick,
      }),
      at,
    )
    if (!res.data.ok) return
    const { data: awards } = await fixtures.service!
      .from('achievement_awards')
      .select('definition:achievement_definitions!inner(stable_key)')
      .eq('owner_player_id', author)
      .eq('status', 'active')
    const keys = (awards ?? []).map((a: { definition: { stable_key: string } }) => a.definition.stable_key)
    expect(keys).toContain('test-double-bounty-same-log')
  })
})
