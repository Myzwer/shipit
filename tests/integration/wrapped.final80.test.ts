/**
 * Final Cruise Wrapped — 80-entry inventory + gate checks.
 *
 * IMPORTANT: does NOT call loadClockFixtures / dev_seed_cruise_clock.
 * Those reseeds destroy the organizer Tuesday demo. This suite reads the
 * active cruise as-is and only toggles game_control.finalized_at_utc,
 * restoring the prior latch afterward.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createLocalClient, identity, loadLocalFixtures, type LocalFixtures } from '../helpers/localSupabase'
import { inventoryIdsForGame } from '@/lib/wrapped/inventory'

const hasPassword = Boolean(process.env.LOCAL_TEST_PASSWORD)

describe.runIf(hasPassword)('Final Wrapped 80-entry read model', () => {
  let fx: LocalFixtures
  let service: ReturnType<typeof createLocalClient>
  let cruiseId: string
  let day1: string
  let offsetMin: number
  let previousFinalized: Array<{ game: string; finalized_at_utc: string | null; status: string }> =
    []

  beforeAll(async () => {
    fx = await loadLocalFixtures()
    if (!fx.available || !fx.summary || !fx.serviceRoleKey) {
      throw new Error('Final Wrapped tests require local Supabase + LOCAL_TEST_PASSWORD')
    }
    service = createLocalClient(fx.summary.supabase_url, fx.serviceRoleKey)

    const { data: cfg, error } = await service
      .from('cruise_config')
      .select('id, day1_ship_date, base_ship_offset_minutes')
      .eq('is_active', true)
      .single()
    if (error || !cfg) throw error ?? new Error('no active cruise')
    cruiseId = cfg.id as string
    day1 = cfg.day1_ship_date as string
    offsetMin = cfg.base_ship_offset_minutes as number

    const { data: controls } = await service
      .from('game_control')
      .select('game, finalized_at_utc, status')
    previousFinalized = (controls ?? []) as typeof previousFinalized
  }, 60_000)

  async function setGameControl(
    patch: { finalized_at_utc: string | null; status: string },
  ) {
    // PostgREST requires a WHERE clause for UPDATE.
    for (const game of ['drinkit', 'shipit'] as const) {
      const { error } = await service.from('game_control').update(patch).eq('game', game)
      if (error) throw error
    }
  }

  afterAll(async () => {
    if (!service) return
    for (const row of previousFinalized) {
      const { error } = await service
        .from('game_control')
        .update({
          finalized_at_utc: row.finalized_at_utc,
          status: row.status,
        })
        .eq('game', row.game)
      if (error) throw error
    }
  })

  function shipLocalToUtcIso(shipDate: string, time: string, offsetMinutes: number): string {
    const ship = new Date(`${shipDate}T${time}Z`)
    const utcMs = ship.getTime() - offsetMinutes * 60_000
    return new Date(utcMs).toISOString()
  }

  function dayDate(dayNumber: number): string {
    const d = new Date(`${day1}T00:00:00Z`)
    d.setUTCDate(d.getUTCDate() + (dayNumber - 1))
    return d.toISOString().slice(0, 10)
  }

  function at(day: number, time: string) {
    return shipLocalToUtcIso(dayDate(day), time, offsetMin)
  }

  function sectionIds(payload: {
    sections?: {
      personal?: Array<{ spec_id: string }>
      global?: Array<{ spec_id: string }>
      collective?: Array<{ spec_id: string }>
    }
  }) {
    return [
      ...(payload.sections?.personal ?? []).map((e) => e.spec_id),
      ...(payload.sections?.global ?? []).map((e) => e.spec_id),
      ...(payload.sections?.collective ?? []).map((e) => e.spec_id),
    ]
  }

  it('returns exact Drink It! and Ship It! inventory order after finale', async () => {
    const finale = at(7, '18:05:00')
    await setGameControl({ finalized_at_utc: finale, status: 'final' })

    const bothPlayer = identity(fx.summary!, 'josh_forrester')
    const shipOnly = identity(fx.summary!, 'triss_forrester')

    const drink = await service.rpc('dev_get_my_wrapped_at', {
      p_player_id: bothPlayer.player_id,
      p_game: 'drinkit',
      p_at_utc: finale,
    })
    expect(drink.error).toBeNull()
    expect(drink.data.ok).toBe(true)
    expect(sectionIds(drink.data)).toEqual(inventoryIdsForGame('drinkit'))
    expect(drink.data.sections.personal).toHaveLength(18)
    expect(drink.data.sections.global).toHaveLength(16)
    expect(drink.data.sections.collective).toHaveLength(12)
    expect(typeof drink.data.personal_stats?.drink_logs).toBe('number')
    expect(Array.isArray(drink.data.leaderboard)).toBe(true)

    const ship = await service.rpc('dev_get_my_wrapped_at', {
      p_player_id: shipOnly.player_id,
      p_game: 'shipit',
      p_at_utc: finale,
    })
    expect(ship.error).toBeNull()
    expect(ship.data.ok).toBe(true)
    expect(sectionIds(ship.data)).toEqual(inventoryIdsForGame('shipit'))
    expect(ship.data.sections.personal).toHaveLength(10)
    expect(ship.data.sections.global).toHaveLength(12)
    expect(ship.data.sections.collective).toHaveLength(12)

    // Direct SQL helpers also match inventory (no payload gate).
    const { data: diDirect, error: diErr } = await service.rpc('wrapped_drinkit_sections' as 'get_ship_clock_state', {
      p_player_id: bothPlayer.player_id,
      p_cruise_config_id: cruiseId,
    } as never)
    // helpers are service_role-only; if RPC grant missing, skip this soft check
    if (!diErr && diDirect) {
      expect([
        ...(diDirect.personal ?? []).map((e: { spec_id: string }) => e.spec_id),
        ...(diDirect.global ?? []).map((e: { spec_id: string }) => e.spec_id),
        ...(diDirect.collective ?? []).map((e: { spec_id: string }) => e.spec_id),
      ]).toEqual(inventoryIdsForGame('drinkit'))
    }
  })

  it('denies Wrapped before finale and blocks cross-game access', async () => {
    // Clear latch. Derive pre/post from authoritative finale_at_utc so historic
    // clock offsets never desync the Day-7 17:59/18:00 arithmetic.
    await setGameControl({ finalized_at_utc: null, status: 'active' })
    const bothPlayer = identity(fx.summary!, 'josh_forrester')
    const shipOnly = identity(fx.summary!, 'triss_forrester')

    const probe = at(7, '12:00:00')
    const { data: clock } = await service.rpc('dev_get_ship_clock_state_at', {
      p_at_utc: probe,
      p_apply_lifecycle_side_effects: false,
    })
    const finaleIso = String(clock?.finale_at_utc ?? '')
    expect(finaleIso).toBeTruthy()
    const finaleMs = new Date(finaleIso).getTime()
    const pre = new Date(finaleMs - 60_000).toISOString()
    const atFinale = new Date(finaleMs).toISOString()

    const denied = await service.rpc('dev_get_my_wrapped_at', {
      p_player_id: bothPlayer.player_id,
      p_game: 'drinkit',
      p_at_utc: pre,
    })
    expect(denied.data.ok).toBe(false)
    expect(denied.data.code).toBe('WRAPPED_NOT_AVAILABLE')

    await setGameControl({ finalized_at_utc: atFinale, status: 'final' })
    const cross = await service.rpc('dev_get_my_wrapped_at', {
      p_player_id: shipOnly.player_id,
      p_game: 'drinkit',
      p_at_utc: atFinale,
    })
    expect(cross.data.ok).toBe(false)
    expect(cross.data.code).toBe('GAME_MEMBERSHIP_REQUIRED')
  })

  it('is read-only across repeated visits (reveal idempotent)', async () => {
    const finale = at(7, '18:25:00')
    await setGameControl({ finalized_at_utc: finale, status: 'final' })
    const player = identity(fx.summary!, 'katie_forrester')

    const first = await service.rpc('dev_get_my_wrapped_at', {
      p_player_id: player.player_id,
      p_game: 'drinkit',
      p_at_utc: finale,
    })
    const second = await service.rpc('dev_get_my_wrapped_at', {
      p_player_id: player.player_id,
      p_game: 'drinkit',
      p_at_utc: finale,
    })
    expect(first.data.ok).toBe(true)
    expect(JSON.stringify(first.data.sections)).toBe(JSON.stringify(second.data.sections))

    const r1 = await service.rpc('dev_reveal_wrapped_at', {
      p_player_id: player.player_id,
      p_game: 'drinkit',
      p_at_utc: finale,
    })
    const r2 = await service.rpc('dev_reveal_wrapped_at', {
      p_player_id: player.player_id,
      p_game: 'drinkit',
      p_at_utc: finale,
    })
    expect(r1.data.ok).toBe(true)
    expect(r2.data.idempotent_replay).toBe(true)
  })

  it('keeps drink-log vs bounty semantics for existing demo data', async () => {
    const finale = at(7, '18:30:00')
    await setGameControl({ finalized_at_utc: finale, status: 'final' })
    const player = identity(fx.summary!, 'josh_forrester')
    const wrapped = await service.rpc('dev_get_my_wrapped_at', {
      p_player_id: player.player_id,
      p_game: 'drinkit',
      p_at_utc: finale,
    })
    expect(wrapped.data.ok).toBe(true)
    const byId = Object.fromEntries(
      [
        ...wrapped.data.sections.personal,
        ...wrapped.data.sections.collective,
      ].map((e: { spec_id: string; value_numeric: number | null; available: boolean }) => [
        e.spec_id,
        e,
      ]),
    )
    // Drink logs are never less than named drinks / bars visited for a real player.
    expect(byId['DI-P01'].value_numeric).toBeGreaterThanOrEqual(byId['DI-P10'].value_numeric ?? 0)
    expect(byId['DI-P01'].value_numeric).toBeGreaterThanOrEqual(byId['DI-P11'].value_numeric ?? 0)
    // Collective drink total is at least this player's drinks.
    expect(byId['DI-C01'].value_numeric).toBeGreaterThanOrEqual(byId['DI-P01'].value_numeric ?? 0)
    // Bounty total can exceed drink logs (multi-claim) but daily does not create logs.
    expect(byId['DI-P05'].value_numeric).toBeGreaterThanOrEqual(
      (byId['DI-P06'].value_numeric ?? 0) +
        (byId['DI-P07'].value_numeric ?? 0) +
        (byId['DI-P08'].value_numeric ?? 0) +
        (byId['DI-P09'].value_numeric ?? 0),
    )
  })
})
