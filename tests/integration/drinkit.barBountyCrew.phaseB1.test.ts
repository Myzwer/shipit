/**
 * Phase B1 — daily Bar Bounty crew assignment engine.
 * Synthetic identities only; no private roster names in fixtures.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertDisposableDevEnvironment } from '../helpers/devEnvironmentGuard'
import {
  DEV_BASE_OFFSET_MIN,
  DEV_DAY1,
  noonDay1Utc,
  slotUtc,
} from '../helpers/bountyFixtures'
import { computeNowAlignedCruise } from '../helpers/nowAlignedCruise'
import {
  createLocalClient,
  identity,
  loadLocalFixtures,
  signInAs,
} from '../helpers/localSupabase'
import { disposePlayers } from '../helpers/disposePlayers'
import { ensureSyntheticRoleIdentities } from '../helpers/syntheticRoles'
import type { ClockFixtures } from '../helpers/clockFixtures'
import { barBountyCrewPartitionSizes } from '../../src/lib/bounty/crewPartition'

type CrewPayload = {
  ok: boolean
  status?: string
  code?: string
  message?: string
  cruise_day?: number
  cruise_config_id?: string
  crew_day_id?: string
  roster_size?: number
  generated?: boolean
  idempotent?: boolean
  seed?: string
  crews?: Array<{
    crew_id: string
    crew_index: number
    size: number
    members: Array<{ player_id: string; display_name: string }>
  }>
  issue?: { code: string; roster_size: number } | null
  generated_at_utc?: string
  selected_trial_score?: number
}

let fixtures: ClockFixtures
let service: SupabaseClient
const createdPlayers: string[] = []
const membershipSnapshots: Array<{ player_id: string; enabled: boolean }> = []

beforeAll(async () => {
  const base = await loadLocalFixtures()
  if (!base.available || !base.summary || !base.serviceRoleKey) {
    throw new Error('B1 crew tests require local Supabase + LOCAL_TEST_PASSWORD + identities')
  }
  const withRoles = await ensureSyntheticRoleIdentities(base)
  const svc = createLocalClient(withRoles.summary!.supabase_url, withRoles.serviceRoleKey!)
  const { error: seedError } = await svc.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: DEV_DAY1,
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  if (seedError) throw seedError
  const admin = await signInAs(withRoles, 'admin')
  fixtures = { ...withRoles, admin, service: svc }
  service = svc
  await assertDisposableDevEnvironment(fixtures, service)
}, 180000)

beforeEach(async () => {
  await assertDisposableDevEnvironment(fixtures, service)
  const { error } = await service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  await service.from('game_control').update({ status: 'active', finalized_at_utc: null }).eq('game', 'drinkit')
}, 120000)

afterEach(async () => {
  await restoreDrinkitMemberships()
  if (createdPlayers.length === 0) return
  await disposePlayers(service, createdPlayers.splice(0))
}, 120000)

afterAll(async () => {
  if (!service) return
  const { data } = await service.from('players').select('id').like('login_alias', 'crew-synth-%')
  const ids = (data ?? []).map((r) => r.id as string)
  if (ids.length) await disposePlayers(service, ids)
}, 120000)

describe('Phase B1 partition sizes', () => {
  it('SQL partition helper matches 7–14 table and TS mirror', async () => {
    for (let n = 7; n <= 14; n++) {
      const { data, error } = await service.rpc('dev_bar_bounty_crew_partition_sizes', { p_n: n })
      expect(error).toBeNull()
      expect(data.ok).toBe(true)
      expect(data.sizes).toEqual(barBountyCrewPartitionSizes(n))
    }
    const small = await service.rpc('dev_bar_bounty_crew_partition_sizes', { p_n: 6 })
    expect(small.data.ok).toBe(false)
    expect(small.data.code).toBe('ROSTER_TOO_SMALL')
  })
})

describe('Phase B1 roster partitioning via ensure', () => {
  it('assigns exact membership and 3/4 sizes for n=7..14; excludes Ship It!-only', async () => {
    for (let n = 7; n <= 14; n++) {
      const roster = await makeSynthPlayers(n, 'drinkit')
      const { error: seedErr } = await service.rpc('dev_seed_cruise_clock', {
        p_day1_ship_date: '2099-01-03',
        p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
        p_label: 'development-only',
      })
      expect(seedErr).toBeNull()

      const ensured = await ensureAt(noonDay1Utc(), `part-${n}`, roster)
      expect(ensured.ok).toBe(true)
      expect(ensured.roster_size).toBe(n)
      expect(ensured.crews).toBeTruthy()

      const sizes = (ensured.crews ?? []).map((c) => c.size).sort((a, b) => b - a)
      expect(sizes).toEqual([...barBountyCrewPartitionSizes(n)].sort((a, b) => b - a))

      const ids = (ensured.crews ?? []).flatMap((c) => c.members.map((m) => m.player_id))
      expect(ids).toHaveLength(n)
      expect(new Set(ids).size).toBe(n)
      for (const id of roster) expect(ids).toContain(id)

      for (const crew of ensured.crews ?? []) {
        expect(crew.members).toHaveLength(crew.size)
        expect([3, 4]).toContain(crew.size)
      }

      await service.from('players').delete().in('id', roster)
      createdPlayers.length = 0
    }

    // Live roster path: Ship It!-only membership is never selected.
    // Reseed so we do not reuse the last override day's locked assignment.
    const { error: liveSeedErr } = await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: '2099-01-03',
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
      p_label: 'development-only',
    })
    expect(liveSeedErr).toBeNull()
    await snapshotAndDisableAllDrinkit()
    const drinkRoster = await makeSynthPlayers(7, 'drinkit')
    const shipOnly = await makeSynthPlayer('shiponly', ['shipit'])
    await enableDrinkit(drinkRoster)
    const live = await ensureAt(noonDay1Utc(), 'live-exclude-ship', null)
    expect(live.ok).toBe(true)
    expect(live.generated).toBe(true)
    expect(memberIds(live)).not.toContain(shipOnly)
    expect(live.roster_size).toBe(7)
  }, 180000)
})

describe('Phase B1 assignment lifecycle', () => {
  it('first request generates; repeats are identical; concurrent requests do not duplicate', async () => {
    const roster = await makeSynthPlayers(11, 'drinkit')
    const at = noonDay1Utc()

    const first = await ensureAt(at, 'life-seed-a', roster)
    expect(first.ok).toBe(true)
    expect(first.generated).toBe(true)
    expect(first.cruise_day).toBe(1)

    const second = await ensureAt(at, 'life-seed-DIFFERENT', roster)
    expect(second.ok).toBe(true)
    expect(second.idempotent).toBe(true)
    expect(second.crew_day_id).toBe(first.crew_day_id)
    expect(second.seed).toBe(first.seed)
    expect(canonicalize(second)).toEqual(canonicalize(first))

    const raced = await Promise.all([
      ensureAt(at, 'race-1', roster),
      ensureAt(at, 'race-2', roster),
      ensureAt(at, 'race-3', roster),
    ])
    for (const row of raced) {
      expect(row.ok).toBe(true)
      expect(row.crew_day_id).toBe(first.crew_day_id)
      expect(canonicalize(row)).toEqual(canonicalize(first))
    }

    const { count } = await service
      .from('bar_bounty_crew_days')
      .select('*', { count: 'exact', head: true })
      .eq('day_number', 1)
    expect(count).toBe(1)
  })

  it('Ship Clock day identity; offset change same day keeps assignment; next day is new', async () => {
    const roster = await makeSynthPlayers(8, 'drinkit')
    const day1 = await ensureAt(noonDay1Utc(), 'clock-day1', roster)
    expect(day1.cruise_day).toBe(1)

    // +60 minutes offset: still Saturday 2099-01-03 afternoon → same cruise day.
    const { error } = await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: '2099-01-03',
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN + 60,
      p_label: 'development-only',
    })
    expect(error).toBeNull()
    // Re-seed wipes cruise_config (cascade). Recreate day-1 assignment under new cruise, then
    // prove same-day re-ensure is stable under a mid-flight offset correction without reseed.
    const afterReseed = await ensureAt(
      slotUtc(1, '13:00:00', DEV_BASE_OFFSET_MIN + 60),
      'clock-after-reseed',
      roster,
    )
    expect(afterReseed.ok).toBe(true)
    expect(afterReseed.cruise_day).toBe(1)

    const cruiseId = afterReseed.cruise_config_id!
    const { error: offsetErr } = await service
      .from('cruise_config')
      .update({ base_ship_offset_minutes: DEV_BASE_OFFSET_MIN + 120 })
      .eq('id', cruiseId)
    expect(offsetErr).toBeNull()

    const sameDay = await ensureAt(
      slotUtc(1, '14:00:00', DEV_BASE_OFFSET_MIN + 120),
      'should-not-apply',
      roster,
    )
    expect(sameDay.ok).toBe(true)
    expect(sameDay.idempotent).toBe(true)
    expect(sameDay.crew_day_id).toBe(afterReseed.crew_day_id)
    expect(canonicalize(sameDay)).toEqual(canonicalize(afterReseed))

    const day2 = await ensureAt(slotUtc(2, '13:00:00', DEV_BASE_OFFSET_MIN + 120), 'clock-day2', roster)
    expect(day2.ok).toBe(true)
    expect(day2.generated).toBe(true)
    expect(day2.cruise_day).toBe(2)
    expect(day2.crew_day_id).not.toBe(afterReseed.crew_day_id)
  })
})

describe('Phase B1 roster changes', () => {
  it('mid-day opt-out / join do not reshape; next day reflects roster; <7 errors', async () => {
    await snapshotAndDisableAllDrinkit()
    const roster = await makeSynthPlayers(9, 'drinkit')
    await enableDrinkit(roster)

    const day1 = await ensureAt(noonDay1Utc(), 'roster-d1', null)
    expect(day1.ok).toBe(true)
    expect(day1.roster_size).toBe(9)
    const locked = canonicalize(day1)

    const optedOut = roster[0]!
    await service.from('game_memberships').update({ enabled: false }).eq('player_id', optedOut).eq('game', 'drinkit')
    const afterOptOut = await ensureAt(slotUtc(1, '15:00:00'), 'ignored', null)
    expect(canonicalize(afterOptOut)).toEqual(locked)
    expect(memberIds(afterOptOut)).toContain(optedOut)

    const lateJoin = await makeSynthPlayer('late', ['drinkit'])
    await enableDrinkit([lateJoin])
    const afterJoin = await ensureAt(slotUtc(1, '16:00:00'), 'ignored2', null)
    expect(canonicalize(afterJoin)).toEqual(locked)
    expect(memberIds(afterJoin)).not.toContain(lateJoin)

    const day2 = await ensureAt(slotUtc(2, '13:00:00'), 'roster-d2', null)
    expect(day2.ok).toBe(true)
    expect(day2.generated).toBe(true)
    expect(memberIds(day2)).not.toContain(optedOut)
    expect(memberIds(day2)).toContain(lateJoin)
    expect(day2.roster_size).toBe(9)

    await snapshotAndDisableAllDrinkit()
    const tiny = await makeSynthPlayers(5, 'drinkit')
    await enableDrinkit(tiny)
    const tooSmall = await ensureAt(slotUtc(3, '13:00:00'), 'tiny', null)
    expect(tooSmall.ok).toBe(false)
    expect(tooSmall.code).toBe('ROSTER_TOO_SMALL')
    expect(tooSmall.roster_size).toBe(5)
  })
})

describe('Phase B1 randomness and repeat avoidance', () => {
  it('different seeds vary groupings; multi-day history disfavors repeats vs unweighted baseline', async () => {
    const roster = await makeSynthPlayers(11, 'drinkit')
    const a = await ensureAt(noonDay1Utc(), 'rand-a', roster)
    await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: '2099-01-03',
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
      p_label: 'development-only',
    })
    const b = await ensureAt(noonDay1Utc(), 'rand-b', roster)
    expect(a.ok && b.ok).toBe(true)
    // Extremely unlikely identical under independent seeds; allow rare collision retry once.
    if (canonicalize(a) === canonicalize(b)) {
      await service.rpc('dev_seed_cruise_clock', {
        p_day1_ship_date: '2099-01-03',
        p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
        p_label: 'development-only',
      })
      const c = await ensureAt(noonDay1Utc(), 'rand-c-retry', roster)
      expect(canonicalize(c)).not.toEqual(canonicalize(a))
    } else {
      expect(canonicalize(a)).not.toEqual(canonicalize(b))
    }

    await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: '2099-01-03',
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
      p_label: 'development-only',
    })
    const pairTotals: number[] = []
    for (let day = 1; day <= 7; day++) {
      const row = await ensureAt(slotUtc(day, '13:00:00'), `cruise-${day}`, roster)
      expect(row.ok).toBe(true)
      expect(row.cruise_day).toBe(day)
    }
    const { data: members, error } = await service
      .from('bar_bounty_crew_members')
      .select('crew_id, player_id, day_number')
    expect(error).toBeNull()

    const byCrew = new Map<string, string[]>()
    for (const row of members ?? []) {
      const list = byCrew.get(row.crew_id as string) ?? []
      list.push(row.player_id as string)
      byCrew.set(row.crew_id as string, list)
    }
    const pairCounts = new Map<string, number>()
    for (const crew of byCrew.values()) {
      for (let i = 0; i < crew.length; i++) {
        for (let j = i + 1; j < crew.length; j++) {
          const key = [crew[i]!, crew[j]!].sort().join('|')
          pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1)
        }
      }
    }
    const weightedRepeatMass = [...pairCounts.values()].reduce((s, c) => s + Math.max(0, c - 1), 0)

    // Unweighted baseline: 48 independent 7-day shuffles using the same partition sizes.
    const sizes = barBountyCrewPartitionSizes(11)
    const baselineMasses: number[] = []
    for (let sim = 0; sim < 40; sim++) {
      const counts = new Map<string, number>()
      for (let day = 0; day < 7; day++) {
        const order = shuffle([...roster], `base-${sim}-${day}`)
        let cursor = 0
        for (const size of sizes) {
          const crew = order.slice(cursor, cursor + size)
          for (let i = 0; i < crew.length; i++) {
            for (let j = i + 1; j < crew.length; j++) {
              const key = [crew[i]!, crew[j]!].sort().join('|')
              counts.set(key, (counts.get(key) ?? 0) + 1)
            }
          }
          cursor += size
        }
      }
      baselineMasses.push([...counts.values()].reduce((s, c) => s + Math.max(0, c - 1), 0))
    }
    baselineMasses.sort((x, y) => x - y)
    const baselineMedian = baselineMasses[Math.floor(baselineMasses.length / 2)]!
    // Weighted engine should not land clearly worse than the unweighted median.
    expect(weightedRepeatMass).toBeLessThanOrEqual(baselineMedian)
    pairTotals.push(weightedRepeatMass)
    expect(pairTotals[0]).toBeGreaterThanOrEqual(0)
  }, 180000)
})

describe('Phase B1 security and visibility', () => {
  it('player sees own crew; admin sees all; unauthorized denied; no client day/roster args', async () => {
    await snapshotAndDisableAllDrinkit()
    const drinkOnlyId = identity(fixtures.summary!, 'drink_only').player_id
    const extras = await makeSynthPlayers(6, 'drinkit')
    const roster = [drinkOnlyId, ...extras]
    await enableDrinkit(roster)

    await alignNowToCruiseDay(1, 13)
    await snapshotAndDisableAllDrinkit()
    await enableDrinkit(roster)

    const player = await signInAs(fixtures, 'drink_only')
    const mine = await player.rpc('get_my_bar_bounty_crew')
    expect(mine.error).toBeNull()
    expect(mine.data.ok).toBe(true)
    expect(mine.data.status).toBe('assigned')
    expect(mine.data.crew_size).toBeGreaterThanOrEqual(3)
    const self = (mine.data.members as Array<{ player_id: string; is_self: boolean }>).find(
      (m) => m.is_self,
    )
    expect(self?.player_id).toBe(drinkOnlyId)

    const ship = await signInAs(fixtures, 'ship_only')
    const denied = await ship.rpc('get_my_bar_bounty_crew')
    expect(denied.error).toBeTruthy()
    expect(denied.error?.message ?? '').toMatch(/DRINKIT_REQUIRED/i)

    const noGames = await signInAs(fixtures, 'no_games')
    const denied2 = await noGames.rpc('get_my_bar_bounty_crew')
    expect(denied2.error).toBeTruthy()

    const admin = await signInAs(fixtures, 'admin')
    const all = await admin.rpc('admin_list_bar_bounty_crews')
    expect(all.error).toBeNull()
    expect(all.data.ok).toBe(true)
    expect(all.data.crews.length).toBeGreaterThanOrEqual(2)
    const allMembers = (all.data.crews as CrewPayload['crews'])!.flatMap((c) =>
      c.members.map((m) => m.player_id),
    )
    expect(allMembers).toContain(drinkOnlyId)
    expect(allMembers).toHaveLength(7)

    // Direct table reads blocked for players.
    const leaked = await player.from('bar_bounty_crew_members').select('*')
    expect(leaked.data ?? []).toEqual([])

    // Player/admin crew RPCs take no args — PostgREST rejects forged generation controls.
    const forged = await player.rpc('get_my_bar_bounty_crew', {
      p_at_utc: noonDay1Utc(),
      p_roster_override: roster,
    } as never)
    expect(forged.error).toBeTruthy()

    // Admin issue path when roster collapses below 7 on a fresh day.
    await alignNowToCruiseDay(2, 13)
    await snapshotAndDisableAllDrinkit()
    await enableDrinkit(roster.slice(0, 4))
    const issue = await admin.rpc('admin_list_bar_bounty_crews')
    expect(issue.error).toBeNull()
    expect(issue.data.ok).toBe(false)
    expect(issue.data.code).toBe('ROSTER_TOO_SMALL')
    expect(issue.data.issue?.code).toBe('ROSTER_TOO_SMALL')
  }, 180000)
})

describe('Phase B1 historical bar helper', () => {
  it('deprecated drinkit_bar_points helper remains available for ledger history', async () => {
    const { data, error } = await service.rpc('drinkit_bar_points', { p_companion_count: 3 })
    expect(error).toBeNull()
    expect(data).toBe(55)
    const solo = await service.rpc('drinkit_bar_points', { p_companion_count: 0 })
    expect(solo.error).toBeNull()
    expect(solo.data).toBe(25)
    const capped = await service.rpc('drinkit_bar_points', { p_companion_count: 20 })
    expect(capped.error).toBeNull()
    expect(capped.data).toBe(95)
  })
})

async function alignNowToCruiseDay(cruiseDay: number, targetHour: number) {
  const aligned = computeNowAlignedCruise({ cruiseDay, targetHour, targetMinute: 30 })
  const { error } = await service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: aligned.day1,
    p_base_offset_minutes: aligned.offsetMinutes,
    p_label: 'development-only',
  })
  if (error) throw error
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  await service.from('game_control').update({ status: 'active', finalized_at_utc: null }).eq('game', 'drinkit')
}

async function ensureAt(at: string, seed: string, roster: string[] | null): Promise<CrewPayload> {
  const args: Record<string, unknown> = { p_at_utc: at, p_seed: seed }
  if (roster) args.p_roster_override = roster
  const { data, error } = await service.rpc('dev_ensure_bar_bounty_crews_at', args)
  if (error) throw error
  return data as CrewPayload
}

async function makeSynthPlayers(n: number, game: 'drinkit' | 'shipit') {
  const ids: string[] = []
  for (let i = 0; i < n; i++) ids.push(await makeSynthPlayer(`n${n}-${i}`, [game]))
  return ids
}

async function makeSynthPlayer(label: string, games: Array<'drinkit' | 'shipit'>) {
  const token = randomUUID().slice(0, 8)
  const { data, error } = await service
    .from('players')
    .insert({
      display_name: `Crew Synth ${label} ${token}`,
      login_alias: `crew-synth-${label}-${token}`,
      is_admin: false,
      active: true,
    })
    .select('id')
    .single()
  if (error) throw error
  const id = data.id as string
  createdPlayers.push(id)
  if (games.includes('shipit')) {
    const { data: team, error: teamErr } = await service
      .from('teams')
      .insert({ name: `Crew Synth Team ${token}`, active: true })
      .select('id')
      .single()
    if (teamErr) throw teamErr
    const { error: tmErr } = await service.from('team_memberships').insert({
      player_id: id,
      team_id: team.id,
    })
    if (tmErr) throw tmErr
  }
  const { error: mErr } = await service.from('game_memberships').insert(
    games.map((game) => ({ player_id: id, game, enabled: true })),
  )
  if (mErr) throw mErr
  return id
}

async function snapshotAndDisableAllDrinkit() {
  if (membershipSnapshots.length === 0) {
    const { data, error } = await service
      .from('game_memberships')
      .select('player_id, enabled')
      .eq('game', 'drinkit')
    if (error) throw error
    for (const row of data ?? []) {
      membershipSnapshots.push({
        player_id: row.player_id as string,
        enabled: row.enabled as boolean,
      })
    }
  }
  await service.from('game_memberships').update({ enabled: false }).eq('game', 'drinkit').eq('enabled', true)
}

async function restoreDrinkitMemberships() {
  if (membershipSnapshots.length === 0) return
  for (const row of membershipSnapshots) {
    await service
      .from('game_memberships')
      .update({ enabled: row.enabled })
      .eq('player_id', row.player_id)
      .eq('game', 'drinkit')
  }
  membershipSnapshots.length = 0
}

async function enableDrinkit(playerIds: string[]) {
  for (const playerId of playerIds) {
    const { data } = await service
      .from('game_memberships')
      .select('player_id')
      .eq('player_id', playerId)
      .eq('game', 'drinkit')
      .maybeSingle()
    if (data) {
      await service
        .from('game_memberships')
        .update({ enabled: true })
        .eq('player_id', playerId)
        .eq('game', 'drinkit')
    } else {
      await service.from('game_memberships').insert({
        player_id: playerId,
        game: 'drinkit',
        enabled: true,
      })
    }
  }
}

function memberIds(payload: CrewPayload) {
  return (payload.crews ?? []).flatMap((c) => c.members.map((m) => m.player_id)).sort()
}

function canonicalize(payload: CrewPayload) {
  const crews = (payload.crews ?? [])
    .map((c) => ({
      size: c.size,
      members: c.members.map((m) => m.player_id).sort(),
    }))
    .sort((a, b) => a.members.join(',').localeCompare(b.members.join(',')))
  return JSON.stringify({ cruise_day: payload.cruise_day, crews })
}

function shuffle<T>(items: T[], seed: string): T[] {
  const out = [...items]
  let counter = 0
  for (let i = out.length - 1; i > 0; i--) {
    counter += 1
    const r = hashUnit(`${seed}:${counter}`)
    const j = Math.floor(r * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

function hashUnit(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 4294967296
}
