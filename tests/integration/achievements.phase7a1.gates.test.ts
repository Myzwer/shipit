/**
 * Phase 7A.1 — exclusive First ordering, historical Ship Time, dev RPC lockdown.
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
  playerId,
  submitAt,
} from '../helpers/drinkitSubmit'
import { createLocalClient, signInAs } from '../helpers/localSupabase'
import type { ClockFixtures } from '../helpers/clockFixtures'

const TINY_JPEG = readFileSync(join(process.cwd(), 'tests/fixtures/tiny.jpg'))

let fixtures: ClockFixtures
let piazzaId: string
let moviesId: string
let domeId: string

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
  await clearTestAchievements(fixtures.service!)
  const { data: ch } = await fixtures.service!
    .from('scavenger_challenges')
    .select('id, canonical_key, category')
    .in('canonical_key', ['the-piazza-grandeur', 'movies-under-the-stars', 'under-the-dome'])
  const byKey = new Map((ch ?? []).map((r) => [r.canonical_key, r]))
  piazzaId = byKey.get('the-piazza-grandeur')!.id
  moviesId = byKey.get('movies-under-the-stars')!.id
  domeId = byKey.get('under-the-dome')!.id
})

beforeEach(async () => {
  await clearTestAchievements(fixtures.service!)
  await fixtures.service!.rpc('dev_reset_scavenger_test_data')
  const { error } = await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
  await activateReadyCatalogAndSchedule(fixtures.service!, `phase7a1-${randomUUID().slice(0, 8)}`)
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

async function submitScavenger(playerKey: string, challengeId: string, at: string) {
  const client = await signInAs(
    {
      available: true,
      password: fixtures.password!,
      summary: fixtures.summary!,
      anonKey: fixtures.anonKey!,
      serviceRoleKey: fixtures.serviceRoleKey!,
    },
    playerKey,
  )
  const photoId = await stageScavengerPhoto(client)
  const res = await fixtures.service!.rpc('dev_submit_scavenger_at', {
    p_player_id: playerId(fixtures, playerKey),
    p_payload: {
      idempotency_key: randomUUID(),
      challenge_id: challengeId,
      photo_id: photoId,
      caption: null,
    },
    p_at_utc: at,
  })
  return res
}

describe('Gate 1 — exclusive First qualifying-event order', () => {
  it('reproduces defect class: unrelated early evidence must not beat later First', async () => {
    // Seed exclusive exact-challenge def (already in catalog: test-first-team-piazza)
    const t9 = slotUtc(1, '09:00:00')
    const t10 = slotUtc(1, '10:00:00')
    const t1030 = slotUtc(1, '10:30:00')
    const t11 = slotUtc(1, '11:00:00')

    // Team Alpha (both): unrelated challenge at 9:00
    const aUnrelated = await submitScavenger('both', moviesId, t9)
    expect(aUnrelated.data.ok).toBe(true)

    // Team Bravo (admin): qualifies for Piazza at 10:00 → should win First
    const bWin = await submitScavenger('admin', piazzaId, t10)
    expect(bWin.data.ok).toBe(true)
    expect(bWin.data.new_achievement_ids.length).toBeGreaterThanOrEqual(1)

    // Create Team Charlie + player for 10:30 qualification
    const charliePlayerId = randomUUID()
    const { data: charlieTeam, error: teamErr } = await fixtures.service!
      .from('teams')
      .insert({ name: `Charlie-${randomUUID().slice(0, 6)}`, active: true })
      .select('id')
      .single()
    expect(teamErr).toBeNull()
    const charlieAlias = `charlie-${randomUUID().slice(0, 8)}@example.test`
    const { error: playerErr } = await fixtures.service!.from('players').insert({
      id: charliePlayerId,
      display_name: `Demo Charlie ${randomUUID().slice(0, 6)}`,
      login_alias: charlieAlias,
      active: true,
      is_admin: false,
    })
    expect(playerErr).toBeNull()
    const { error: tmErr } = await fixtures.service!.from('team_memberships').insert({
      player_id: charliePlayerId,
      team_id: charlieTeam!.id,
    })
    expect(tmErr).toBeNull()
    const { error: gmErr } = await fixtures.service!.from('game_memberships').insert({
      player_id: charliePlayerId,
      game: 'shipit',
      enabled: true,
    })
    expect(gmErr).toBeNull()

    // Stage a photo owned by Charlie with a path that satisfies photos_path_owned.
    const photoC = randomUUID()
    const storagePath = `${charliePlayerId}/shipit/${photoC}.jpg`
    const { error: photoInsErr } = await fixtures.service!.from('photos').insert({
      id: photoC,
      owner_player_id: charliePlayerId,
      game: 'shipit',
      purpose: 'scavenger',
      status: 'staged',
      bucket_id: 'game-photos',
      storage_path: storagePath,
      mime_type: 'image/jpeg',
      byte_size: TINY_JPEG.length,
      width: 32,
      height: 24,
      original_filename: 't.jpg',
      staged_at_utc: new Date().toISOString(),
    })
    expect(photoInsErr).toBeNull()
    const up = await fixtures.service!.storage.from('game-photos').upload(storagePath, TINY_JPEG, {
      contentType: 'image/jpeg',
      upsert: true,
    })
    expect(up.error).toBeNull()

    const cQual = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: charliePlayerId,
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: piazzaId,
        photo_id: photoC,
        caption: null,
      },
      p_at_utc: t1030,
    })
    expect(cQual.error).toBeNull()
    expect(cQual.data?.ok, JSON.stringify(cQual.data)).toBe(true)

    // Team Alpha qualifies at 11:00
    const aLate = await submitScavenger('both', piazzaId, t11)
    expect(aLate.data.ok).toBe(true)

    const { data: winnerBefore } = await fixtures.service!
      .from('achievement_awards')
      .select('owner_team_id, source_submission_id, definition:achievement_definitions!inner(stable_key)')
      .eq('status', 'active')
      .eq('exclusive_slot', true)
    const piazzaWin = (winnerBefore ?? []).find(
      (a: { definition: { stable_key: string } }) => a.definition.stable_key === 'test-first-team-piazza',
    )
    expect(piazzaWin?.owner_team_id).toBe(bWin.data.team_id)
    expect(piazzaWin?.source_submission_id).toBe(bWin.data.submission_id)
    // Must NOT be Alpha's 9:00 unrelated submission
    expect(piazzaWin?.source_submission_id).not.toBe(aUnrelated.data.submission_id)

    // Void Bravo's qualifying source → Charlie (10:30) wins, not Alpha (earliest any-evidence at 9:00)
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
      p_submission_id: bWin.data.submission_id,
      p_expected_status: 'accepted',
      p_reason: '7a1 exclusive transfer',
    })
    expect(voided.data.ok).toBe(true)

    const { data: winnerAfter } = await fixtures.service!
      .from('achievement_awards')
      .select('owner_team_id, source_submission_id, status, exclusive_slot, definition:achievement_definitions!inner(stable_key)')
    const active = (winnerAfter ?? []).filter(
      (a: { status: string; exclusive_slot: boolean; definition: { stable_key: string } }) =>
        a.status === 'active' &&
        a.exclusive_slot &&
        a.definition.stable_key === 'test-first-team-piazza',
    )
    expect(active).toHaveLength(1)
    expect(active[0].owner_team_id).toBe(charlieTeam!.id)
    expect(active[0].source_submission_id).toBe(cQual.data.submission_id)
    expect(active[0].owner_team_id).not.toBe(aUnrelated.data.team_id)
  })

  it('collection First (one-per-category) links to completing submission', async () => {
    // Enable exclusive category-completion First
    await fixtures.service!.from('achievement_definitions').insert({
      stable_key: 'test-first-one-per-category',
      game: 'shipit',
      owner_type: 'team',
      group_key: 'firsts',
      title: 'Test First Category Spread',
      display_description: 'First team with one challenge in every category.',
      secret: false,
      exclusive: true,
      enabled: true,
      test_only: true,
      condition_type: 'category_completion',
      condition_config: { mode: 'one_per_category' },
    })

    // Get one challenge per category
    const { data: cats } = await fixtures.service!
      .from('scavenger_challenges')
      .select('id, category, canonical_key')
      .eq('enabled', true)
    const byCat = new Map<string, string>()
    for (const row of cats ?? []) {
      if (!byCat.has(row.category)) byCat.set(row.category, row.id)
    }
    expect(byCat.size).toBeGreaterThanOrEqual(5)
    const challengeIds = [...byCat.values()].slice(0, 5)

    let last: { data: { ok: boolean; submission_id: string; new_achievement_ids: string[] } } | null =
      null
    let hour = 12
    for (const cid of challengeIds) {
      const at = slotUtc(1, `${hour.toString().padStart(2, '0')}:00:00`)
      last = (await submitScavenger('both', cid, at)) as typeof last
      expect(last!.data.ok).toBe(true)
      hour += 1
    }

    const { data: award } = await fixtures.service!
      .from('achievement_awards')
      .select('source_submission_id, definition:achievement_definitions!inner(stable_key)')
      .eq('status', 'active')
      .eq('exclusive_slot', true)
    const hit = (award ?? []).find(
      (a: { definition: { stable_key: string } }) =>
        a.definition.stable_key === 'test-first-one-per-category',
    )
    expect(hit).toBeTruthy()
    // Qualifying evidence is the submission that completed the set (last), not the first unrelated
    expect(hit!.source_submission_id).toBe(last!.data.submission_id)
  })

  it('concurrent exclusive contenders: only one active winner', async () => {
    const at = slotUtc(1, '14:00:00')
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
    const photoA = await stageScavengerPhoto(both)
    const photoB = await stageScavengerPhoto(admin)

    const serviceA = createLocalClient(fixtures.summary!.supabase_url, fixtures.serviceRoleKey!)
    const serviceB = createLocalClient(fixtures.summary!.supabase_url, fixtures.serviceRoleKey!)

    const [r1, r2] = await Promise.all([
      serviceA.rpc('dev_submit_scavenger_at', {
        p_player_id: playerId(fixtures, 'both'),
        p_payload: {
          idempotency_key: randomUUID(),
          challenge_id: piazzaId,
          photo_id: photoA,
          caption: null,
        },
        p_at_utc: at,
      }),
      serviceB.rpc('dev_submit_scavenger_at', {
        p_player_id: playerId(fixtures, 'admin'),
        p_payload: {
          idempotency_key: randomUUID(),
          challenge_id: piazzaId,
          photo_id: photoB,
          caption: null,
        },
        p_at_utc: at,
      }),
    ])

    const accepted = [r1, r2].filter((r) => r.data?.ok)
    expect(accepted.length).toBeGreaterThanOrEqual(1)

    const { data: winners } = await fixtures.service!
      .from('achievement_awards')
      .select('id, definition:achievement_definitions!inner(stable_key)')
      .eq('status', 'active')
      .eq('exclusive_slot', true)
    const piazza = (winners ?? []).filter(
      (a: { definition: { stable_key: string } }) => a.definition.stable_key === 'test-first-team-piazza',
    )
    expect(piazza).toHaveLength(1)
  })
})

describe('Gate 2 — historical Ship Time', () => {
  it('before/after scheduled and manual clock changes; near 10am / 11pm', async () => {
    await fixtures.service!.from('achievement_definitions').insert({
      stable_key: 'test-before-10',
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'other',
      title: 'Test Early Bird',
      display_description: 'Log before 10:00 Ship Time.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'ship_time_window',
      condition_config: { before_hour: 10, event: 'drink_log' },
    })
    await fixtures.service!.from('achievement_definitions').insert({
      stable_key: 'test-after-22',
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'other',
      title: 'Test Night Owl',
      display_description: 'Log after 22:00 Ship Time.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'ship_time_window',
      condition_config: { after_hour: 22, event: 'drink_log' },
    })

    const author = playerId(fixtures, 'drink_only')
    // 09:30 ship-local day 1 with base offset — should unlock before-10
    const early = slotUtc(1, '09:30:00')
    await exposeCurrentSlots(fixtures.service!, early)
    const earlyRes = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        mode: 'generic_beer',
        companions: [],
        selectedClaims: [],
      }),
      early,
    )
    expect(earlyRes.data.ok).toBe(true)

    // Apply +60 manual delta effective after early log
    const afterEarly = new Date(new Date(early).getTime() + 60_000).toISOString()
    const manual = await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: 60,
      p_client_request_id: randomUUID(),
      p_at_utc: afterEarly,
    })
    expect(manual.error).toBeNull()
    expect(manual.data?.after?.offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 60)

    // Later log at 22:30 ship-local under NEW offset should still use historical offset per event.
    // Compute UTC for 22:30 ship-local with the NEW offset (base+60).
    const lateNewOffset = slotUtc(1, '22:30:00', DEV_BASE_OFFSET_MIN + 60)
    await exposeCurrentSlots(fixtures.service!, lateNewOffset)
    const lateRes = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        mode: 'generic_wine',
        companions: [],
        selectedClaims: [],
        idempotencyKey: randomUUID(),
      }),
      lateNewOffset,
    )
    expect(lateRes.data.ok).toBe(true)

    const { data: awards } = await fixtures.service!
      .from('achievement_awards')
      .select('definition:achievement_definitions!inner(stable_key)')
      .eq('owner_player_id', author)
      .eq('status', 'active')
    const keys = (awards ?? []).map((a: { definition: { stable_key: string } }) => a.definition.stable_key)
    expect(keys).toContain('test-before-10')
    expect(keys).toContain('test-after-22')

    // Early award must remain: later +60 must not reclassify 09:30 as after 10 under new offset
    // (09:30 + 60min wall would look like 10:30 if wrongly re-evaluated with current offset)
    expect(keys).toContain('test-before-10')
  })

  it('first cruise-day condition uses authoritative ship_day', async () => {
    await fixtures.service!.from('achievement_definitions').insert({
      stable_key: 'test-first-day',
      game: 'drinkit',
      owner_type: 'player',
      group_key: 'other',
      title: 'Test Day One',
      display_description: 'Log on cruise day 1.',
      secret: false,
      exclusive: false,
      enabled: true,
      test_only: true,
      condition_type: 'cruise_day',
      condition_config: { which: 'first', event: 'drink_log' },
    })
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const author = playerId(fixtures, 'drink_only')
    const res = await submitAt(
      fixtures.service!,
      author,
      drinkPayload({
        barKey: 'wake-view',
        mode: 'generic_beer',
        companions: [],
        selectedClaims: [],
      }),
      at,
    )
    expect(res.data.ok).toBe(true)
    const { data: awards } = await fixtures.service!
      .from('achievement_awards')
      .select('definition:achievement_definitions!inner(stable_key)')
      .eq('owner_player_id', author)
      .eq('status', 'active')
    const keys = (awards ?? []).map((a: { definition: { stable_key: string } }) => a.definition.stable_key)
    expect(keys).toContain('test-first-day')
  })
})

describe('Gate 3 — development submission privileges', () => {
  it('authenticated and anonymous clients cannot invoke scavenger/drink/daily dev submits', async () => {
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
    const anon = createLocalClient(fixtures.summary!.supabase_url, fixtures.anonKey!)

    const deniedScavenger = await drink.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_payload: { idempotency_key: randomUUID() },
      p_at_utc: noonDay1Utc(),
    })
    expect(deniedScavenger.error).toBeTruthy()

    const deniedDrink = await drink.rpc('dev_submit_drink_at', {
      p_payload: drinkPayload({
        barKey: 'wake-view',
        mode: 'generic_beer',
        companions: [],
        selectedClaims: [],
      }),
      p_at_utc: noonDay1Utc(),
      p_player_id: playerId(fixtures, 'drink_only'),
    })
    expect(deniedDrink.error).toBeTruthy()

    const deniedDaily = await drink.rpc('dev_submit_daily_at', {
      p_player_id: playerId(fixtures, 'drink_only'),
      p_payload: { idempotency_key: randomUUID() },
      p_at_utc: noonDay1Utc(),
    })
    expect(deniedDaily.error).toBeTruthy()

    const anonTry = await anon.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_payload: { idempotency_key: randomUUID() },
      p_at_utc: noonDay1Utc(),
    })
    expect(anonTry.error).toBeTruthy()
  })

  it('service_role still succeeds for local fixtures', async () => {
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
    const photo = await stageScavengerPhoto(both)
    const ok = await fixtures.service!.rpc('dev_submit_scavenger_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_payload: {
        idempotency_key: randomUUID(),
        challenge_id: domeId,
        photo_id: photo,
        caption: null,
      },
      p_at_utc: noonDay1Utc(),
    })
    expect(ok.error).toBeNull()
    expect(ok.data.ok).toBe(true)
  })
})
