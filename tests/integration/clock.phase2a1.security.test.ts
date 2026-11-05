/**
 * Phase 2A.1 security & timeline hardening regressions.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run test:clock
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  DEV_BASE_OFFSET_MIN,
  DEV_DAY1,
  dayDate,
  loadClockFixtures,
  shipLocalToUtcIso,
  sameUtcInstant,
  stateAt,
  type ClockFixtures,
} from '../helpers/clockFixtures'
import { signInAs } from '../helpers/localSupabase'

let fixtures: ClockFixtures

async function seedFresh() {
  if (!fixtures.service) return
  const { error } = await fixtures.service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: DEV_DAY1,
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()
}

beforeAll(async () => {
  fixtures = await loadClockFixtures()
})

beforeEach(async () => {
  if (!fixtures.available) return
  await seedFresh()
})

describe('Phase 2A.1 Issue 1 — client time cannot latch finale', () => {
  it('reports fixture availability', () => {
    expect(typeof fixtures.available).toBe('boolean')
    if (fixtures.password) expect(fixtures.available).toBe(true)
  })

  it('1: ordinary player cannot force finale with a future timestamp', async () => {
    if (!fixtures.available) return
    const player = await signInAs(fixtures, 'both')
    const future = shipLocalToUtcIso(dayDate(7), '18:00:00', DEV_BASE_OFFSET_MIN)

    // Old signature must not exist for authenticated clients.
    const { error: timedErr } = await player.rpc('get_ship_clock_state', {
      p_at_utc: future,
    })
    expect(timedErr).toBeTruthy()

    const { data: before } = await fixtures.service!.from('game_control').select('finalized_at_utc')
    expect((before ?? []).every((r) => r.finalized_at_utc === null)).toBe(true)

    // Player read uses server now only — must not latch 2099 finale while wall clock is 2026.
    const { data: state, error } = await player.rpc('get_ship_clock_state')
    expect(error).toBeNull()
    expect(state.finalized).toBe(false)
    expect(state.lifecycle).toBe('pre_cruise')

    const { data: after } = await fixtures.service!.from('game_control').select('finalized_at_utc')
    expect((after ?? []).every((r) => r.finalized_at_utc === null)).toBe(true)
  })

  it('2: ordinary player cannot backdate eligibility via acceptance RPC', async () => {
    if (!fixtures.available) return
    const player = await signInAs(fixtures, 'both')
    const duringCruise = shipLocalToUtcIso(dayDate(3), '15:00:00', DEV_BASE_OFFSET_MIN)

    const { error } = await player.rpc('evaluate_submission_acceptance', {
      p_game: 'drinkit',
      p_at_utc: duringCruise,
    })
    expect(error).toBeTruthy()

    const { data, error: okErr } = await player.rpc('evaluate_submission_acceptance', {
      p_game: 'drinkit',
    })
    expect(okErr).toBeNull()
    // Real server time is pre-cruise for development-only 2099 config.
    expect(data.allowed).toBe(false)
    expect(data.code).toBe('PRE_CRUISE')
    expect(data.received_at_utc).toBeTruthy()
  })

  it('3: player cannot call dev time-travel or lifecycle latch helpers', async () => {
    if (!fixtures.available) return
    const player = await signInAs(fixtures, 'both')
    const future = shipLocalToUtcIso(dayDate(7), '18:00:00', DEV_BASE_OFFSET_MIN)

    expect(
      (
        await player.rpc('dev_get_ship_clock_state_at', {
          p_at_utc: future,
          p_apply_lifecycle_side_effects: true,
        })
      ).error,
    ).toBeTruthy()

    expect(
      (
        await player.rpc('dev_evaluate_submission_acceptance_at', {
          p_game: 'drinkit',
          p_at_utc: future,
          p_apply_lifecycle_side_effects: true,
        })
      ).error,
    ).toBeTruthy()

    const { data: controls } = await fixtures.service!.from('game_control').select('finalized_at_utc')
    expect((controls ?? []).every((r) => r.finalized_at_utc === null)).toBe(true)
  })

  it('4: normal player clock reads return authoritative server time fields', async () => {
    if (!fixtures.available) return
    const player = await signInAs(fixtures, 'ship_only')
    const { data, error } = await player.rpc('get_ship_clock_state')
    expect(error).toBeNull()
    expect(data.configured).toBe(true)
    expect(data.at_utc).toBeTruthy()
    // Server now is years before Day 1 2099.
    expect(data.lifecycle).toBe('pre_cruise')
    expect(new Date(data.at_utc).getUTCFullYear()).toBeLessThan(2099)
  })

  it('5: test-only simulation remains deterministic and isolated', async () => {
    if (!fixtures.available) return
    const at = shipLocalToUtcIso(dayDate(2), '12:00:00', DEV_BASE_OFFSET_MIN)
    const a = await stateAt(fixtures.service!, at, false)
    const b = await stateAt(fixtures.service!, at, false)
    expect(a.cruise_day).toBe(2)
    expect(b).toEqual(a)
    // Simulation without latch must not finalize.
    const { data: controls } = await fixtures.service!.from('game_control').select('finalized_at_utc')
    expect((controls ?? []).every((r) => r.finalized_at_utc === null)).toBe(true)
  })

  it('6–7: simulated cutoff latches both games; later manual cannot reopen', async () => {
    if (!fixtures.available) return
    const cutoff = shipLocalToUtcIso(dayDate(7), '18:00:00', DEV_BASE_OFFSET_MIN)
    await stateAt(fixtures.service!, cutoff, true)

    const { data: controls } = await fixtures.service!.from('game_control').select('game, finalized_at_utc')
    expect(controls).toHaveLength(2)
    expect((controls ?? []).every((r) => r.finalized_at_utc !== null)).toBe(true)

    const after = shipLocalToUtcIso(dayDate(7), '19:00:00', DEV_BASE_OFFSET_MIN)
    await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: -60,
      p_at_utc: after,
    })

    const { data: accept } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'shipit',
      p_at_utc: after,
      p_apply_lifecycle_side_effects: true,
    })
    expect(accept.allowed).toBe(false)
    expect(accept.code).toBe('FINAL')
  })
})

describe('Phase 2A.1 Issue 2 — schedule rebuild timing', () => {
  it('8: Day2 +1h then Day5 +1h fire at correct UTC after Day2 has applied', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    await fixtures.service!.rpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: 2,
      p_delta_minutes: 60,
      p_enabled: true,
      p_at_utc: t0,
    })
    await fixtures.service!.rpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: 5,
      p_delta_minutes: 60,
      p_enabled: true,
      p_at_utc: t0,
    })

    // After Day 2 has fired (offset = base+60), Day 5 03:00 uses that preceding offset.
    const afterDay2 = shipLocalToUtcIso(dayDate(2), '12:00:00', DEV_BASE_OFFSET_MIN + 60)
    expect((await stateAt(fixtures.service!, afterDay2)).offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 60)

    const day5Before = shipLocalToUtcIso(dayDate(5), '02:59:00', DEV_BASE_OFFSET_MIN + 60)
    expect((await stateAt(fixtures.service!, day5Before)).offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 60)

    const day5At = shipLocalToUtcIso(dayDate(5), '03:00:00', DEV_BASE_OFFSET_MIN + 60)
    expect((await stateAt(fixtures.service!, day5At)).offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 120)

    const { data: ev } = await fixtures.service!.from('ship_clock_events').select('schedule_key, effective_at_utc, delta_minutes')
    const d5 = (ev ?? []).find((e) => e.schedule_key === 'plan:day:5')
    expect(sameUtcInstant(d5?.effective_at_utc, day5At)).toBe(true)
  })

  it('9: manual correction between scheduled transitions stays additive', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    await fixtures.service!.rpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: 2,
      p_delta_minutes: 60,
      p_enabled: true,
      p_at_utc: t0,
    })
    await fixtures.service!.rpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: 5,
      p_delta_minutes: 60,
      p_enabled: true,
      p_at_utc: t0,
    })

    const afterDay2 = shipLocalToUtcIso(dayDate(2), '12:00:00', DEV_BASE_OFFSET_MIN + 60)
    await stateAt(fixtures.service!, afterDay2)

    const manualAt = shipLocalToUtcIso(dayDate(3), '12:00:00', DEV_BASE_OFFSET_MIN + 60)
    await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: 60,
      p_at_utc: manualAt,
    })

    // Preceding offset for Day 5 = base + day2(+60) + manual(+60) = base+120
    const day5At = shipLocalToUtcIso(dayDate(5), '03:00:00', DEV_BASE_OFFSET_MIN + 120)
    expect((await stateAt(fixtures.service!, day5At)).offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 180)
  })

  it('10: out-of-order reads and repeated reads do not alter transition timing', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    await fixtures.service!.rpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: 2,
      p_delta_minutes: 60,
      p_enabled: true,
      p_at_utc: t0,
    })
    await fixtures.service!.rpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: 5,
      p_delta_minutes: 60,
      p_enabled: true,
      p_at_utc: t0,
    })

    const day5At = shipLocalToUtcIso(dayDate(5), '03:00:00', DEV_BASE_OFFSET_MIN + 60)
    const day2At = shipLocalToUtcIso(dayDate(2), '03:00:00', DEV_BASE_OFFSET_MIN)

    // Read Day 5 first (out of order), then Day 2, then Day 5 again.
    await stateAt(fixtures.service!, day5At)
    await stateAt(fixtures.service!, day2At)
    await stateAt(fixtures.service!, day5At)
    await stateAt(fixtures.service!, day5At)

    const { data: ev } = await fixtures
      .service!.from('ship_clock_events')
      .select('schedule_key, effective_at_utc, delta_minutes')
      .in('schedule_key', ['plan:day:2', 'plan:day:5'])

    const d2 = (ev ?? []).find((e) => e.schedule_key === 'plan:day:2')
    const d5 = (ev ?? []).find((e) => e.schedule_key === 'plan:day:5')
    expect(sameUtcInstant(d2?.effective_at_utc, day2At)).toBe(true)
    expect(sameUtcInstant(d5?.effective_at_utc, day5At)).toBe(true)
    expect(d2?.delta_minutes).toBe(60)
    expect(d5?.delta_minutes).toBe(60)
    expect((ev ?? []).filter((e) => e.schedule_key === 'plan:day:5')).toHaveLength(1)
  })

  it('historical events stay stable after future plan edit', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    await fixtures.service!.rpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: 2,
      p_delta_minutes: 60,
      p_enabled: true,
      p_at_utc: t0,
    })
    const afterDay2 = shipLocalToUtcIso(dayDate(2), '12:00:00', DEV_BASE_OFFSET_MIN + 60)
    const before = await stateAt(fixtures.service!, afterDay2)
    const { data: histBefore } = await fixtures
      .service!.from('ship_clock_events')
      .select('id, effective_at_utc, delta_minutes')
      .eq('schedule_key', 'plan:day:2')
      .single()

    await fixtures.service!.rpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: 5,
      p_delta_minutes: -60,
      p_enabled: true,
      p_at_utc: afterDay2,
    })

    const after = await stateAt(fixtures.service!, afterDay2)
    const { data: histAfter } = await fixtures
      .service!.from('ship_clock_events')
      .select('id, effective_at_utc, delta_minutes')
      .eq('schedule_key', 'plan:day:2')
      .single()

    expect(after.offset_minutes).toBe(before.offset_minutes)
    expect(histAfter).toEqual(histBefore)
  })
})

describe('Phase 2A.1 Issue 3 — receipt time', () => {
  it('production acceptance path reports server receipt distinct from client fantasy time', async () => {
    if (!fixtures.available) return
    const player = await signInAs(fixtures, 'both')
    const { data, error } = await player.rpc('evaluate_submission_acceptance', {
      p_game: 'drinkit',
    })
    expect(error).toBeNull()
    expect(data.received_at_utc).toBe(data.evaluated_at_utc)
    expect(new Date(data.received_at_utc).getUTCFullYear()).toBeLessThan(2099)

    const { data: captured } = await fixtures.service!.rpc('capture_submission_receipt_time')
    expect(captured).toBeTruthy()
    expect(new Date(captured as string).getTime()).toBeGreaterThan(0)
  })
})
