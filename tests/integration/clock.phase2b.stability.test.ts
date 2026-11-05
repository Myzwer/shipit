/**
 * Phase 2B — stable clock reads (no rebuild on ordinary evaluation).
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

describe('Phase 2B Task 1 — stable clock reads', () => {
  it('1: repeated reads keep stable scheduled event IDs', async () => {
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

    const { data: before } = await fixtures
      .service!.from('ship_clock_events')
      .select('id, schedule_key, effective_at_utc')
      .in('schedule_key', ['plan:day:2', 'plan:day:5'])
      .order('schedule_key')

    expect(before).toHaveLength(2)
    const idsBefore = (before ?? []).map((e) => e.id)

    const mid = shipLocalToUtcIso(dayDate(2), '12:00:00', DEV_BASE_OFFSET_MIN + 60)
    for (let i = 0; i < 5; i++) {
      await stateAt(fixtures.service!, mid, false)
      await stateAt(fixtures.service!, mid, true)
    }

    const player = await signInAs(fixtures, 'both')
    for (let i = 0; i < 3; i++) {
      const { error } = await player.rpc('get_ship_clock_state')
      expect(error).toBeNull()
    }

    const { data: after } = await fixtures
      .service!.from('ship_clock_events')
      .select('id, schedule_key, effective_at_utc')
      .in('schedule_key', ['plan:day:2', 'plan:day:5'])
      .order('schedule_key')

    expect((after ?? []).map((e) => e.id)).toEqual(idsBefore)
    expect(after).toEqual(before)
  })

  it('2: concurrent clock reads do not conflict or duplicate events', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    await fixtures.service!.rpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: 3,
      p_delta_minutes: -60,
      p_enabled: true,
      p_at_utc: t0,
    })

    const { data: before } = await fixtures
      .service!.from('ship_clock_events')
      .select('id')
      .eq('schedule_key', 'plan:day:3')
    expect(before).toHaveLength(1)

    const playerA = await signInAs(fixtures, 'both')
    const playerB = await signInAs(fixtures, 'drink_only')
    const at = shipLocalToUtcIso(dayDate(3), '12:00:00', DEV_BASE_OFFSET_MIN - 60)

    const results = await Promise.all([
      playerA.rpc('get_ship_clock_state'),
      playerB.rpc('get_ship_clock_state'),
      stateAt(fixtures.service!, at, true),
      stateAt(fixtures.service!, at, false),
      fixtures.service!.rpc('get_ship_clock_state'),
    ])

    for (const r of results.slice(0, 2)) {
      expect(r.error).toBeNull()
    }
    expect(results[2].offset_minutes).toBe(DEV_BASE_OFFSET_MIN - 60)

    const { data: after } = await fixtures
      .service!.from('ship_clock_events')
      .select('id')
      .eq('schedule_key', 'plan:day:3')
    expect(after).toHaveLength(1)
    expect(after![0].id).toBe(before![0].id)
  })

  it('3–7: manual ±1h, set-time, scheduled follow-on, future plan edit, history immutable', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    await fixtures.service!.rpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: 4,
      p_delta_minutes: 60,
      p_enabled: true,
      p_at_utc: t0,
    })

    const { data: preview } = await fixtures.service!.rpc('admin_preview_manual_clock_correction', {
      p_delta_minutes: 60,
      p_at_utc: t0,
    })
    expect(preview.after_offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 60)

    const { data: plus } = await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: 60,
      p_at_utc: t0,
      p_note: '2b +1h',
    })
    expect(plus.after.offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 60)

    const minusAt = shipLocalToUtcIso(dayDate(1), '11:00:00', DEV_BASE_OFFSET_MIN + 60)
    const { data: minus } = await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: -60,
      p_at_utc: minusAt,
      p_note: '2b -1h',
    })
    expect(minus.after.offset_minutes).toBe(DEV_BASE_OFFSET_MIN)

    const setAt = shipLocalToUtcIso(dayDate(1), '12:00:00', DEV_BASE_OFFSET_MIN)
    const { data: setResult } = await fixtures.service!.rpc('admin_apply_manual_clock_set', {
      p_target_ship_local: `${dayDate(1)}T15:00:00`,
      p_at_utc: setAt,
      p_note: '2b set',
    })
    expect(setResult.after.offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 180)

    const afterSched = await stateAt(
      fixtures.service!,
      shipLocalToUtcIso(dayDate(4), '12:00:00', DEV_BASE_OFFSET_MIN + 240),
    )
    expect(afterSched.offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 240)

    const { data: histBefore } = await fixtures
      .service!.from('ship_clock_events')
      .select('id, delta_minutes, effective_at_utc')
      .eq('schedule_key', 'plan:day:4')
      .single()

    await fixtures.service!.rpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: 4,
      p_delta_minutes: 120,
      p_enabled: true,
      p_at_utc: shipLocalToUtcIso(dayDate(4), '12:00:00', DEV_BASE_OFFSET_MIN + 240),
    })

    const { data: histAfter } = await fixtures
      .service!.from('ship_clock_events')
      .select('id, delta_minutes, effective_at_utc')
      .eq('schedule_key', 'plan:day:4')
      .single()
    expect(histAfter).toEqual(histBefore)

    await fixtures.service!.rpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: 6,
      p_delta_minutes: -60,
      p_enabled: true,
      p_at_utc: shipLocalToUtcIso(dayDate(4), '12:00:00', DEV_BASE_OFFSET_MIN + 240),
    })
    const { data: future } = await fixtures
      .service!.from('ship_clock_events')
      .select('delta_minutes')
      .eq('schedule_key', 'plan:day:6')
      .maybeSingle()
    expect(future?.delta_minutes).toBe(-60)
  })

  it('8–9: preview does not mutate; non-admin mutations fail', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    const { data: eventsBefore } = await fixtures.service!.from('ship_clock_events').select('id')

    await fixtures.service!.rpc('admin_preview_manual_clock_correction', {
      p_delta_minutes: 60,
      p_at_utc: t0,
    })
    const { data: eventsAfterPreview } = await fixtures.service!.from('ship_clock_events').select('id')
    expect(eventsAfterPreview).toEqual(eventsBefore)

    const player = await signInAs(fixtures, 'both')
    expect(
      (await player.rpc('admin_apply_manual_clock_correction', { p_delta_minutes: 60 })).error,
    ).toBeTruthy()
    expect(
      (
        await player.rpc('admin_upsert_ship_clock_plan_day', {
          p_day_number: 2,
          p_delta_minutes: 60,
          p_enabled: true,
        })
      ).error,
    ).toBeTruthy()
  })

  it('11: Friday finale stays closed after manual correction', async () => {
    if (!fixtures.available) return
    const cutoff = shipLocalToUtcIso(dayDate(7), '18:00:00', DEV_BASE_OFFSET_MIN)
    await stateAt(fixtures.service!, cutoff, true)
    const after = shipLocalToUtcIso(dayDate(7), '19:00:00', DEV_BASE_OFFSET_MIN)
    await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: -60,
      p_at_utc: after,
    })
    const { data: accept } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'drinkit',
      p_at_utc: after,
      p_apply_lifecycle_side_effects: true,
    })
    expect(accept.allowed).toBe(false)
    expect(accept.code).toBe('FINAL')
  })

  it('normal admin JWT ignores forged evaluation timestamps', async () => {
    if (!fixtures.available) return
    const admin = await signInAs(fixtures, 'admin')
    const forged = shipLocalToUtcIso(dayDate(7), '18:00:00', DEV_BASE_OFFSET_MIN)
    const { data, error } = await admin.rpc('admin_get_clock_diagnostics', { p_at_utc: forged })
    expect(error).toBeNull()
    expect(data.state.lifecycle).toBe('pre_cruise')
    expect(new Date(data.state.at_utc).getUTCFullYear()).toBeLessThan(2099)

    const { data: controls } = await fixtures.service!.from('game_control').select('finalized_at_utc')
    expect((controls ?? []).every((c) => c.finalized_at_utc === null)).toBe(true)
  })
})
