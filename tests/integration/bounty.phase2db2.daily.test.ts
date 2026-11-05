/**
 * Phase 2D-B2 — fixed Bar/Daily assignments, windows, Pause/Resume, disclosure.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signInAs } from '../helpers/localSupabase'
import {
  activateReadyCatalogAndSchedule,
  loadBountyFixtures,
  noonDay1Utc,
  slotUtc,
  DEV_BASE_OFFSET_MIN,
} from '../helpers/bountyFixtures'
import { seedNowAlignedSchedule } from '../helpers/nowAlignedCruise'
import type { ClockFixtures } from '../helpers/clockFixtures'

let fixtures: ClockFixtures

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
})

beforeEach(async () => {
  const { error } = await fixtures.service!.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: '2099-01-03',
    p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
    p_label: 'development-only',
  })
  expect(error).toBeNull()
  await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
})

describe('Phase 2D-B2 daily assignments', () => {
  it('1/2 seeds exactly seven Bar and seven Daily Challenge rows', async () => {
    const { daily } = await activateReadyCatalogAndSchedule(fixtures.service!)
    expect(daily.bar_assignments).toBe(7)
    expect(daily.daily_challenges).toBe(7)

    const { count: bars } = await fixtures.service!
      .from('bar_bounties')
      .select('*', { count: 'exact', head: true })
    const { count: challenges } = await fixtures.service!
      .from('daily_challenges')
      .select('*', { count: 'exact', head: true })
    expect(bars).toBe(7)
    expect(challenges).toBe(7)
  })

  it('3 correct current-day assignments across Days 1–7', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    for (const day of [1, 2, 3, 4, 5, 6, 7]) {
      const at = slotUtc(day, day === 7 ? '15:00:00' : '13:00:00')
      const bar = await fixtures.service!.rpc('dev_get_current_bar_bounty_at', { p_at_utc: at })
      const daily = await fixtures.service!.rpc('dev_get_current_daily_challenge_at', {
        p_at_utc: at,
      })
      expect(bar.error).toBeNull()
      expect(bar.data.status).toBe('active')
      expect(bar.data.cruise_day).toBe(day)
      expect(daily.data.status).toBe('active')
      expect(daily.data.cruise_day).toBe(day)
      expect(daily.data.points).toBe(50)
    }
  })

  it('4/5/6 players cannot read future rows; Ship It!-only denied; tables locked', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const player = await signInAs(fixtures, 'drink_only')
    const bars = await player.from('bar_bounties').select('*')
    expect(bars.data ?? []).toEqual([])
    const dailies = await player.from('daily_challenges').select('*')
    expect(dailies.data ?? []).toEqual([])

    const insert = await player.from('bar_bounties').insert({
      day_number: 1,
      bar_canonical_key: 'x',
      bar_display_name: 'Hack',
    } as never)
    expect(insert.error).toBeTruthy()

    const ship = await signInAs(fixtures, 'ship_only')
    const denied = await ship.rpc('get_my_current_bar_bounty')
    expect(denied.error).toBeTruthy()
    expect(denied.error?.message ?? '').toMatch(/DRINKIT_REQUIRED/i)
  })

  it('7 Bar and Daily stay fixed within a day (no hourly rotation)', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const noon = await fixtures.service!.rpc('dev_get_current_bar_bounty_at', {
      p_at_utc: noonDay1Utc(),
    })
    const late = await fixtures.service!.rpc('dev_get_current_bar_bounty_at', {
      p_at_utc: slotUtc(1, '22:00:00'),
    })
    expect(noon.data.assignment_id).toBe(late.data.assignment_id)

    const dNoon = await fixtures.service!.rpc('dev_get_current_daily_challenge_at', {
      p_at_utc: noonDay1Utc(),
    })
    const dLate = await fixtures.service!.rpc('dev_get_current_daily_challenge_at', {
      p_at_utc: slotUtc(1, '22:00:00'),
    })
    expect(dNoon.data.challenge_id).toBe(dLate.data.challenge_id)
  })

  it('8/9/10 Saturday noon open; 11 PM close; Friday 6 PM cutoff', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const morning = await fixtures.service!.rpc('dev_get_current_bar_bounty_at', {
      p_at_utc: slotUtc(1, '10:00:00'),
    })
    expect(morning.data.status).not.toBe('active')

    const open = await fixtures.service!.rpc('dev_get_current_bar_bounty_at', {
      p_at_utc: noonDay1Utc(),
    })
    expect(open.data.status).toBe('active')

    const overnight = await fixtures.service!.rpc('dev_get_current_daily_challenge_at', {
      p_at_utc: slotUtc(1, '23:30:00'),
    })
    expect(overnight.data.status).not.toBe('active')

    const fridayOk = await fixtures.service!.rpc('dev_get_current_bar_bounty_at', {
      p_at_utc: slotUtc(7, '17:59:00'),
    })
    expect(fridayOk.data.status).toBe('active')

    const fridayDone = await fixtures.service!.rpc('dev_get_current_bar_bounty_at', {
      p_at_utc: slotUtc(7, '18:00:00'),
    })
    expect(fridayDone.data.status).toBe('finale')
  })

  it('11 clock adjustments still resolve by ship-local day', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const before = await fixtures.service!.rpc('dev_get_current_bar_bounty_at', {
      p_at_utc: slotUtc(2, '13:00:00'),
    })
    // Manual offset change via service seed with different base offset for day 2 noon-equivalent
    await fixtures.service!.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: '2099-01-03',
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN - 60,
      p_label: 'development-only',
    })
    await activateReadyCatalogAndSchedule(fixtures.service!, 'clock-adjust-daily')
    const after = await fixtures.service!.rpc('dev_get_current_bar_bounty_at', {
      p_at_utc: slotUtc(2, '13:00:00', DEV_BASE_OFFSET_MIN - 60),
    })
    expect(before.data.cruise_day).toBe(2)
    expect(after.data.cruise_day).toBe(2)
    expect(after.data.status).toBe('active')
  })
})

describe('Phase 2D-B2 Pause/Resume', () => {
  it('12/13 pause before opening and during play', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    const morning = await fixtures.service!.rpc('dev_get_current_bar_bounty_at', {
      p_at_utc: slotUtc(1, '10:00:00'),
    })
    expect(morning.data.status).toBe('paused')

    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    const mid = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: noonDay1Utc(),
    })
    expect(mid.data.status).toBe('paused')
  })

  it('14/15 resume after missed windows; no backfill of missed_paused cocktail slots', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    // Advance through noon hour while paused
    await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: slotUtc(1, '12:30:00'),
    })
    await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: slotUtc(1, '13:30:00'),
    })
    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
    const after = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: slotUtc(1, '14:15:00'),
    })
    expect(after.data.status).toBe('active')

    const { data: missed } = await fixtures.service!
      .from('bounty_slots')
      .select('state')
      .eq('category', 'cocktail')
      .eq('cruise_day', 1)
      .eq('state', 'missed_paused')
    expect((missed ?? []).length).toBeGreaterThan(0)
  })

  it('16 Ship It! control remains unpaused while Drink It! pauses', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const admin = await signInAs(fixtures, 'admin')
    const paused = await admin.rpc('admin_set_drinkit_paused', { p_paused: true })
    expect(paused.error).toBeNull()
    expect(paused.data.paused).toBe(true)
    const status = await admin.rpc('admin_get_drinkit_pause_status')
    expect(status.data.drinkit.paused).toBe(true)
    expect(status.data.shipit.paused).toBe(false)
  })

  it('17 non-admin Pause/Resume denied', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const player = await signInAs(fixtures, 'drink_only')
    const denied = await player.rpc('admin_set_drinkit_paused', { p_paused: true })
    expect(denied.error).toBeTruthy()
    expect(denied.error?.message ?? '').toMatch(/ADMIN_REQUIRED/i)
  })

  it('18 identical pause is idempotent; 19 no unintended flip', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const admin = await signInAs(fixtures, 'admin')
    const a = await admin.rpc('admin_set_drinkit_paused', { p_paused: true })
    const b = await admin.rpc('admin_set_drinkit_paused', { p_paused: true })
    expect(a.data.paused).toBe(true)
    expect(a.data.changed).toBe(true)
    expect(b.data.paused).toBe(true)
    expect(b.data.changed).toBe(false)
  })

  it('20 Friday finalized cannot reopen via Resume', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    // Latch finale
    await fixtures.service!.rpc('dev_get_ship_clock_state_at', {
      p_at_utc: slotUtc(7, '18:00:00'),
      p_apply_lifecycle_side_effects: true,
    })
    const admin = await signInAs(fixtures, 'admin')
    const resume = await admin.rpc('admin_set_drinkit_paused', { p_paused: false })
    expect(resume.error).toBeTruthy()
    expect(resume.error?.message ?? '').toMatch(/FINALE_LOCKED/i)
  })

  it('player zero-arg board returns consistent day when now-aligned', async () => {
    await seedNowAlignedSchedule(fixtures.service!, {
      targetHour: 14,
      targetMinute: 0,
      cruiseDay: 2,
      seed: 'phase2db2-board',
    })
    const player = await signInAs(fixtures, 'drink_only')
    const board = await player.rpc('get_my_drinkit_home_board')
    expect(board.error).toBeNull()
    expect(board.data.bar.status).toBe('active')
    expect(board.data.daily.status).toBe('active')
    expect(board.data.bar.cruise_day).toBe(board.data.daily.cruise_day)
    expect(board.data.cocktail.status).toBe('active')
  })
})
