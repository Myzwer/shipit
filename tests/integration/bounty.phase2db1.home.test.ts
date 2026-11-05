/**
 * Phase 2D-B1 — authenticated player Home bounty reads (zero-arg RPCs).
 * Timed simulation stays service_role-only; browser never receives service role.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { signInAs } from '../helpers/localSupabase'
import { loadBountyFixtures, DEV_BASE_OFFSET_MIN } from '../helpers/bountyFixtures'
import { seedNowAlignedSchedule, computeNowAlignedCruise } from '../helpers/nowAlignedCruise'
import type { ClockFixtures } from '../helpers/clockFixtures'

let fixtures: ClockFixtures

beforeAll(async () => {
  fixtures = await loadBountyFixtures()
})

describe('Phase 2D-B1 Home player reads', () => {
  it('A/B/C active Cocktail & Ingredient match across two players via now()', async () => {
    const seeded = await seedNowAlignedSchedule(fixtures.service!, {
      targetHour: 13,
      targetMinute: 15,
      cruiseDay: 1,
      seed: 'phase2db1-active',
    })
    expect(seeded.schedule.cocktail_slots).toBe(72)

    const playerA = await signInAs(fixtures, 'drink_only')
    const playerB = await signInAs(fixtures, 'both')

    const ca = await playerA.rpc('get_my_current_cocktail_bounty')
    const cb = await playerB.rpc('get_my_current_cocktail_bounty')
    expect(ca.error).toBeNull()
    expect(cb.error).toBeNull()
    expect(ca.data.status).toBe('active')
    expect(ca.data.offer_id).toBe(cb.data.offer_id)
    expect(ca.data.drink_name).toBeTruthy()
    expect(ca.data.designated_bar_name).toBeTruthy()
    expect([25, 50, 75, 100]).toContain(ca.data.points)
    expect(Array.isArray(ca.data.listed_ingredients)).toBe(true)
    expect(ca.data.public_end_utc).toBeTruthy()
    // No grace / future leakage on player payload
    expect(JSON.stringify(ca.data)).not.toMatch(/grace_previous|future|qualifying_bar/i)

    const ia = await playerA.rpc('get_my_current_ingredient_bounty')
    const ib = await playerB.rpc('get_my_current_ingredient_bounty')
    expect(ia.error).toBeNull()
    expect(ia.data.status).toBe('active')
    expect(ia.data.offer_id).toBe(ib.data.offer_id)
    expect(ia.data.display_name).toBeTruthy()
    expect(ia.data.known_bar_count).toBeGreaterThanOrEqual(1)
    expect(JSON.stringify(ia.data)).not.toMatch(/bar_name|cocktail_name|qualifying/i)

    const clockA = await playerA.rpc('get_ship_clock_state')
    const clockB = await playerB.rpc('get_ship_clock_state')
    expect(clockA.data.configured).toBe(true)
    expect(clockA.data.offset_minutes).toBe(clockB.data.offset_minutes)
  })

  it('E pre-opening now() reveals no active objective', async () => {
    await seedNowAlignedSchedule(fixtures.service!, {
      targetHour: 10,
      targetMinute: 0,
      cruiseDay: 1,
      seed: 'phase2db1-preopen',
    })
    const player = await signInAs(fixtures, 'drink_only')
    const cocktail = await player.rpc('get_my_current_cocktail_bounty')
    const ingredient = await player.rpc('get_my_current_ingredient_bounty')
    expect(cocktail.data.status).not.toBe('active')
    expect(ingredient.data.status).not.toBe('active')
    expect(cocktail.data.offer_id ?? null).toBeNull()
  })

  it('F overnight now() closes without active offer', async () => {
    await seedNowAlignedSchedule(fixtures.service!, {
      targetHour: 23,
      targetMinute: 30,
      cruiseDay: 1,
      seed: 'phase2db1-overnight',
    })
    const player = await signInAs(fixtures, 'drink_only')
    const cocktail = await player.rpc('get_my_current_cocktail_bounty')
    expect(cocktail.data.status).not.toBe('active')
  })

  it('G Friday finale now() returns finale', async () => {
    await seedNowAlignedSchedule(fixtures.service!, {
      targetHour: 18,
      targetMinute: 30,
      cruiseDay: 7,
      seed: 'phase2db1-finale',
    })
    const player = await signInAs(fixtures, 'drink_only')
    const cocktail = await player.rpc('get_my_current_cocktail_bounty')
    const ingredient = await player.rpc('get_my_current_ingredient_bounty')
    expect(cocktail.data.status).toBe('finale')
    expect(ingredient.data.status).toBe('finale')
  })

  it('H pause returns paused for players', async () => {
    await seedNowAlignedSchedule(fixtures.service!, {
      targetHour: 14,
      targetMinute: 0,
      cruiseDay: 2,
      seed: 'phase2db1-pause',
    })
    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    const player = await signInAs(fixtures, 'drink_only')
    const cocktail = await player.rpc('get_my_current_cocktail_bounty')
    expect(cocktail.data.status).toBe('paused')
  })

  it('I timezone-agnostic: same server now yields same offer regardless of client TZ labels', async () => {
    await seedNowAlignedSchedule(fixtures.service!, {
      targetHour: 15,
      targetMinute: 0,
      cruiseDay: 1,
      seed: 'phase2db1-tz',
    })
    const player = await signInAs(fixtures, 'drink_only')
    // Client cannot pass a timezone; two sequential zero-arg calls must match.
    const a = await player.rpc('get_my_current_cocktail_bounty')
    const b = await player.rpc('get_my_current_cocktail_bounty')
    expect(a.data.offer_id).toBe(b.data.offer_id)
    expect(a.data.status).toBe('active')
  })

  it('M players cannot read future Ingredient solutions from tables or RPCs', async () => {
    await seedNowAlignedSchedule(fixtures.service!, {
      targetHour: 12,
      targetMinute: 30,
      cruiseDay: 1,
      seed: 'phase2db1-disclosure',
    })
    const player = await signInAs(fixtures, 'drink_only')
    const cards = await player.from('ingredient_bounty_public_cards').select('*')
    // After current exposure, at most the current card — never a future inventory.
    for (const row of cards.data ?? []) {
      expect(row.exposure_status).toBe('current')
    }
    const slots = await player.from('bounty_slots').select('*')
    expect(slots.data ?? []).toEqual([])
    const candidates = await player.from('ingredient_candidates').select('*')
    expect(candidates.data ?? []).toEqual([])
    const denied = await player.rpc('dev_get_current_ingredient_bounty_at', {
      p_at_utc: new Date().toISOString(),
    })
    expect(denied.error).toBeTruthy()
  })

  it('D slot boundary: privileged sim rotates; player now() stays consistent with clock', async () => {
    // Keep a classic 2099 schedule for boundary via service_role timed helpers.
    await fixtures.service!.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: '2099-01-03',
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
      p_label: 'development-only',
    })
    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
    const { activateReadyCatalogAndSchedule, noonDay1Utc, slotUtc } = await import(
      '../helpers/bountyFixtures'
    )
    await activateReadyCatalogAndSchedule(fixtures.service!, 'phase2db1-boundary')

    const noon = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: noonDay1Utc(),
    })
    const next = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: slotUtc(1, '13:00:00'),
    })
    expect(noon.data.status).toBe('active')
    expect(next.data.status).toBe('active')
    expect(noon.data.offer_id).not.toBe(next.data.offer_id)

    // Player zero-arg against 2099 remains non-active (wall clock now).
    const player = await signInAs(fixtures, 'drink_only')
    const live = await player.rpc('get_my_current_cocktail_bounty')
    expect(live.data.status).not.toBe('active')
  })

  it('computeNowAlignedCruise produces a coherent day1/offset pair', () => {
    const a = computeNowAlignedCruise({ targetHour: 13, cruiseDay: 1 })
    expect(a.day1).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(typeof a.offsetMinutes).toBe('number')
  })
})
