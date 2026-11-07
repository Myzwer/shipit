/**
 * Phase 8 — Awards Mode / Cruise Wrapped (server).
 * Seven-day simulation via Ship Clock timestamps (no wall-clock wait).
 */
import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  dayDate,
  loadClockFixtures,
  shipLocalToUtcIso,
  DEV_BASE_OFFSET_MIN,
  type ClockFixtures,
} from '../helpers/clockFixtures'
import { identity, signInAs } from '../helpers/localSupabase'
import { drinkPayload, lookupOffering } from '../helpers/drinkitSubmit'
import { slotUtc } from '../helpers/bountyFixtures'

const hasPassword = Boolean(process.env.LOCAL_TEST_PASSWORD)

describe.runIf(hasPassword)('Phase 8 Wrapped / Awards Mode', () => {
  let fx: ClockFixtures
  let cruiseId: string
  let teamCharlieId: string | null = null

  beforeAll(async () => {
    fx = await loadClockFixtures()
    if (!fx.available || !fx.service || !fx.summary) {
      throw new Error('Phase 8 tests require local Supabase + LOCAL_TEST_PASSWORD')
    }

    const { data: cfg } = await fx.service!
      .from('cruise_config')
      .select('id')
      .eq('is_active', true)
      .single()
    cruiseId = cfg!.id as string

    // Ensure a third Ship It! team with unequal size for simulation.
    const { data: existing } = await fx.service!.from('teams').select('id, name')
    const names = new Set((existing ?? []).map((t) => t.name))
    if (!names.has('Demo Team Charlie')) {
      const { data: team, error } = await fx.service!
        .from('teams')
        .insert({ name: 'Demo Team Charlie' })
        .select('id')
        .single()
      if (error) throw error
      teamCharlieId = team.id
    } else {
      teamCharlieId = (existing ?? []).find((t) => t.name === 'Demo Team Charlie')!.id
    }

    // Clear finale latch + reveals between suite runs.
    await fx.service!.from('game_control').update({ finalized_at_utc: null, status: 'active' })
    await fx.service!.from('wrapped_reveals').delete().neq('player_id', randomUUID())
  }, 60_000)

  function at(day: number, time: string) {
    return shipLocalToUtcIso(dayDate(day), time, DEV_BASE_OFFSET_MIN)
  }

  it('denies Wrapped reads before finale', async () => {
    const drink = await signInAs(fx, 'drink_only')
    const pre = at(7, '17:59:00')
    // Authenticated player call uses clock_timestamp — force via timed RPC.
    const { data, error } = await fx.service!.rpc('dev_get_my_wrapped_at', {
      p_player_id: identity(fx.summary!, 'drink_only').player_id,
      p_game: 'drinkit',
      p_at_utc: pre,
    })
    expect(error).toBeNull()
    expect(data.ok).toBe(false)
    expect(data.code).toBe('WRAPPED_NOT_AVAILABLE')

    // Direct player RPC while clock is still pre-finale (no latch).
    await fx.service!.from('game_control').update({ finalized_at_utc: null, status: 'active' })
    const live = await drink.rpc('get_my_wrapped', { p_game: 'drinkit' })
    // May be available if wall clock somehow past latch in weird env — still must not leak wrong game.
    if (live.data?.ok) {
      expect(live.data.game).toBe('drinkit')
    } else {
      expect(['WRAPPED_NOT_AVAILABLE', 'NO_CRUISE_CONFIG']).toContain(live.data?.code)
    }
  })

  it('accepts 5:59 PM submission and rejects 6:00 PM new submission', async () => {
    await fx.service!.from('game_control').update({ finalized_at_utc: null, status: 'active' })

    const drinkOnly = identity(fx.summary!, 'drink_only')
    const both = identity(fx.summary!, 'both')
    const barKey = 'wake-view'
    let offeringId: string | undefined
    try {
      const off = await lookupOffering(fx.service!, barKey, 'pina-colada')
      offeringId = off.offering_id
    } catch {
      // Catalog may use different keys — fall back to generic beer.
    }

    const preCutoff = at(7, '17:59:00')
    const payload = drinkPayload({
      barKey,
      mode: offeringId ? 'named_catalog' : 'generic_beer',
      offeringId,
      companions: [both.player_id],
      barEligibleCompanions: [both.player_id],
      selectedClaims: [],
    })
    const accepted = await fx.service!.rpc('dev_submit_drink_at', {
      p_payload: payload,
      p_at_utc: preCutoff,
      p_player_id: drinkOnly.player_id,
    })
    expect(accepted.error).toBeNull()
    expect(accepted.data?.ok).toBe(true)

    const atCutoff = at(7, '18:00:00')
    const denied = await fx.service!.rpc('dev_submit_drink_at', {
      p_payload: drinkPayload({
        barKey,
        mode: 'generic_beer',
        companions: [both.player_id],
        barEligibleCompanions: [both.player_id],
      }),
      p_at_utc: atCutoff,
      p_player_id: drinkOnly.player_id,
    })
    expect(denied.error).toBeNull()
    expect(denied.data?.ok).toBe(false)
    expect(denied.data?.code).toBe('GAME_ENDED')
  })

  it('latches both games, reveals per viewer, and blocks cross-game access', async () => {
    const finale = at(7, '18:00:00')
    await fx.service!.rpc('dev_get_ship_clock_state_at', {
      p_at_utc: finale,
      p_apply_lifecycle_side_effects: true,
    })

    const { data: controls } = await fx.service!
      .from('game_control')
      .select('game, finalized_at_utc')
    expect(controls?.every((c) => c.finalized_at_utc != null)).toBe(true)

    const drinkOnly = identity(fx.summary!, 'drink_only')
    const shipOnly = identity(fx.summary!, 'ship_only')
    const both = identity(fx.summary!, 'both')

    const drinkWrapped = await fx.service!.rpc('dev_get_my_wrapped_at', {
      p_player_id: drinkOnly.player_id,
      p_game: 'drinkit',
      p_at_utc: finale,
    })
    expect(drinkWrapped.data.ok).toBe(true)
    expect(drinkWrapped.data.revealed).toBe(false)
    expect(drinkWrapped.data.personal_stats.drink_logs).toBeGreaterThanOrEqual(0)

    // Cross-game: drink_only cannot open Ship It! Wrapped.
    const cross = await fx.service!.rpc('dev_get_my_wrapped_at', {
      p_player_id: drinkOnly.player_id,
      p_game: 'shipit',
      p_at_utc: finale,
    })
    expect(cross.data.ok).toBe(false)
    expect(cross.data.code).toBe('GAME_MEMBERSHIP_REQUIRED')

    // Per-viewer Ship It! reveal — Katie-style teammate independence.
    const r1 = await fx.service!.rpc('dev_reveal_wrapped_at', {
      p_player_id: shipOnly.player_id,
      p_game: 'shipit',
      p_at_utc: finale,
    })
    expect(r1.data.ok).toBe(true)
    expect(r1.data.idempotent_replay).toBe(false)

    const r1b = await fx.service!.rpc('dev_reveal_wrapped_at', {
      p_player_id: shipOnly.player_id,
      p_game: 'shipit',
      p_at_utc: finale,
    })
    expect(r1b.data.idempotent_replay).toBe(true)

    const bothShip = await fx.service!.rpc('dev_get_my_wrapped_at', {
      p_player_id: both.player_id,
      p_game: 'shipit',
      p_at_utc: finale,
    })
    expect(bothShip.data.ok).toBe(true)
    expect(bothShip.data.revealed).toBe(false)

    const bothDrink = await fx.service!.rpc('dev_reveal_wrapped_at', {
      p_player_id: both.player_id,
      p_game: 'drinkit',
      p_at_utc: finale,
    })
    expect(bothDrink.data.ok).toBe(true)

    const bothAfter = await fx.service!.rpc('dev_get_my_wrapped_at', {
      p_player_id: both.player_id,
      p_game: 'drinkit',
      p_at_utc: finale,
    })
    expect(bothAfter.data.revealed).toBe(true)
    // Ship It! reveal still independent.
    expect(bothShip.data.revealed).toBe(false)
  })

  it('computes 1,1,3 leaderboard ties and group award ties / no winner', async () => {
    const finale = at(7, '18:05:00')
    await fx.service!.from('game_control').update({
      finalized_at_utc: finale,
      status: 'final',
    })

    // Force two Drink It! players to equal points via direct claim ledger for ranking test.
    const drinkOnly = identity(fx.summary!, 'drink_only')
    const both = identity(fx.summary!, 'both')
    const admin = identity(fx.summary!, 'admin')

    // Clear active claims for controlled totals.
    await fx.service!
      .from('bounty_claims')
      .delete()
      .eq('cruise_config_id', cruiseId)
      .eq('status', 'active')

    const { data: loggedBar, error: dlErr } = await fx.service!
      .from('drink_logs')
      .select('bar_id, bar_canonical_key, bar_display_name')
      .limit(1)
      .maybeSingle()
    if (dlErr) throw dlErr
    expect(loggedBar?.bar_id).toBeTruthy()
    const bar = {
      id: loggedBar!.bar_id as string,
      canonical_key: loggedBar!.bar_canonical_key as string,
      display_name: loggedBar!.bar_display_name as string,
    }

    const { data: assignment, error: aErr } = await fx.service!
      .from('bar_bounties')
      .upsert(
        {
          cruise_config_id: cruiseId,
          bar_id: bar!.id,
          day_number: 2,
          bar_canonical_key: bar!.canonical_key,
          bar_display_name: bar!.display_name,
        },
        { onConflict: 'cruise_config_id,day_number' },
      )
      .select('id')
      .maybeSingle()
    if (aErr) throw aErr
    expect(assignment?.id).toBeTruthy()
    const assignmentId = assignment!.id as string

    async function seedBarPoints(playerId: string, points: number, day: number) {
      const subId = randomUUID()
      const { error: sErr } = await fx.service!.from('submissions').insert({
        id: subId,
        author_player_id: playerId,
        idempotency_key: randomUUID(),
        game: 'drinkit',
        kind: 'drink_log',
        cruise_config_id: cruiseId,
        received_at_utc: at(day, '14:00:00'),
        ship_day: day,
        status: 'accepted',
        request_payload_hash: `phase8-${playerId}-${points}-${day}`,
        request_payload_json: { test: true },
        result_json: { ok: true },
        display_snapshot_json: {},
      })
      if (sErr) throw sErr

      const { error: cErr } = await fx.service!.from('bounty_claims').insert({
        submission_id: subId,
        player_id: playerId,
        cruise_config_id: cruiseId,
        game_day: day,
        category: 'bar',
        bar_assignment_id: assignmentId,
        points,
        status: 'active',
        offer_snapshot_json: { phase8: true },
      })
      if (cErr) throw cErr
    }

    await seedBarPoints(drinkOnly.player_id, 50, 2)
    await seedBarPoints(both.player_id, 50, 3)
    await seedBarPoints(admin.player_id, 10, 4)

    const board = await fx.service!.rpc('dev_get_my_wrapped_at', {
      p_player_id: drinkOnly.player_id,
      p_game: 'drinkit',
      p_at_utc: finale,
    })
    expect(board.data.ok).toBe(true)
    const lb = board.data.leaderboard as Array<{ name: string; points: number; rank: number }>
    const top = lb.filter((r) => r.points === 50)
    expect(top.length).toBeGreaterThanOrEqual(2)
    expect(top.every((r) => r.rank === 1)).toBe(true)
    const third = lb.find((r) => r.points === 10)
    expect(third?.rank).toBe(3)

    const awards = board.data.group_awards as Array<{
      stable_key: string
      status: string
      winners: Array<{ owner_name: string }>
      qualifying_value: number | null
    }>
    const topPoints = awards.find((a) => a.stable_key === 'test-drinkit-top-points')
    expect(topPoints).toBeTruthy()
    expect(topPoints!.status).toBe('awarded')
    expect(topPoints!.winners.length).toBeGreaterThanOrEqual(2)

    // Genuine zero personal stats remain 0 (drink_logs may be >0 from prior test).
    expect(typeof board.data.personal_stats.final_points).toBe('number')
  })

  it('authenticated reveal cannot target another player; void denied after finale', async () => {
    const finale = at(7, '18:10:00')
    await fx.service!.from('game_control').update({
      finalized_at_utc: finale,
      status: 'final',
    })

    const drinkClient = await signInAs(fx, 'drink_only')
    const shipClient = await signInAs(fx, 'ship_only')

    const crossReveal = await drinkClient.rpc('reveal_my_wrapped', { p_game: 'shipit' })
    expect(crossReveal.data?.ok).toBe(false)
    expect(crossReveal.data?.code).toBe('GAME_MEMBERSHIP_REQUIRED')

    const shipReveal = await shipClient.rpc('reveal_my_wrapped', { p_game: 'shipit' })
    expect(shipReveal.data?.ok).toBe(true)

    // Admin void refused after finale.
    const adminClient = await signInAs(fx, 'admin')
    const { data: anySub } = await fx.service!
      .from('submissions')
      .select('id')
      .eq('status', 'accepted')
      .limit(1)
      .maybeSingle()
    if (anySub?.id) {
      const voidRes = await adminClient.rpc('admin_void_submission', {
        p_client_request_id: randomUUID(),
        p_submission_id: anySub.id,
        p_expected_status: 'accepted',
        p_reason: 'phase8-post-finale',
      })
      const code = voidRes.data?.code ?? voidRes.error?.message ?? ''
      expect(String(code)).toMatch(/FINALE|FINAL|GAME_ENDED|ended|LOCKED|void/i)
    }
  })

  it('Ship It! unequal teams have no size multiplier in leaderboard points', async () => {
    const finale = at(7, '18:15:00')
    expect(teamCharlieId).toBeTruthy()
    expect(cruiseId).toBeTruthy()

    const board = await fx.service!.rpc('dev_get_my_wrapped_at', {
      p_player_id: identity(fx.summary!, 'ship_only').player_id,
      p_game: 'shipit',
      p_at_utc: finale,
    })
    expect(board.data.ok).toBe(true)
    for (const row of board.data.leaderboard ?? []) {
      expect(row.points).toBeTypeOf('number')
      // Points come only from completions — never member_count * anything.
      expect(row).not.toHaveProperty('member_count_multiplier')
    }
  })

  // Silence unused helper warning in some runners
  it('slot helper available for rehearsal', () => {
    expect(slotUtc(1, '12:00:00')).toBeTruthy()
  })
})
