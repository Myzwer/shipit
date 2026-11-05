/**
 * Phase 2B.1 — atomic plan save + request-id correction reconcile.
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

const sevenDays = (
  overrides: Partial<Record<number, { delta_minutes: number; enabled: boolean }>> = {},
) =>
  [1, 2, 3, 4, 5, 6, 7].map((day_number) => ({
    day_number,
    delta_minutes: overrides[day_number]?.delta_minutes ?? 0,
    enabled: overrides[day_number]?.enabled ?? true,
  }))

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

describe('Phase 2B.1 atomic plan save', () => {
  it('saves seven valid plan entries together', async () => {
    if (!fixtures.available) return
    const { data, error } = await fixtures.service!.rpc('admin_save_ship_clock_plan', {
      p_days: sevenDays({
        2: { delta_minutes: 60, enabled: true },
        5: { delta_minutes: -60, enabled: true },
        7: { delta_minutes: 0, enabled: false },
      }),
      p_at_utc: shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN),
    })
    expect(error).toBeNull()
    expect(data.changed).toBe(true)
    expect(data.plan).toHaveLength(7)
    expect(data.plan.find((p: { day_number: number }) => p.day_number === 2)).toMatchObject({
      delta_minutes: 60,
      enabled: true,
    })
    expect(data.plan.find((p: { day_number: number }) => p.day_number === 7)).toMatchObject({
      delta_minutes: 0,
      enabled: false,
    })
  })

  it('invalid Day 4 entry causes zero changes', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    await fixtures.service!.rpc('admin_save_ship_clock_plan', {
      p_days: sevenDays({ 2: { delta_minutes: 60, enabled: true } }),
      p_at_utc: t0,
    })
    const { data: before } = await fixtures.service!.from('ship_clock_plan').select('*')

    const bad = sevenDays({ 2: { delta_minutes: 60, enabled: true } })
    bad[3] = { day_number: 4, delta_minutes: 99 as number, enabled: true }
    const { error } = await fixtures.service!.rpc('admin_save_ship_clock_plan', {
      p_days: bad,
      p_at_utc: t0,
    })
    expect(error).toBeTruthy()

    const { data: after } = await fixtures.service!.from('ship_clock_plan').select('*')
    expect(after).toEqual(before)
  })

  it('preserves previous schedule when transaction would fail; history immutable', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    await fixtures.service!.rpc('admin_save_ship_clock_plan', {
      p_days: sevenDays({ 2: { delta_minutes: 60, enabled: true } }),
      p_at_utc: t0,
    })
    const afterDay2 = shipLocalToUtcIso(dayDate(2), '12:00:00', DEV_BASE_OFFSET_MIN + 60)
    await stateAt(fixtures.service!, afterDay2)
    const { data: histBefore } = await fixtures
      .service!.from('ship_clock_events')
      .select('id, delta_minutes, effective_at_utc')
      .eq('schedule_key', 'plan:day:2')
      .single()

    const incomplete = sevenDays().slice(0, 6)
    const { error } = await fixtures.service!.rpc('admin_save_ship_clock_plan', {
      p_days: incomplete,
      p_at_utc: afterDay2,
    })
    expect(error).toBeTruthy()

    const { data: histAfter } = await fixtures
      .service!.from('ship_clock_events')
      .select('id, delta_minutes, effective_at_utc')
      .eq('schedule_key', 'plan:day:2')
      .single()
    expect(histAfter).toEqual(histBefore)

    const { data: plan } = await fixtures.service!.from('ship_clock_plan').select('day_number, delta_minutes, enabled')
    expect(plan?.find((p) => p.day_number === 2)).toMatchObject({ delta_minutes: 60, enabled: true })
  })

  it('disabled and zero-hour entries round-trip distinctly', async () => {
    if (!fixtures.available) return
    const { data, error } = await fixtures.service!.rpc('admin_save_ship_clock_plan', {
      p_days: sevenDays({
        1: { delta_minutes: 0, enabled: false },
        2: { delta_minutes: 0, enabled: true },
        3: { delta_minutes: 60, enabled: true },
      }),
    })
    expect(error).toBeNull()
    const d1 = data.plan.find((p: { day_number: number }) => p.day_number === 1)
    const d2 = data.plan.find((p: { day_number: number }) => p.day_number === 2)
    expect(d1).toMatchObject({ delta_minutes: 0, enabled: false })
    expect(d2).toMatchObject({ delta_minutes: 0, enabled: true })
    expect(d1.enabled).not.toBe(d2.enabled)
  })

  it('unchanged save does not regenerate future event IDs', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    const payload = sevenDays({ 2: { delta_minutes: 60, enabled: true }, 5: { delta_minutes: 60, enabled: true } })
    const first = await fixtures.service!.rpc('admin_save_ship_clock_plan', { p_days: payload, p_at_utc: t0 })
    expect(first.error).toBeNull()
    expect(first.data.changed).toBe(true)
    const ids1 = first.data.future_event_ids_after as string[]

    const second = await fixtures.service!.rpc('admin_save_ship_clock_plan', { p_days: payload, p_at_utc: t0 })
    expect(second.error).toBeNull()
    expect(second.data.changed).toBe(false)
    expect(second.data.rebuilt).toBe(false)
    expect(second.data.future_event_ids_after).toEqual(ids1)
  })

  it('non-admin cannot use bulk plan save', async () => {
    if (!fixtures.available) return
    const player = await signInAs(fixtures, 'both')
    const { error } = await player.rpc('admin_save_ship_clock_plan', { p_days: sevenDays() })
    expect(error).toBeTruthy()
  })

  it('concurrent privileged ops preserve consistency', async () => {
    if (!fixtures.available) return
    const t0 = shipLocalToUtcIso(dayDate(1), '10:00:00', DEV_BASE_OFFSET_MIN)
    const results = await Promise.all([
      fixtures.service!.rpc('admin_save_ship_clock_plan', {
        p_days: sevenDays({ 2: { delta_minutes: 60, enabled: true } }),
        p_at_utc: t0,
      }),
      fixtures.service!.rpc('admin_apply_manual_clock_correction', {
        p_delta_minutes: 60,
        p_at_utc: t0,
        p_client_request_id: '11111111-1111-4111-8111-111111111111',
      }),
      fixtures.service!.rpc('admin_save_ship_clock_plan', {
        p_days: sevenDays({ 5: { delta_minutes: -60, enabled: true } }),
        p_at_utc: t0,
      }),
    ])
    expect(results.every((r) => r.error == null)).toBe(true)

    const { data: plan } = await fixtures.service!.from('ship_clock_plan').select('day_number, delta_minutes, enabled')
    expect(plan).toHaveLength(7)
    const { data: manuals } = await fixtures
      .service!.from('ship_clock_events')
      .select('id')
      .eq('source', 'manual_delta')
    expect((manuals ?? []).length).toBeGreaterThanOrEqual(1)
  })
})

describe('Phase 2B.1 request-id correction reconcile', () => {
  it('idempotent replay of same client_request_id does not double-apply', async () => {
    if (!fixtures.available) return
    const req = '22222222-2222-4222-8222-222222222222'
    const t0 = shipLocalToUtcIso(dayDate(1), '12:00:00', DEV_BASE_OFFSET_MIN)
    const first = await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: 60,
      p_at_utc: t0,
      p_client_request_id: req,
    })
    expect(first.error).toBeNull()
    expect(first.data.after.offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 60)

    const second = await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: 60,
      p_at_utc: t0,
      p_client_request_id: req,
    })
    expect(second.error).toBeNull()
    expect(second.data.idempotent_replay).toBe(true)
    expect(second.data.after.offset_minutes).toBe(DEV_BASE_OFFSET_MIN + 60)

    const { data: events } = await fixtures
      .service!.from('ship_clock_events')
      .select('id')
      .eq('client_request_id', req)
    expect(events).toHaveLength(1)
  })

  it('find-by-request-id locates applied correction', async () => {
    if (!fixtures.available) return
    const req = '33333333-3333-4333-8333-333333333333'
    await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: -60,
      p_client_request_id: req,
      p_at_utc: shipLocalToUtcIso(dayDate(1), '13:00:00', DEV_BASE_OFFSET_MIN),
    })
    const { data, error } = await fixtures.service!.rpc('admin_find_clock_event_by_request_id', {
      p_client_request_id: req,
    })
    expect(error).toBeNull()
    expect(data.client_request_id).toBe(req)
    expect(data.delta_minutes).toBe(-60)
  })

  it('set_time idempotent replay does not double-apply', async () => {
    if (!fixtures.available) return
    const req = '66666666-6666-4666-8666-666666666666'
    const t0 = shipLocalToUtcIso(dayDate(1), '15:00:00', DEV_BASE_OFFSET_MIN)
    const target = `${dayDate(1)}T16:30:00`
    const first = await fixtures.service!.rpc('admin_apply_manual_clock_set', {
      p_target_ship_local: target,
      p_at_utc: t0,
      p_client_request_id: req,
    })
    expect(first.error).toBeNull()
    const offsetAfter = first.data.after.offset_minutes

    const second = await fixtures.service!.rpc('admin_apply_manual_clock_set', {
      p_target_ship_local: target,
      p_at_utc: t0,
      p_client_request_id: req,
    })
    expect(second.error).toBeNull()
    expect(second.data.idempotent_replay).toBe(true)
    expect(second.data.after.offset_minutes).toBe(offsetAfter)

    const { data: events } = await fixtures
      .service!.from('ship_clock_events')
      .select('id, client_request_fingerprint')
      .eq('client_request_id', req)
    expect(events).toHaveLength(1)
    expect(events![0].client_request_fingerprint).toBe(`manual_set:${target}`)
  })

  it('reused request id with different operation is rejected', async () => {
    if (!fixtures.available) return
    const req = '55555555-5555-4555-8555-555555555555'
    const t0 = shipLocalToUtcIso(dayDate(1), '14:00:00', DEV_BASE_OFFSET_MIN)
    const first = await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: 60,
      p_at_utc: t0,
      p_client_request_id: req,
    })
    expect(first.error).toBeNull()

    const mismatch = await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: -60,
      p_at_utc: t0,
      p_client_request_id: req,
    })
    expect(mismatch.error).toBeTruthy()
    expect(mismatch.error?.message ?? '').toMatch(/REQUEST_ID_OPERATION_MISMATCH/)

    const setMismatch = await fixtures.service!.rpc('admin_apply_manual_clock_set', {
      p_target_ship_local: `${dayDate(1)}T16:00:00`,
      p_at_utc: t0,
      p_client_request_id: req,
    })
    expect(setMismatch.error).toBeTruthy()
    expect(setMismatch.error?.message ?? '').toMatch(/REQUEST_ID_OPERATION_MISMATCH/)

    const { data: events } = await fixtures
      .service!.from('ship_clock_events')
      .select('delta_minutes')
      .eq('client_request_id', req)
    expect(events).toHaveLength(1)
    expect(events![0].delta_minutes).toBe(60)
  })

  it('Friday finale remains closed after correction', async () => {
    if (!fixtures.available) return
    const cutoff = shipLocalToUtcIso(dayDate(7), '18:00:00', DEV_BASE_OFFSET_MIN)
    await stateAt(fixtures.service!, cutoff, true)
    await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: -60,
      p_at_utc: shipLocalToUtcIso(dayDate(7), '19:00:00', DEV_BASE_OFFSET_MIN),
      p_client_request_id: '44444444-4444-4444-8444-444444444444',
    })
    const { data: accept } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'drinkit',
      p_at_utc: shipLocalToUtcIso(dayDate(7), '19:00:00', DEV_BASE_OFFSET_MIN),
      p_apply_lifecycle_side_effects: true,
    })
    expect(accept.allowed).toBe(false)
    expect(accept.code).toBe('FINAL')
  })
})
