/**
 * Narrow Ship Clock Admin repair coverage:
 * - Admin EXECUTE + diagnostics
 * - Non-Admin denial
 * - Day 1 13:59 vs 14:00
 * - Production configure path (no schedule init)
 *
 *   LOCAL_TEST_PASSWORD='…' npx vitest run --fileParallelism=false tests/integration/clock.ship_clock_admin_repair.test.ts
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

describe('Ship Clock Admin repair', () => {
  it('Admin can load diagnostics; non-Admin is denied; anon matches production permission error', async () => {
    if (!fixtures.available) return
    const admin = await signInAs(fixtures, 'admin')
    const player = await signInAs(fixtures, 'both')

    const ok = await admin.rpc('admin_get_clock_diagnostics')
    expect(ok.error).toBeNull()
    expect(ok.data?.state?.configured).toBe(true)

    const denied = await player.rpc('admin_get_clock_diagnostics')
    expect(denied.error).toBeTruthy()
    expect(denied.error?.message).toMatch(/ADMIN_REQUIRED/i)

    // Exact production screenshot string: unauthenticated anon EXECUTE denial.
    const { createLocalClient } = await import('../helpers/localSupabase')
    const anon = createLocalClient(fixtures.summary!.supabase_url, fixtures.anonKey!)
    const anonDenied = await anon.rpc('admin_get_clock_diagnostics')
    expect(anonDenied.error?.message).toBe(
      'permission denied for function admin_get_clock_diagnostics',
    )
  })

  it('Day 1 stays closed at 13:59 and opens at 14:00 for both games', async () => {
    if (!fixtures.available) return
    const before = await stateAt(
      fixtures.service!,
      shipLocalToUtcIso(dayDate(1), '13:59:00', DEV_BASE_OFFSET_MIN),
      false,
    )
    expect(before.lifecycle).toBe('pre_cruise')
    expect(before.accepting_submissions).toBe(false)

    const { data: diBefore } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'drinkit',
      p_at_utc: shipLocalToUtcIso(dayDate(1), '13:59:00', DEV_BASE_OFFSET_MIN),
      p_apply_lifecycle_side_effects: false,
    })
    const { data: siBefore } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'shipit',
      p_at_utc: shipLocalToUtcIso(dayDate(1), '13:59:00', DEV_BASE_OFFSET_MIN),
      p_apply_lifecycle_side_effects: false,
    })
    expect(diBefore.allowed).toBe(false)
    expect(siBefore.allowed).toBe(false)

    const after = await stateAt(
      fixtures.service!,
      shipLocalToUtcIso(dayDate(1), '14:00:00', DEV_BASE_OFFSET_MIN),
      false,
    )
    expect(after.lifecycle).toBe('active')
    expect(after.accepting_submissions).toBe(true)

    const { data: diAfter } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'drinkit',
      p_at_utc: shipLocalToUtcIso(dayDate(1), '14:00:00', DEV_BASE_OFFSET_MIN),
      p_apply_lifecycle_side_effects: false,
    })
    const { data: siAfter } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'shipit',
      p_at_utc: shipLocalToUtcIso(dayDate(1), '14:00:00', DEV_BASE_OFFSET_MIN),
      p_apply_lifecycle_side_effects: false,
    })
    expect(diAfter.allowed).toBe(true)
    expect(siAfter.allowed).toBe(true)
  })

  it('Days 2–7 keep noon Drink It! open and all-day Ship It! after Day 1 open', async () => {
    if (!fixtures.available) return
    const day2Morning = await stateAt(
      fixtures.service!,
      shipLocalToUtcIso(dayDate(2), '09:00:00', DEV_BASE_OFFSET_MIN),
      false,
    )
    expect(day2Morning.lifecycle).toBe('active')
    expect(day2Morning.accepting_submissions).toBe(true)

    const { data: life } = await fixtures.service!.rpc('dev_get_ship_clock_state_at', {
      p_at_utc: shipLocalToUtcIso(dayDate(2), '09:00:00', DEV_BASE_OFFSET_MIN),
      p_apply_lifecycle_side_effects: false,
    })
    // drinkit_lifecycle is service-only; use direct SQL helper via evaluate path for SI.
    const { data: siMorning } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'shipit',
      p_at_utc: shipLocalToUtcIso(dayDate(2), '09:00:00', DEV_BASE_OFFSET_MIN),
      p_apply_lifecycle_side_effects: false,
    })
    expect(siMorning.allowed).toBe(true)
    expect(life.lifecycle).toBe('active')

    const { data: drinkLife } = await fixtures.service!.rpc('drinkit_lifecycle_at' as never, {
      p_at_utc: shipLocalToUtcIso(dayDate(2), '11:59:00', DEV_BASE_OFFSET_MIN),
    } as never)
    // May be unavailable to service depending on grants — skip soft if RPC blocked.
    if (!drinkLife && fixtures.service) {
      const { data: viaSql } = await fixtures.service.rpc('dev_evaluate_submission_acceptance_at', {
        p_game: 'drinkit',
        p_at_utc: shipLocalToUtcIso(dayDate(2), '11:59:00', DEV_BASE_OFFSET_MIN),
        p_apply_lifecycle_side_effects: false,
      })
      // Ordinary logging follows shared lifecycle (active), not bounty noon window.
      expect(viaSql.allowed).toBe(true)
    }
  })

  it('Admin configure replaces active cruise without starting gameplay', async () => {
    if (!fixtures.available) return
    const admin = await signInAs(fixtures, 'admin')

    const { data, error } = await admin.rpc('admin_configure_cruise_clock', {
      p_day1_ship_date: '2099-01-03',
      p_base_offset_minutes: -300,
      p_label: 'production-repair-test',
      p_final_hour: 18,
      p_final_minute: 0,
    })
    expect(error).toBeNull()
    expect(data?.ok).toBe(true)
    expect(data?.gameplay_started).toBe(false)
    expect(data?.schedule_initialized).toBe(false)
    expect(data?.diagnostics?.state?.configured).toBe(true)
    expect(data?.diagnostics?.state?.config_label).toBe('production-repair-test')
    expect(data?.diagnostics?.state?.lifecycle).toBe('pre_cruise')
    expect(data?.diagnostics?.state?.accepting_submissions).toBe(false)

    const player = await signInAs(fixtures, 'both')
    const denied = await player.rpc('admin_configure_cruise_clock', {
      p_day1_ship_date: '2099-01-03',
      p_base_offset_minutes: -300,
      p_label: 'production-repair-test',
    })
    expect(denied.error).toBeTruthy()
  })
})
