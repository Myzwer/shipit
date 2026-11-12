/**
 * Pre-Cruise opening instants on get_ship_clock_state / ship_clock_state_at.
 *
 * Uses the ordinary clock fixture seed (development-only 2099 calendar).
 * Do NOT run against an active QA Pre-Cruise review DB if you need to preserve it —
 * loadClockFixtures reseeds cruise_config.
 *
 *   LOCAL_TEST_PASSWORD='…' npx vitest run --fileParallelism=false tests/integration/clock.precruise_opening.test.ts
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  DEV_BASE_OFFSET_MIN,
  DEV_DAY1,
  dayDate,
  loadClockFixtures,
  sameUtcInstant,
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
  fixtures.admin = await signInAs(fixtures, 'admin')
  await seedFresh()
})

describe('Pre-Cruise opening instants (clock contract)', () => {
  it('exposes shared Day-1 midnight open + later Drink It! noon bounty open', async () => {
    if (!fixtures.available) return

    const preUtc = shipLocalToUtcIso(dayDate(1), '00:00:00', DEV_BASE_OFFSET_MIN)
    // One second before Day 1 midnight ship-local.
    const beforeOpen = new Date(new Date(preUtc).getTime() - 1000).toISOString()
    const afterOpen = new Date(new Date(preUtc).getTime() + 1000).toISOString()
    const noonUtc = shipLocalToUtcIso(dayDate(1), '12:00:00', DEV_BASE_OFFSET_MIN)

    const before = await stateAt(fixtures.service!, beforeOpen, false)
    expect(before.lifecycle).toBe('pre_cruise')
    expect(before.accepting_submissions).toBe(false)
    expect(sameUtcInstant(before.cruise_opens_at_utc, preUtc)).toBe(true)
    expect(sameUtcInstant(before.shipit_opens_at_utc, preUtc)).toBe(true)
    expect(sameUtcInstant(before.drinkit_opens_at_utc, preUtc)).toBe(true)
    expect(sameUtcInstant(before.drinkit_bounty_opens_at_utc, noonUtc)).toBe(true)
    expect(new Date(before.drinkit_bounty_opens_at_utc).getTime()).toBeGreaterThan(
      new Date(before.cruise_opens_at_utc).getTime(),
    )

    const after = await stateAt(fixtures.service!, afterOpen, false)
    expect(after.lifecycle).toBe('active')
    expect(after.accepting_submissions).toBe(true)
    expect(after.cruise_day).toBe(1)

    const { data: diPre } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'drinkit',
      p_at_utc: beforeOpen,
      p_apply_lifecycle_side_effects: false,
    })
    const { data: siPre } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'shipit',
      p_at_utc: beforeOpen,
      p_apply_lifecycle_side_effects: false,
    })
    expect(diPre.allowed).toBe(false)
    expect(diPre.code).toBe('PRE_CRUISE')
    expect(siPre.allowed).toBe(false)
    expect(siPre.code).toBe('PRE_CRUISE')

    const { data: diOpen } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'drinkit',
      p_at_utc: afterOpen,
      p_apply_lifecycle_side_effects: false,
    })
    const { data: siOpen } = await fixtures.service!.rpc('dev_evaluate_submission_acceptance_at', {
      p_game: 'shipit',
      p_at_utc: afterOpen,
      p_apply_lifecycle_side_effects: false,
    })
    expect(diOpen.allowed).toBe(true)
    expect(diOpen.code).toBe('OK')
    expect(siOpen.allowed).toBe(true)
    expect(siOpen.code).toBe('OK')

    // Authenticated player read includes the new fields (no client time args).
    const player = await signInAs(fixtures, 'both')
    // Force ship clock into pre_cruise for the live now() path by using a far-future day1
    // already seeded; player still receives opening fields from current config.
    const { data: live, error } = await player.rpc('get_ship_clock_state')
    expect(error).toBeNull()
    expect(live.configured).toBe(true)
    expect(live.cruise_opens_at_utc).toBeTruthy()
    expect(live.shipit_opens_at_utc).toBeTruthy()
    expect(live.drinkit_opens_at_utc).toBeTruthy()
    expect(live.drinkit_bounty_opens_at_utc).toBeTruthy()
    expect(sameUtcInstant(live.shipit_opens_at_utc, live.drinkit_opens_at_utc)).toBe(true)
  })

  it('refines Day-1 noon open when a Day-1 3 AM plan delta applies', async () => {
    if (!fixtures.available) return

    const t0 = shipLocalToUtcIso(dayDate(1), '00:30:00', DEV_BASE_OFFSET_MIN)
    const { error: planErr } = await fixtures.service!.rpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: 1,
      p_delta_minutes: 60,
      p_enabled: true,
      p_at_utc: t0,
    })
    expect(planErr).toBeNull()

    const noonNaive = shipLocalToUtcIso(dayDate(1), '12:00:00', DEV_BASE_OFFSET_MIN)
    const noonAfterDelta = shipLocalToUtcIso(dayDate(1), '12:00:00', DEV_BASE_OFFSET_MIN + 60)

    const pre = await stateAt(
      fixtures.service!,
      shipLocalToUtcIso('2098-12-31', '12:00:00', DEV_BASE_OFFSET_MIN),
      false,
    )
    expect(pre.lifecycle).toBe('pre_cruise')
    // Midnight open still uses base offset (3 AM delta is after midnight).
    expect(
      sameUtcInstant(pre.cruise_opens_at_utc, shipLocalToUtcIso(dayDate(1), '00:00:00', DEV_BASE_OFFSET_MIN)),
    ).toBe(true)
    // Noon must refine through the Day-1 3 AM +60 event — not the pre-cruise offset alone.
    expect(sameUtcInstant(pre.drinkit_bounty_opens_at_utc, noonAfterDelta)).toBe(true)
    expect(sameUtcInstant(pre.drinkit_bounty_opens_at_utc, noonNaive)).toBe(false)
  })
})
