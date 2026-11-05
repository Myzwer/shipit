/**
 * Phase 2A Ship Clock + lifecycle integration tests (local Supabase).
 * Uses service-role dev_* evaluators for deterministic timestamps.
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
import { identity, signInAs } from '../helpers/localSupabase'

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

async function setPlanDay(day: number, delta: number, atUtc: string) {
  const { error } = await fixtures.service!.rpc('admin_upsert_ship_clock_plan_day', {
    p_day_number: day,
    p_delta_minutes: delta,
    p_enabled: true,
    p_at_utc: atUtc,
  })
  expect(error).toBeNull()
}

beforeAll(async () => {
  fixtures = await loadClockFixtures()
})

beforeEach(async () => {
  if (!fixtures.available) return
  fixtures.admin = await signInAs(fixtures, 'admin')
  await seedFresh()
})

describe('Phase 2A Ship Clock', () => {
  it('reports fixture availability', () => {
    expect(typeof fixtures.available).toBe('boolean')
    if (fixtures.password) expect(fixtures.available).toBe(true)
  })

  it('A: maps Saturday Day 1 through Friday Day 7', async () => {
    if (!fixtures.available) return
    for (let day = 1; day <= 7; day++) {
      const iso = shipLocalToUtcIso(dayDate(day), '12:00:00', DEV_BASE_OFFSET_MIN)
      const s = await stateAt(fixtures.service!, iso)
      expect(s.cruise_day).toBe(day)
      expect(s.ship_date).toBe(dayDate(day))
      expect(s.lifecycle).toBe('active')
      expect(s.accepting_submissions).toBe(true)
    }
    const before = shipLocalToUtcIso('2099-01-02', '12:00:00', DEV_BASE_OFFSET_MIN)
    const pre = await stateAt(fixtures.service!, before)
    expect(pre.lifecycle).toBe('pre_cruise')
    expect(pre.cruise_day).toBeNull()
  })

  it('B: scheduled forward +1h at Day 2 03:00 ship-local', async () => {
    if (!fixtures.available) return
    const beforePlan = shipLocalToUtcIso(dayDate(1), '12:00:00', DEV_BASE_OFFSET_MIN)
    await setPlanDay(2, 60, beforePlan)

    const beforeChange = shipLocalToUtcIso(dayDate(2), '02:59:00', DEV_BASE_OFFSET_MIN)
    expect((await stateAt(fixtures.service!, beforeChange)).offset_minutes).toBe(DEV_BASE_OFFSET_MIN)

    const afterChange = shipLocalToUtcIso(dayDate(2), '03:00:00', DEV_BASE_OFFSET_MIN)
    expect((await stateAt(fixtures.service!, afterChange)).offset_minutes).toBe(
      DEV_BASE_OFFSET_MIN + 60,
    )

    const noonAfter = shipLocalToUtcIso(dayDate(2), '12:00:00', DEV_BASE_OFFSET_MIN + 60)
    const noon = await stateAt(fixtures.service!, noonAfter)
    expect(noon.cruise_day).toBe(2)
    expect(noon.offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 60)
  })

  it('C: scheduled backward −1h including repeated local hour', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '12:00:00', DEV_BASE_OFFSET_MIN)
    await setPlanDay(3, -60, t0)

    const at3am = shipLocalToUtcIso(dayDate(3), '03:00:00', DEV_BASE_OFFSET_MIN)
    expect((await stateAt(fixtures.service!, at3am)).offset_minutes).toBe(DEV_BASE_OFFSET_MIN - 60)

    const { data: events } = await fixtures.service!.from('ship_clock_events').select('schedule_key')
    expect((events ?? []).filter((e) => e.schedule_key === 'plan:day:3')).toHaveLength(1)

    const repeated = shipLocalToUtcIso(dayDate(3), '02:30:00', DEV_BASE_OFFSET_MIN - 60)
    expect((await stateAt(fixtures.service!, repeated)).cruise_day).toBe(3)
  })

  it('D: forward and backward 2-hour scheduled changes', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    await setPlanDay(2, 120, t0)
    await setPlanDay(4, -120, t0)

    const afterFwd = await stateAt(
      fixtures.service!,
      shipLocalToUtcIso(dayDate(2), '12:00:00', DEV_BASE_OFFSET_MIN + 120),
    )
    expect(afterFwd.offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 120)

    const afterBack = await stateAt(
      fixtures.service!,
      shipLocalToUtcIso(dayDate(4), '12:00:00', DEV_BASE_OFFSET_MIN),
    )
    expect(afterBack.offset_minutes).toBe(DEV_BASE_OFFSET_MIN)
  })

  it('E: two scheduled changes in the same direction on different days', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    await setPlanDay(2, 60, t0)
    await setPlanDay(5, 60, t0)

    const d2 = await stateAt(
      fixtures.service!,
      shipLocalToUtcIso(dayDate(2), '12:00:00', DEV_BASE_OFFSET_MIN + 60),
    )
    expect(d2.offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 60)

    const d5 = await stateAt(
      fixtures.service!,
      shipLocalToUtcIso(dayDate(5), '12:00:00', DEV_BASE_OFFSET_MIN + 120),
    )
    expect(d5.offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 120)
  })

  it('F: schedule evaluation is idempotent — adjustment never applies twice', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    await setPlanDay(2, 60, t0)

    const afterUtc = shipLocalToUtcIso(dayDate(2), '03:00:00', DEV_BASE_OFFSET_MIN)
    await stateAt(fixtures.service!, afterUtc)
    await stateAt(fixtures.service!, afterUtc)
    await setPlanDay(2, 60, afterUtc)

    const { data: cfg } = await fixtures.service!.from('cruise_config').select('id').eq('is_active', true).single()
    const { data: events } = await fixtures
      .service!.from('ship_clock_events')
      .select('schedule_key')
      .eq('cruise_config_id', cfg!.id)
    expect((events ?? []).filter((e) => e.schedule_key === 'plan:day:2')).toHaveLength(1)
    expect(
      (await stateAt(fixtures.service!, shipLocalToUtcIso(dayDate(2), '12:00:00', DEV_BASE_OFFSET_MIN + 60)))
        .offset_minutes,
    ).toBe(DEV_BASE_OFFSET_MIN + 60)
  })

  it('G: manual correction then scheduled change preserves both', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    await setPlanDay(3, 60, t0)

    const manualAt = shipLocalToUtcIso(dayDate(1), '15:00:00', DEV_BASE_OFFSET_MIN)
    const { data: applied, error } = await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: 60,
      p_note: 'test manual +1h',
      p_at_utc: manualAt,
    })
    expect(error).toBeNull()
    expect(applied.after.offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 60)

    const afterSched = await stateAt(
      fixtures.service!,
      shipLocalToUtcIso(dayDate(3), '12:00:00', DEV_BASE_OFFSET_MIN + 120),
    )
    expect(afterSched.offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 120)
  })

  it('H: editing future plan does not alter historical segments', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    await setPlanDay(2, 60, t0)

    const afterDay2 = shipLocalToUtcIso(dayDate(2), '12:00:00', DEV_BASE_OFFSET_MIN + 60)
    expect((await stateAt(fixtures.service!, afterDay2)).offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 60)

    await setPlanDay(2, 120, afterDay2)
    expect((await stateAt(fixtures.service!, afterDay2)).offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 60)

    const { data: cfgH } = await fixtures.service!.from('cruise_config').select('id').eq('is_active', true).single()
    const { data: day2Events } = await fixtures
      .service!.from('ship_clock_events')
      .select('delta_minutes')
      .eq('cruise_config_id', cfgH!.id)
      .eq('schedule_key', 'plan:day:2')
    expect(day2Events).toHaveLength(1)
    expect(day2Events![0].delta_minutes).toBe(60)

    await setPlanDay(5, -60, afterDay2)
    const { data: future } = await fixtures
      .service!.from('ship_clock_events')
      .select('delta_minutes')
      .eq('schedule_key', 'plan:day:5')
      .maybeSingle()
    expect(future?.delta_minutes).toBe(-60)
  })

  it('I: identical authoritative state for different client evaluations', async () => {
    if (!fixtures.available) return
    const at = shipLocalToUtcIso(dayDate(4), '16:30:00', DEV_BASE_OFFSET_MIN)
    const a = await stateAt(fixtures.service!, at)
    const b = await stateAt(fixtures.service!, at)
    expect(b.ship_local).toBe(a.ship_local)
    expect(b.cruise_day).toBe(a.cruise_day)
    expect(b.offset_minutes).toBe(a.offset_minutes)
    expect(b.finale_at_utc).toBe(a.finale_at_utc)
  })

  it('J: Friday 5:59:59 PM accepts; exactly 6:00:00 PM rejects', async () => {
    if (!fixtures.available) return
    const before = shipLocalToUtcIso(dayDate(7), '17:59:59', DEV_BASE_OFFSET_MIN)
    const atCutoff = shipLocalToUtcIso(dayDate(7), '18:00:00', DEV_BASE_OFFSET_MIN)

    const { data: ok } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'drinkit',
      p_at_utc: before,
      p_apply_lifecycle_side_effects: true,
    })
    expect(ok.allowed).toBe(true)
    expect(ok.code).toBe('OK')

    const { data: closed } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'shipit',
      p_at_utc: atCutoff,
      p_apply_lifecycle_side_effects: true,
    })
    expect(closed.allowed).toBe(false)
    expect(closed.code).toBe('FINAL')

    const s = await stateAt(fixtures.service!, atCutoff, true)
    expect(s.finalized).toBe(true)
    expect(s.accepting_submissions).toBe(false)
  })

  it('K: manual backward correction after finalization does not reopen games', async () => {
    if (!fixtures.available) return
    const atCutoff = shipLocalToUtcIso(dayDate(7), '18:00:00', DEV_BASE_OFFSET_MIN)
    await stateAt(fixtures.service!, atCutoff, true)

    const after = shipLocalToUtcIso(dayDate(7), '18:30:00', DEV_BASE_OFFSET_MIN)
    const { error } = await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: -60,
      p_note: 'attempt reopen',
      p_at_utc: after,
    })
    expect(error).toBeNull()

    const { data: accept } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'drinkit',
      p_at_utc: after,
      p_apply_lifecycle_side_effects: true,
    })
    expect(accept.allowed).toBe(false)
    expect(accept.code).toBe('FINAL')

    const { data: controls } = await fixtures.service!.from('game_control').select('finalized_at_utc')
    expect((controls ?? []).every((c) => c.finalized_at_utc !== null)).toBe(true)
  })

  it('L: ordinary player cannot change clock, plan, or lifecycle', async () => {
    if (!fixtures.available || !fixtures.summary) return
    const player = await signInAs(fixtures, 'both')
    const t0 = shipLocalToUtcIso(dayDate(1), '12:00:00', DEV_BASE_OFFSET_MIN)

    expect(
      (await player.rpc('admin_apply_manual_clock_correction', { p_delta_minutes: 60, p_at_utc: t0 }))
        .error,
    ).toBeTruthy()
    expect(
      (
        await player.rpc('admin_upsert_ship_clock_plan_day', {
          p_day_number: 2,
          p_delta_minutes: 60,
          p_enabled: true,
          p_at_utc: t0,
        })
      ).error,
    ).toBeTruthy()
    expect(
      (
        await player.rpc('admin_apply_manual_clock_set', {
          p_target_ship_local: `${dayDate(1)}T20:00:00`,
          p_at_utc: t0,
        })
      ).error,
    ).toBeTruthy()

    const { data: upd } = await player.from('game_control').update({ status: 'final' }).eq('game', 'drinkit').select()
    expect(upd ?? []).toEqual([])

    expect(
      (
        await player.rpc('dev_seed_cruise_clock', {
          p_day1_ship_date: DEV_DAY1,
          p_base_offset_minutes: 0,
          p_label: 'development-only',
        })
      ).error,
    ).toBeTruthy()
  })

  it('M: admin actions are audited', async () => {
    if (!fixtures.available) return
    await fixtures.admin!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: -60,
      p_note: 'audit me',
    })
    await fixtures.admin!.rpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: 6,
      p_delta_minutes: 120,
      p_enabled: true,
    })

    const { data: logs, error } = await fixtures.admin!.from('admin_audit_log').select('action, actor_id')
    expect(error).toBeNull()
    const actions = (logs ?? []).map((l) => l.action)
    expect(actions).toEqual(expect.arrayContaining(['clock.manual_delta', 'clock.plan_upsert']))

    const adminId = identity(fixtures.summary!, 'admin').player_id
    expect((logs ?? []).every((l) => l.actor_id === adminId)).toBe(true)

    const player = await signInAs(fixtures, 'drink_only')
    const { data: hidden } = await player.from('admin_audit_log').select('id')
    expect(hidden ?? []).toEqual([])
  })

  it('supports emergency set-to-displayed-time', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '12:00:00', DEV_BASE_OFFSET_MIN)
    const { data: setResult, error } = await fixtures.service!.rpc('admin_apply_manual_clock_set', {
      p_target_ship_local: `${dayDate(1)}T14:00:00`,
      p_note: 'set display',
      p_at_utc: t0,
    })
    expect(error).toBeNull()
    expect(setResult.after.offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 120)
    expect(setResult.after.ship_local).toBe(`${dayDate(1)}T14:00:00`)
  })
})
