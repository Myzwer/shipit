/**
 * PC1 — Ship It! final ranking: equal totals break by first server-accepted
 * score_reached_at (max active completed_at_utc). Live home + Wrapped agree.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  DEV_BASE_OFFSET_MIN,
  loadBountyFixtures,
  noonDay1Utc,
  slotUtc,
} from '../helpers/bountyFixtures'
import { playerId } from '../helpers/drinkitSubmit'
import { assertDisposableDevEnvironment } from '../helpers/devEnvironmentGuard'
import type { ClockFixtures } from '../helpers/clockFixtures'

let fixtures: ClockFixtures
let cruiseId: string

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
  await assertDisposableDevEnvironment(fixtures, fixtures.service!)
})

beforeEach(async () => {
  await fixtures.service!.from('scavenger_completions').delete().gte('created_at', '1970-01-01')
  await fixtures.service!.from('submissions').delete().eq('kind', 'scavenger_dev_fixture')

  const { error } = await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()

  const { data: cruise } = await fixtures.service!
    .from('cruise_config')
    .select('id')
    .eq('is_active', true)
    .single()
  cruiseId = cruise!.id as string
})

async function teamIdFor(key: 'ship_only' | 'both' | 'admin') {
  const pid = playerId(fixtures, key)
  const { data } = await fixtures.service!
    .from('team_memberships')
    .select('team_id')
    .eq('player_id', pid)
    .is('active_to', null)
    .single()
  return data!.team_id as string
}

async function fixtureComplete(
  teamId: string,
  authorKey: 'ship_only' | 'both' | 'admin',
  challengeKey: string,
  atUtc: string,
) {
  const res = await fixtures.service!.rpc('dev_fixture_scavenger_completion', {
    p_team_id: teamId,
    p_challenge_canonical_key: challengeKey,
    p_submitting_player_id: playerId(fixtures, authorKey),
    p_completed_at_utc: atUtc,
  })
  expect(res.error).toBeNull()
  expect(res.data.ok).toBe(true)
  return res.data as { ok: boolean; completion_id?: string; points: number }
}

type BoardRow = {
  team_id: string
  team_name: string
  points: number
  rank: number
  completed: number
}

async function homeBoard(atUtc: string, viewer: 'both' | 'admin' = 'both'): Promise<BoardRow[]> {
  const home = await fixtures.service!.rpc('dev_get_shipit_home_at', {
    p_at_utc: atUtc,
    p_player_id: playerId(fixtures, viewer),
  })
  expect(home.data.ok).toBe(true)
  return home.data.leaderboard as BoardRow[]
}

describe('PC1 Ship It! score-reached ranking', () => {
  it('unequal finals: higher points ranks above', async () => {
    const at = noonDay1Utc()
    const alpha = await teamIdFor('both')
    const bravo = await teamIdFor('admin')

    await fixtureComplete(alpha, 'both', 'the-piazza-grandeur', slotUtc(1, '12:00:00'))
    await fixtureComplete(bravo, 'admin', 'movies-under-the-stars', slotUtc(1, '12:05:00'))
    await fixtureComplete(bravo, 'admin', 'international-cafe', slotUtc(1, '12:10:00'))

    const board = await homeBoard(at)
    const alphaRow = board.find((r) => r.team_id === alpha)!
    const bravoRow = board.find((r) => r.team_id === bravo)!
    expect(bravoRow.points).toBeGreaterThan(alphaRow.points)
    expect(bravoRow.rank).toBe(1)
    expect(alphaRow.rank).toBe(2)
  })

  it('equal finals: earlier score_reached_at gets unique higher rank', async () => {
    const at = noonDay1Utc()
    const alpha = await teamIdFor('both')
    const bravo = await teamIdFor('admin')

    // Both end at 100; Alpha reaches 100 first.
    await fixtureComplete(alpha, 'both', 'the-piazza-grandeur', slotUtc(1, '12:00:00'))
    await fixtureComplete(bravo, 'admin', 'movies-under-the-stars', slotUtc(1, '12:30:00'))

    const board = await homeBoard(at)
    const tied = board.filter((r) => r.points === 100)
    expect(tied).toHaveLength(2)
    expect(tied[0].team_id).toBe(alpha)
    expect(tied[0].rank).toBe(1)
    expect(tied[1].team_id).toBe(bravo)
    expect(tied[1].rank).toBe(2)
  })

  it('equal totals reached via different paths: earlier final acceptance wins', async () => {
    const at = noonDay1Utc()
    const alpha = await teamIdFor('both')
    const bravo = await teamIdFor('admin')

    // Alpha: two 100-pt classics → 200, finished at 12:20
    await fixtureComplete(alpha, 'both', 'the-piazza-grandeur', slotUtc(1, '12:00:00'))
    await fixtureComplete(alpha, 'both', 'movies-under-the-stars', slotUtc(1, '12:20:00'))
    // Bravo: one 200-pt food → 200, finished at 12:40
    await fixtureComplete(bravo, 'admin', 'international-cafe', slotUtc(1, '12:40:00'))

    const board = await homeBoard(at)
    const alphaRow = board.find((r) => r.team_id === alpha)!
    const bravoRow = board.find((r) => r.team_id === bravo)!
    expect(alphaRow.points).toBe(200)
    expect(bravoRow.points).toBe(200)
    expect(alphaRow.rank).toBe(1)
    expect(bravoRow.rank).toBe(2)
  })

  it('first team to finish the full catalog wins an equal-maximum tie', async () => {
    const at = noonDay1Utc()
    const alpha = await teamIdFor('both')
    const bravo = await teamIdFor('admin')

    const { data: challenges } = await fixtures.service!
      .from('scavenger_challenges')
      .select('canonical_key')
      .eq('enabled', true)
      .order('sort_order', { ascending: true })
    expect(challenges).toHaveLength(50)

    let minute = 0
    for (const ch of challenges!) {
      const hh = 12 + Math.floor(minute / 60)
      const mm = minute % 60
      const stamp = slotUtc(1, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`)
      await fixtureComplete(alpha, 'both', ch.canonical_key as string, stamp)
      minute += 1
    }
    // Bravo finishes the same 50 later the same day.
    minute = 0
    for (const ch of challenges!) {
      const hh = 14 + Math.floor(minute / 60)
      const mm = minute % 60
      const stamp = slotUtc(1, `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`)
      await fixtureComplete(bravo, 'admin', ch.canonical_key as string, stamp)
      minute += 1
    }

    const board = await homeBoard(at)
    const alphaRow = board.find((r) => r.team_id === alpha)!
    const bravoRow = board.find((r) => r.team_id === bravo)!
    expect(alphaRow.completed).toBe(50)
    expect(bravoRow.completed).toBe(50)
    expect(alphaRow.points).toBe(bravoRow.points)
    expect(alphaRow.rank).toBe(1)
    expect(bravoRow.rank).toBe(2)
  }, 120_000)

  it('voided completion recalculates score_reached ranking', async () => {
    const at = noonDay1Utc()
    const alpha = await teamIdFor('both')
    const bravo = await teamIdFor('admin')

    // Bravo reaches 200 first (12:10); Alpha reaches 200 later (12:30 food).
    await fixtureComplete(bravo, 'admin', 'the-piazza-grandeur', slotUtc(1, '12:00:00'))
    await fixtureComplete(bravo, 'admin', 'movies-under-the-stars', slotUtc(1, '12:10:00'))
    await fixtureComplete(alpha, 'both', 'international-cafe', slotUtc(1, '12:30:00'))

    let board = await homeBoard(at)
    expect(board.find((r) => r.team_id === bravo)!.rank).toBe(1)
    expect(board.find((r) => r.team_id === alpha)!.rank).toBe(2)

    const { data: late } = await fixtures.service!
      .from('scavenger_completions')
      .select('id')
      .eq('team_id', bravo)
      .eq('status', 'active')
      .order('completed_at_utc', { ascending: false })
      .limit(1)
      .single()

    const voided = await fixtures.service!
      .from('scavenger_completions')
      .update({
        status: 'voided',
        voided_at_utc: new Date().toISOString(),
        voided_by_player_id: playerId(fixtures, 'admin'),
      })
      .eq('id', late!.id)
      .select('id')
    expect(voided.error).toBeNull()

    board = await homeBoard(at)
    const alphaRow = board.find((r) => r.team_id === alpha)!
    const bravoRow = board.find((r) => r.team_id === bravo)!
    // Bravo drops to 100; Alpha stays at 200 → Alpha leads
    expect(bravoRow.points).toBe(100)
    expect(alphaRow.points).toBe(200)
    expect(alphaRow.rank).toBe(1)
    expect(bravoRow.rank).toBe(2)
  })

  it('idempotent fixture replay does not move score_reached_at', async () => {
    const alpha = await teamIdFor('both')
    const firstAt = slotUtc(1, '12:00:00')

    const first = await fixtureComplete(alpha, 'both', 'the-piazza-grandeur', firstAt)
    const replay = await fixtures.service!.rpc('dev_fixture_scavenger_completion', {
      p_team_id: alpha,
      p_challenge_canonical_key: 'the-piazza-grandeur',
      p_submitting_player_id: playerId(fixtures, 'both'),
      p_completed_at_utc: slotUtc(1, '15:00:00'),
    })
    expect(replay.data.ok).toBe(false)

    const { data: rows } = await fixtures.service!.rpc('shipit_team_score_rows', {
      p_cruise_config_id: cruiseId,
    })
    const alphaRow = (rows as Array<{ team_id: string; score_reached_at: string }>).find(
      (r) => r.team_id === alpha,
    )!
    expect(new Date(alphaRow.score_reached_at).getTime()).toBe(new Date(firstAt).getTime())
    expect(first.points).toBe(100)
  })

  it('deterministic collision: same completed_at_utc breaks by completion id', async () => {
    const at = noonDay1Utc()
    const alpha = await teamIdFor('both')
    const bravo = await teamIdFor('admin')
    const stamp = slotUtc(1, '12:15:00')

    await fixtureComplete(alpha, 'both', 'the-piazza-grandeur', stamp)
    await fixtureComplete(bravo, 'admin', 'movies-under-the-stars', stamp)

    const { data: rows } = await fixtures.service!.rpc('shipit_team_score_rows', {
      p_cruise_config_id: cruiseId,
    })
    const ordered = rows as Array<{
      team_id: string
      score_reached_at: string
      score_reached_completion_id: string
      points: number
    }>
    const tied = ordered.filter((r) => r.points === 100)
    expect(tied).toHaveLength(2)
    expect(tied[0].score_reached_at).toBe(tied[1].score_reached_at)
    expect(tied[0].score_reached_completion_id < tied[1].score_reached_completion_id).toBe(true)

    const board = await homeBoard(at)
    expect(board.find((r) => r.team_id === tied[0].team_id)!.rank).toBe(1)
    expect(board.find((r) => r.team_id === tied[1].team_id)!.rank).toBe(2)
  })

  it('active home ranks match Wrapped Ship It! placement and champion', async () => {
    const playAt = noonDay1Utc()
    const alpha = await teamIdFor('both')
    const bravo = await teamIdFor('admin')

    await fixtureComplete(alpha, 'both', 'the-piazza-grandeur', slotUtc(1, '12:00:00'))
    await fixtureComplete(bravo, 'admin', 'movies-under-the-stars', slotUtc(1, '12:45:00'))

    const board = await homeBoard(playAt)
    expect(board.find((r) => r.team_id === alpha)!.rank).toBe(1)
    expect(board.find((r) => r.team_id === bravo)!.rank).toBe(2)

    const finale = slotUtc(7, '18:05:00')
    await fixtures.service!.from('game_control').update({
      finalized_at_utc: finale,
      status: 'final',
    })

    const wrapped = await fixtures.service!.rpc('dev_get_my_wrapped_at', {
      p_player_id: playerId(fixtures, 'both'),
      p_game: 'shipit',
      p_at_utc: finale,
    })
    expect(wrapped.error).toBeNull()
    expect(wrapped.data.ok).toBe(true)

    const lb = await fixtures.service!.rpc('wrapped_shipit_leaderboard', {
      p_cruise_config_id: cruiseId,
      p_team: alpha,
    })
    const wrappedBoard = lb.data as Array<{ id: string; rank: number; points: number }>
    expect(wrappedBoard.find((r) => r.id === alpha)!.rank).toBe(1)
    expect(wrappedBoard.find((r) => r.id === bravo)!.rank).toBe(2)

    const champs = await fixtures.service!.rpc('wrapped_si_metric_winners', {
      p_cruise_config_id: cruiseId,
      p_metric: 'points',
    })
    const winners = champs.data as Array<{ id: string }>
    expect(winners).toHaveLength(1)
    expect(winners[0].id).toBe(alpha)
  })
})
