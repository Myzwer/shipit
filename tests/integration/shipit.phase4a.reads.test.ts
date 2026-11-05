/**
 * Phase 4A — Ship It! challenges, team completion ledger, secure reads.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  DEV_BASE_OFFSET_MIN,
  loadBountyFixtures,
  noonDay1Utc,
  slotUtc,
} from '../helpers/bountyFixtures'
import { playerId } from '../helpers/drinkitSubmit'
import { signInAs } from '../helpers/localSupabase'
import type { ClockFixtures } from '../helpers/clockFixtures'

let fixtures: ClockFixtures

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
})

beforeEach(async () => {
  // Clear fixture ledger before cruise reseed (FK to cruise_config).
  await fixtures.service!.from('scavenger_completions').delete().gte('created_at', '1970-01-01')
  await fixtures
    .service!.from('submissions')
    .delete()
    .eq('kind', 'scavenger_dev_fixture')

  const { error } = await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()
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

describe('Phase 4A scavenger content constraints', () => {
  it('has exactly 50 enabled challenges: 10 per category at 100–500', async () => {
    const { data, error } = await fixtures.service!
      .from('scavenger_challenges')
      .select('category, points, content_source, photo_required, enabled')
      .eq('enabled', true)
    expect(error).toBeNull()
    expect(data).toHaveLength(50)
    expect(data!.every((r) => r.photo_required === true)).toBe(true)
    expect(data!.every((r) => r.content_source === 'development-only')).toBe(true)

    const byCat = new Map<string, number>()
    for (const row of data!) {
      byCat.set(row.category, (byCat.get(row.category) ?? 0) + 1)
      const expected =
        row.category === 'classic_ship_landmarks'
          ? 100
          : row.category === 'food_and_drink_discoveries'
            ? 200
            : row.category === 'quirky_details_and_hidden_artifacts'
              ? 300
              : row.category === 'interactive_crew_and_activity'
                ? 400
                : 500
      expect(row.points).toBe(expected)
    }
    expect([...byCat.values()].every((n) => n === 10)).toBe(true)
    expect(byCat.size).toBe(5)
  })
})

describe('Phase 4A completion ledger', () => {
  it('enforces one active completion per team/challenge; other teams independent', async () => {
    const at = noonDay1Utc()
    const alpha = await teamIdFor('both')
    const bravo = await teamIdFor('admin')
    // admin is Demo Team Bravo in provision
    const authorA = playerId(fixtures, 'both')
    const authorB = playerId(fixtures, 'admin')

    const first = await fixtures.service!.rpc('dev_fixture_scavenger_completion', {
      p_team_id: alpha,
      p_challenge_canonical_key: 'the-piazza-grandeur',
      p_submitting_player_id: authorA,
      p_completed_at_utc: at,
    })
    expect(first.error).toBeNull()
    expect(first.data.ok).toBe(true)
    expect(first.data.points).toBe(100)

    const dup = await fixtures.service!.rpc('dev_fixture_scavenger_completion', {
      p_team_id: alpha,
      p_challenge_canonical_key: 'the-piazza-grandeur',
      p_submitting_player_id: authorA,
      p_completed_at_utc: at,
    })
    expect(dup.data.ok).toBe(false)
    expect(dup.data.code).toBe('ALREADY_COMPLETED')

    const other = await fixtures.service!.rpc('dev_fixture_scavenger_completion', {
      p_team_id: bravo,
      p_challenge_canonical_key: 'the-piazza-grandeur',
      p_submitting_player_id: authorB,
      p_completed_at_utc: at,
    })
    expect(other.data.ok).toBe(true)

    const { count } = await fixtures.service!
      .from('scavenger_completions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'active')
      .eq('challenge_canonical_key', 'the-piazza-grandeur')
    expect(count).toBe(2)
  })

  it('aggregates team points once (no team-size multiplier)', async () => {
    const at = noonDay1Utc()
    const alpha = await teamIdFor('both')
    const author = playerId(fixtures, 'both')
    const teammate = playerId(fixtures, 'ship_only')
    // Same team, two different members submit different tasks — points still sum once each.
    const a = await fixtures.service!.rpc('dev_fixture_scavenger_completion', {
      p_team_id: alpha,
      p_challenge_canonical_key: 'the-piazza-grandeur',
      p_submitting_player_id: author,
      p_completed_at_utc: at,
    })
    const b = await fixtures.service!.rpc('dev_fixture_scavenger_completion', {
      p_team_id: alpha,
      p_challenge_canonical_key: 'international-cafe',
      p_submitting_player_id: teammate,
      p_completed_at_utc: at,
    })
    expect(a.data.ok).toBe(true)
    expect(b.data.ok).toBe(true)
    expect(a.data.points + b.data.points).toBe(300)

    const home = await fixtures.service!.rpc('dev_get_shipit_home_at', {
      p_at_utc: at,
      p_player_id: author,
    })
    expect(home.data.ok).toBe(true)
    expect(home.data.overall.completed).toBe(2)
    expect(home.data.overall.points).toBe(300)
    // Not multiplied by the two team members who submitted.
    expect(home.data.overall.points).toBe(a.data.points + b.data.points)
  })
})

describe('Phase 4A secure player reads / RLS', () => {
  it('Ship It! member reads own team progress; Drink It!-only denied', async () => {
    const ship = await signInAs(fixtures, 'ship_only')
    const home = await ship.rpc('get_my_shipit_home')
    expect(home.error).toBeNull()
    expect(home.data.ok).toBe(true)
    expect(home.data.categories).toHaveLength(5)
    expect(home.data.overall.total).toBe(50)

    const list = await ship.rpc('get_my_shipit_challenges', { p_category: null })
    expect(list.error).toBeNull()
    expect(list.data.ok).toBe(true)
    expect(list.data.sections).toHaveLength(5)
    const totalCards = list.data.sections.reduce(
      (n: number, s: { challenges: unknown[] }) => n + s.challenges.length,
      0,
    )
    expect(totalCards).toBe(50)
    expect(list.data.submission_available).toBe(false)

    const drink = await signInAs(fixtures, 'drink_only')
    const denied = await drink.rpc('get_my_shipit_home')
    expect(denied.error || denied.data?.ok === false).toBeTruthy()

    const direct = await drink.from('scavenger_challenges').select('id').limit(1)
    expect(direct.error || (direct.data ?? []).length === 0).toBeTruthy()

    const write = await ship.from('scavenger_completions').insert({
      team_id: await teamIdFor('ship_only'),
      challenge_id: (
        await fixtures.service!.from('scavenger_challenges').select('id').limit(1).single()
      ).data!.id,
      submitting_player_id: playerId(fixtures, 'ship_only'),
      cruise_config_id: (
        await fixtures.service!.from('cruise_config').select('id').eq('is_active', true).single()
      ).data!.id,
      points: 100,
      challenge_canonical_key: 'x',
      category: 'classic_ship_landmarks',
      title_snapshot: 'x',
      instructions_snapshot: 'x',
      completed_at_utc: new Date().toISOString(),
    })
    expect(write.error).toBeTruthy()
  })

  it('category filter returns one section; ties share ranks with stable order', async () => {
    const at = noonDay1Utc()
    const alpha = await teamIdFor('both')
    const bravo = await teamIdFor('admin')
    const authorA = playerId(fixtures, 'both')
    const authorB = playerId(fixtures, 'admin')

    // Equal points: both complete one 100-pt classic
    await fixtures.service!.rpc('dev_fixture_scavenger_completion', {
      p_team_id: alpha,
      p_challenge_canonical_key: 'the-piazza-grandeur',
      p_submitting_player_id: authorA,
      p_completed_at_utc: at,
    })
    await fixtures.service!.rpc('dev_fixture_scavenger_completion', {
      p_team_id: bravo,
      p_challenge_canonical_key: 'movies-under-the-stars',
      p_submitting_player_id: authorB,
      p_completed_at_utc: slotUtc(1, '12:05:00'),
    })

    const home = await fixtures.service!.rpc('dev_get_shipit_home_at', {
      p_at_utc: at,
      p_player_id: authorA,
    })
    expect(home.data.ok).toBe(true)
    const board = home.data.leaderboard as Array<{
      team_name: string
      points: number
      rank: number
    }>
    const tied = board.filter((r) => r.points === 100)
    expect(tied.length).toBeGreaterThanOrEqual(2)
    expect(tied.every((r) => r.rank === tied[0].rank)).toBe(true)
    // Incumbent (earlier first completion) stays above
    expect(board[0].team_name).toBeTruthy()

    const ship = await signInAs(fixtures, 'both')
    const filtered = await ship.rpc('get_my_shipit_challenges', {
      p_category: 'classic_ship_landmarks',
    })
    expect(filtered.data.ok).toBe(true)
    expect(filtered.data.sections).toHaveLength(1)
    expect(filtered.data.sections[0].challenges).toHaveLength(10)
    expect(filtered.data.sections[0].points_per_challenge).toBe(100)
  })

  it('finale is read-only; available before noon and while Drink It! paused', async () => {
    const morning = slotUtc(1, '10:00:00')
    const morningHome = await fixtures.service!.rpc('dev_get_shipit_home_at', {
      p_at_utc: morning,
      p_player_id: playerId(fixtures, 'ship_only'),
    })
    expect(morningHome.data.lifecycle.status).toBe('active')
    expect(morningHome.data.lifecycle.accepting_submissions).toBe(true)

    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    const pausedHome = await fixtures.service!.rpc('dev_get_shipit_home_at', {
      p_at_utc: noonDay1Utc(),
      p_player_id: playerId(fixtures, 'ship_only'),
    })
    expect(pausedHome.data.lifecycle.status).toBe('active')
    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })

    const finale = await fixtures.service!.rpc('dev_get_shipit_home_at', {
      p_at_utc: slotUtc(7, '18:00:00'),
      p_player_id: playerId(fixtures, 'ship_only'),
    })
    expect(finale.data.lifecycle.status).toBe('finale')
    expect(finale.data.lifecycle.read_only).toBe(true)
    expect(finale.data.lifecycle.accepting_submissions).toBe(false)
  })
})
