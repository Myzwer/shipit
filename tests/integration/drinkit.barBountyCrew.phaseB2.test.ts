/**
 * Phase B2 — Bar Bounty crew scoring, preview, claim lifecycle.
 * Synthetic identities only.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertDisposableDevEnvironment } from '../helpers/devEnvironmentGuard'
import {
  activateReadyCatalogAndSchedule,
  DEV_BASE_OFFSET_MIN,
  DEV_DAY1,
  noonDay1Utc,
  slotUtc,
} from '../helpers/bountyFixtures'
import {
  createLocalClient,
  loadLocalFixtures,
  signInAs,
} from '../helpers/localSupabase'
import { disposePlayers } from '../helpers/disposePlayers'
import { ensureSyntheticRoleIdentities } from '../helpers/syntheticRoles'
import type { ClockFixtures } from '../helpers/clockFixtures'
import { drinkPayload, previewAt, submitAt } from '../helpers/drinkitSubmit'
import {
  ensureCrewAssignment,
  pickPlayerInCrewSize,
} from '../helpers/barBountyCrew'

let fixtures: ClockFixtures
let service: SupabaseClient
const createdPlayers: string[] = []

beforeAll(async () => {
  const base = await loadLocalFixtures()
  if (!base.available || !base.summary || !base.serviceRoleKey) {
    throw new Error('B2 tests require local Supabase + identities')
  }
  const withRoles = await ensureSyntheticRoleIdentities(base)
  const svc = createLocalClient(withRoles.summary!.supabase_url, withRoles.serviceRoleKey!)
  const { error } = await svc.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: DEV_DAY1,
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  if (error) throw error
  fixtures = {
    ...withRoles,
    admin: await signInAs(withRoles, 'admin'),
    service: svc,
  }
  service = svc
  await assertDisposableDevEnvironment(fixtures, service)
}, 180000)

beforeEach(async () => {
  await assertDisposableDevEnvironment(fixtures, service)
  const { error } = await service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: DEV_DAY1,
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  await service.from('game_control').update({ status: 'active', finalized_at_utc: null }).eq('game', 'drinkit')
  await activateReadyCatalogAndSchedule(service, 'b2-catalog')
}, 180000)

afterEach(async () => {
  if (createdPlayers.length === 0) return
  await disposePlayers(service, createdPlayers.splice(0))
}, 120000)

describe('Phase B2 point bands', () => {
  it('SQL drinkit_bar_crew_points matches approved table', async () => {
    const cases: Array<[number, number, number]> = [
      [3, 1, 0],
      [3, 2, 20],
      [3, 3, 40],
      [4, 1, 0],
      [4, 2, 20],
      [4, 3, 30],
      [4, 4, 40],
      [4, 5, 40],
    ]
    for (const [size, present, points] of cases) {
      const { data, error } = await service.rpc('drinkit_bar_crew_points', {
        p_crew_size: size,
        p_present_count: present,
      })
      expect(error).toBeNull()
      expect(data).toBe(points)
    }
  })

  it('crew of 3 and 4 award exact bands; non-crew extras ignored', async () => {
    const at = noonDay1Utc()
    const barKey = await featuredBarKey(at)
    // 9 players → three crews of 3
    const roster9 = await synthMany(9, 'c3')
    const ensured3 = await ensureCrewAssignment(service, at, roster9, 'band-3')
    const c3 = pickPlayerInCrewSize(ensured3, 3)
    const outsider3 = roster9.find((id) => !c3.crew.members.some((m) => m.player_id === id))!

    await expectBarPoints(c3.playerId, barKey, at, [], 0, false)
    await expectBarPoints(c3.playerId, barKey, at, [c3.mates[0]!], 20, true)
    await expectBarPoints(c3.playerId, barKey, at, c3.mates, 40, true)
    await expectBarPoints(c3.playerId, barKey, at, [...c3.mates, outsider3], 40, true)
    await expectBarPoints(c3.playerId, barKey, at, [outsider3], 0, false)

    await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: DEV_DAY1,
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
      p_label: 'development-only',
    })
    await activateReadyCatalogAndSchedule(service, 'b2-catalog-4')
    const at2 = noonDay1Utc()
    const barKey2 = await featuredBarKey(at2)
    // 8 players → two crews of 4
    const roster8 = await synthMany(8, 'c4')
    const ensured4 = await ensureCrewAssignment(service, at2, roster8, 'band-4')
    const c4 = pickPlayerInCrewSize(ensured4, 4)
    const outsider4 = roster8.find((id) => !c4.crew.members.some((m) => m.player_id === id))!

    await expectBarPoints(c4.playerId, barKey2, at2, [], 0, false)
    await expectBarPoints(c4.playerId, barKey2, at2, [c4.mates[0]!], 20, true)
    await expectBarPoints(c4.playerId, barKey2, at2, c4.mates.slice(0, 2), 30, true)
    await expectBarPoints(c4.playerId, barKey2, at2, c4.mates, 40, true)
    await expectBarPoints(c4.playerId, barKey2, at2, [...c4.mates, outsider4], 40, true)
  }, 180000)
})

describe('Phase B2 claim lifecycle', () => {
  it('featured bar required; ordinary log ok when ineligible; one claim/day; no upgrade', async () => {
    const at = noonDay1Utc()
    const featured = await featuredBarKey(at)
    const roster = await synthMany(9, 'life')
    const ensured = await ensureCrewAssignment(service, at, roster, 'life-3')
    const { playerId: author, mates } = pickPlayerInCrewSize(ensured, 3)
    const mate = mates[0]!
    const mate2 = mates[1]!

    const wrong = await submitAt(
      service,
      author,
      drinkPayload({
        barKey: featured === 'wake-view-bar' ? 'lido-bar' : 'wake-view-bar',
        mode: 'generic_beer',
        companions: [mate],
        barEligibleCompanions: [mate],
        selectedClaims: [],
      }),
      at,
    )
    expect(wrong.data.ok).toBe(true)
    expect(wrong.data.awarded_points ?? 0).toBe(0)

    const prev = await previewAt(
      service,
      author,
      drinkPayload({
        barKey: featured,
        mode: 'generic_beer',
        companions: [mate],
        barEligibleCompanions: [mate],
      }),
      at,
    )
    expect(prev.data.preview.categories.bar.status).toBe('eligible')
    expect(prev.data.preview.categories.bar.options[0].points).toBe(20)
    const assignmentId = prev.data.preview.categories.bar.options[0].assignment_id

    const first = await submitAt(
      service,
      author,
      drinkPayload({
        barKey: featured,
        mode: 'generic_beer',
        companions: [mate],
        barEligibleCompanions: [mate],
        selectedClaims: [{ category: 'bar', assignment_id: assignmentId }],
      }),
      at,
    )
    expect(first.data.ok).toBe(true)
    expect(first.data.awarded_points).toBe(20)

    const upgrade = await submitAt(
      service,
      author,
      drinkPayload({
        barKey: featured,
        mode: 'generic_beer',
        companions: [mate, mate2],
        barEligibleCompanions: [mate, mate2],
        selectedClaims: [{ category: 'bar', assignment_id: assignmentId }],
      }),
      at,
    )
    expect(upgrade.data.ok).toBe(false)
    expect(String(upgrade.data.code)).toMatch(/ALREADY_CLAIMED|ELIGIBILITY_CHANGED/)

    const { data: claims } = await service
      .from('bounty_claims')
      .select('points, status')
      .eq('player_id', author)
      .eq('category', 'bar')
      .eq('status', 'active')
    expect(claims).toHaveLength(1)
    expect(claims![0]!.points).toBe(20)
  }, 180000)

  it('idempotent replay and concurrent claims award once; next day independent', async () => {
    const at = noonDay1Utc()
    const featured = await featuredBarKey(at)
    // One locked day roster — same-day ensure is generate-once, so reuse these crews.
    const roster = await synthMany(9, 'idemp')
    const ensured = await ensureCrewAssignment(service, at, roster, 'idemp')
    const crewA = pickPlayerInCrewSize(ensured, 3)
    const author = crewA.playerId
    const mate = crewA.mates[0]!
    // Second claimant from a different crew on the same locked day
    const crewB = ensured.crews.find(
      (c) => c.size === 3 && !c.members.some((m) => m.player_id === author),
    )
    expect(crewB).toBeTruthy()
    const author2 = crewB!.members[0]!.player_id
    const mate2 = crewB!.members.map((m) => m.player_id).find((id) => id !== author2)!

    const prev = await previewAt(
      service,
      author,
      drinkPayload({
        barKey: featured,
        mode: 'generic_beer',
        companions: [mate],
        barEligibleCompanions: [mate],
      }),
      at,
    )
    const assignmentId = prev.data.preview.categories.bar.options[0].assignment_id
    const key = randomUUID()
    const payload = drinkPayload({
      barKey: featured,
      mode: 'generic_beer',
      companions: [mate],
      barEligibleCompanions: [mate],
      selectedClaims: [{ category: 'bar', assignment_id: assignmentId }],
      idempotencyKey: key,
    })
    const a = await submitAt(service, author, payload, at)
    const b = await submitAt(service, author, payload, at)
    expect(a.data.ok).toBe(true)
    expect(b.data.ok).toBe(true)
    expect(b.data.idempotent_replay).toBe(true)
    expect(a.data.awarded_points).toBe(20)
    expect(b.data.awarded_points).toBe(20)

    const prev2 = await previewAt(
      service,
      author2,
      drinkPayload({
        barKey: featured,
        mode: 'generic_beer',
        companions: [mate2],
        barEligibleCompanions: [mate2],
      }),
      at,
    )
    expect(prev2.data.preview.categories.bar.status).toBe('eligible')
    const assignment2 = prev2.data.preview.categories.bar.options[0].assignment_id
    const raced = await Promise.all([
      submitAt(
        service,
        author2,
        drinkPayload({
          barKey: featured,
          mode: 'generic_beer',
          companions: [mate2],
          barEligibleCompanions: [mate2],
          selectedClaims: [{ category: 'bar', assignment_id: assignment2 }],
        }),
        at,
      ),
      submitAt(
        service,
        author2,
        drinkPayload({
          barKey: featured,
          mode: 'generic_beer',
          companions: [mate2],
          barEligibleCompanions: [mate2],
          selectedClaims: [{ category: 'bar', assignment_id: assignment2 }],
        }),
        at,
      ),
    ])
    const wins = raced.filter((r) => r.data.ok === true && !r.data.idempotent_replay)
    const claimed = raced.filter((r) => r.data.ok === true)
    expect(claimed.length).toBeGreaterThanOrEqual(1)
    expect(wins.length).toBeLessThanOrEqual(1)
    const { count } = await service
      .from('bounty_claims')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', author2)
      .eq('category', 'bar')
      .eq('status', 'active')
    expect(count).toBe(1)

    const day2 = slotUtc(2, '13:00:00')
    const featured2 = await featuredBarKey(day2)
    const day2Roster = await synthMany(9, 'day2')
    // Keep day-1 author on day-2 roster so their independent claim is testable.
    const day2Ensured = await ensureCrewAssignment(
      service,
      day2,
      [...new Set([author, mate, ...day2Roster])].slice(0, 9),
      'day2',
    )
    const day2Crew = day2Ensured.crews.find((c) =>
      c.members.some((m) => m.player_id === author),
    )
    expect(day2Crew).toBeTruthy()
    const day2Mate =
      day2Crew!.members.map((m) => m.player_id).find((id) => id !== author) ?? mate
    const prevDay2 = await previewAt(
      service,
      author,
      drinkPayload({
        barKey: featured2,
        mode: 'generic_beer',
        companions: [day2Mate],
        barEligibleCompanions: [day2Mate],
      }),
      day2,
    )
    expect(prevDay2.data.preview.categories.bar.status).toBe('eligible')
    const day2Submit = await submitAt(
      service,
      author,
      drinkPayload({
        barKey: featured2,
        mode: 'generic_beer',
        companions: [day2Mate],
        barEligibleCompanions: [day2Mate],
        selectedClaims: [
          {
            category: 'bar',
            assignment_id: prevDay2.data.preview.categories.bar.options[0].assignment_id,
          },
        ],
      }),
      day2,
    )
    expect(day2Submit.data.ok).toBe(true)
    expect(day2Submit.data.awarded_points).toBe(20)
  }, 180000)

  it('Admin Void reverses Bar claim and allows a new same-day claim', async () => {
    const at = noonDay1Utc()
    const featured = await featuredBarKey(at)
    const roster = await synthMany(9, 'void')
    const ensured = await ensureCrewAssignment(service, at, roster, 'void')
    const { playerId: author, mates } = pickPlayerInCrewSize(ensured, 3)
    const mate = mates[0]!
    const prev = await previewAt(
      service,
      author,
      drinkPayload({
        barKey: featured,
        mode: 'generic_beer',
        companions: [mate],
        barEligibleCompanions: [mate],
      }),
      at,
    )
    const assignmentId = prev.data.preview.categories.bar.options[0].assignment_id
    const first = await submitAt(
      service,
      author,
      drinkPayload({
        barKey: featured,
        mode: 'generic_beer',
        companions: [mate],
        barEligibleCompanions: [mate],
        selectedClaims: [{ category: 'bar', assignment_id: assignmentId }],
      }),
      at,
    )
    expect(first.data.ok).toBe(true)
    expect(first.data.awarded_points).toBe(20)
    const submissionId = first.data.submission_id as string

    const admin = await signInAs(fixtures, 'admin')
    const voided = await admin.rpc('admin_void_submission', {
      p_client_request_id: randomUUID(),
      p_submission_id: submissionId,
      p_expected_status: 'accepted',
      p_reason: 'b2-test-void',
    })
    expect(voided.error).toBeNull()
    expect(voided.data.ok).toBe(true)

    const after = await service.rpc('dev_preview_my_bar_bounty_at', {
      p_player_id: author,
      p_at_utc: at,
      p_payload: {
        bar_canonical_key: featured,
        companion_player_ids: [mate],
      },
    })
    expect(after.data.already_claimed).toBe(false)
    expect(after.data.claimable).toBe(true)

    const reclaim = await submitAt(
      service,
      author,
      drinkPayload({
        barKey: featured,
        mode: 'generic_beer',
        companions: [mate],
        barEligibleCompanions: [mate],
        selectedClaims: [{ category: 'bar', assignment_id: assignmentId }],
      }),
      at,
    )
    expect(reclaim.data.ok).toBe(true)
    expect(reclaim.data.awarded_points).toBe(20)
  }, 180000)

  it('pause and Friday finale block new Bar awards', async () => {
    const at = noonDay1Utc()
    const featured = await featuredBarKey(at)
    const roster = await synthMany(9, 'pause')
    const ensured = await ensureCrewAssignment(service, at, roster, 'pause')
    const { playerId: author, mates } = pickPlayerInCrewSize(ensured, 3)
    const mate = mates[0]!
    await service.rpc('dev_set_drinkit_paused', { p_paused: true })
    const paused = await submitAt(
      service,
      author,
      drinkPayload({
        barKey: featured,
        mode: 'generic_beer',
        companions: [mate],
        barEligibleCompanions: [mate],
        selectedClaims: [],
      }),
      at,
    )
    // Submit core rejects paused for new submissions
    expect(paused.data.ok).toBe(false)

    await service.rpc('dev_set_drinkit_paused', { p_paused: false })
    const finaleAt = slotUtc(7, '18:30:00')
    const finale = await previewAt(
      service,
      author,
      drinkPayload({
        barKey: 'promenade-bars',
        mode: 'generic_beer',
        companions: [mate],
        barEligibleCompanions: [mate],
      }),
      finaleAt,
    )
    expect(finale.data.preview.categories.bar.status).not.toBe('eligible')
  }, 120000)
})

describe('Phase B2 preview contract', () => {
  it('preview matches award; non-crew ignored; already-claimed accurate; no mutation', async () => {
    const at = noonDay1Utc()
    const featured = await featuredBarKey(at)
    const roster = await synthMany(9, 'prev')
    const ensured = await ensureCrewAssignment(service, at, roster, 'preview')
    const { playerId: author, mates, size } = pickPlayerInCrewSize(ensured, 3)
    const a = mates[0]!
    const b = mates[1]!
    const outsider = roster.find((id) => !ensured.crews
      .find((c) => c.members.some((m) => m.player_id === author))!
      .members.some((m) => m.player_id === id))!

    const light = await service.rpc('dev_preview_my_bar_bounty_at', {
      p_player_id: author,
      p_at_utc: at,
      p_payload: {
        bar_canonical_key: featured,
        companion_player_ids: [a],
      },
    })
    expect(light.error).toBeNull()
    expect(light.data.ok).toBe(true)
    expect(light.data.awards_points).toBe(false)
    expect(light.data.creates_claim).toBe(false)
    expect(light.data.claimable).toBe(true)
    expect(light.data.points).toBe(20)
    expect(light.data.crew_size).toBe(size)

    const withOutsider = await service.rpc('dev_preview_my_bar_bounty_at', {
      p_player_id: author,
      p_at_utc: at,
      p_payload: {
        bar_canonical_key: featured,
        companion_player_ids: [a, outsider],
      },
    })
    expect(withOutsider.data.points).toBe(20)

    const full = await service.rpc('dev_preview_my_bar_bounty_at', {
      p_player_id: author,
      p_at_utc: at,
      p_payload: {
        bar_canonical_key: featured,
        companion_player_ids: [a, b],
      },
    })
    expect(full.data.points).toBe(40)

    const claim = await submitAt(
      service,
      author,
      drinkPayload({
        barKey: featured,
        mode: 'generic_beer',
        companions: [a],
        barEligibleCompanions: [a],
        selectedClaims: [{ category: 'bar', assignment_id: light.data.assignment_id }],
      }),
      at,
    )
    expect(claim.data.ok).toBe(true)
    expect(claim.data.awarded_points).toBe(20)

    const after = await service.rpc('dev_preview_my_bar_bounty_at', {
      p_player_id: author,
      p_at_utc: at,
      p_payload: {
        bar_canonical_key: featured,
        companion_player_ids: [a, b],
      },
    })
    expect(after.data.already_claimed).toBe(true)
    expect(after.data.claimable).toBe(false)

    const { count } = await service
      .from('bounty_claims')
      .select('*', { count: 'exact', head: true })
      .eq('player_id', author)
      .eq('category', 'bar')
    expect(count).toBe(1)

    const ship = await signInAs(fixtures, 'ship_only')
    const denied = await ship.rpc('preview_my_bar_bounty', {
      p_payload: { bar_canonical_key: featured, companion_player_ids: [] },
    })
    expect(denied.error).toBeTruthy()
  }, 180000)
})

describe('Phase B2 deprecated formula preserved as non-award helper', () => {
  it('drinkit_bar_points remains for historical reference only', async () => {
    const { data } = await service.rpc('drinkit_bar_points', { p_companion_count: 3 })
    expect(data).toBe(55)
  })
})

async function featuredBarKey(at: string) {
  const bar = await service.rpc('dev_get_current_bar_bounty_at', { p_at_utc: at })
  expect(bar.error).toBeNull()
  expect(bar.data.status).toBe('active')
  return bar.data.bar_canonical_key as string
}

async function expectBarPoints(
  author: string,
  barKey: string,
  at: string,
  companions: string[],
  points: number,
  claimable: boolean,
) {
  const prev = await previewAt(
    service,
    author,
    drinkPayload({
      barKey,
      mode: 'generic_beer',
      companions,
      barEligibleCompanions: companions,
    }),
    at,
  )
  const bar = prev.data.preview.categories.bar
  if (claimable) {
    expect(bar.status).toBe('eligible')
    expect(bar.options[0].points).toBe(points)
  } else {
    expect(bar.status).not.toBe('eligible')
    expect(bar.points ?? 0).toBe(0)
  }
  const light = await service.rpc('dev_preview_my_bar_bounty_at', {
    p_player_id: author,
    p_at_utc: at,
    p_payload: { bar_canonical_key: barKey, companion_player_ids: companions },
  })
  expect(light.data.points).toBe(points)
  expect(light.data.claimable).toBe(claimable)
}

async function synth(label: string) {
  const token = randomUUID().slice(0, 8)
  const { data, error } = await service
    .from('players')
    .insert({
      display_name: `B2 Synth ${label} ${token}`,
      login_alias: `b2-synth-${label}-${token}`,
      is_admin: false,
      active: true,
    })
    .select('id')
    .single()
  if (error) throw error
  createdPlayers.push(data.id)
  await service.from('game_memberships').insert({
    player_id: data.id,
    game: 'drinkit',
    enabled: true,
  })
  return data.id as string
}

async function synthMany(count: number, prefix: string) {
  const ids: string[] = []
  for (let i = 0; i < count; i++) {
    ids.push(await synth(`${prefix}-${i}`))
  }
  return ids
}
