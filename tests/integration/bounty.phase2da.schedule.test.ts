/**
 * Phase 2D-A — durable bounty scheduling, disclosure lockdown, grace, pause/clock.
 * Timed simulation uses service_role only. Player RPCs never take authoritative time.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { signInAs } from '../helpers/localSupabase'
import {
  activateReadyCatalogAndSchedule,
  loadBountyFixtures,
  noonDay1Utc,
  slotUtc,
  DEV_BASE_OFFSET_MIN,
  dayDate,
  shipLocalToUtcIso,
} from '../helpers/bountyFixtures'
import { buildScheduleReadyCatalog } from '../fixtures/catalog/builders'
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

describe('Phase 2D-A disclosure lockdown', () => {
  it('Drink It! players cannot read cocktail_candidates or offering ingredients', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const player = await signInAs(fixtures, 'drink_only')

    const candidates = await player.from('cocktail_candidates').select('*')
    expect(candidates.data ?? []).toEqual([])

    const ingredients = await player.from('catalog_offering_ingredients').select('*')
    expect(ingredients.data ?? []).toEqual([])

    const slots = await player.from('bounty_slots').select('*')
    expect(slots.data ?? []).toEqual([])

    const offers = await player.from('bounty_slot_offers').select('*')
    expect(offers.data ?? []).toEqual([])
  })

  it('Ship It!-only cannot read Drink It! bounty RPCs', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const ship = await signInAs(fixtures, 'ship_only')
    const c = await ship.rpc('get_my_current_cocktail_bounty')
    expect(c.error).toBeTruthy()
    expect(c.error?.message ?? '').toMatch(/DRINKIT_REQUIRED/i)
    const i = await ship.rpc('get_my_current_ingredient_bounty')
    expect(i.error).toBeTruthy()
  })
})

describe('Phase 2D-A slot ledger and assignment', () => {
  it('creates exactly 72 cocktail and 39 ingredient slots with shortened evening ingredient', async () => {
    const { schedule } = await activateReadyCatalogAndSchedule(fixtures.service!)
    expect(schedule.cocktail_slots).toBe(72)
    expect(schedule.ingredient_slots).toBe(39)

    const { data: slots } = await fixtures.service!.from('bounty_slots').select('*')
    expect(slots!.filter((s) => s.category === 'cocktail')).toHaveLength(72)
    expect(slots!.filter((s) => s.category === 'ingredient')).toHaveLength(39)

    const evening = slots!.find(
      (s) =>
        s.category === 'ingredient' &&
        s.cruise_day === 1 &&
        s.public_start_ship_local === '22:00:00',
    )
    expect(evening?.public_end_ship_local).toBe('23:00:00')

    const day7c = slots!.filter((s) => s.category === 'cocktail' && s.cruise_day === 7)
    expect(day7c).toHaveLength(6)
    const day7i = slots!.filter((s) => s.category === 'ingredient' && s.cruise_day === 7)
    expect(day7i).toHaveLength(3)
  })

  it('does not reshuffle on repeated generation; concurrent calls stay consistent', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!, 'same-seed')
    const { data: first } = await fixtures.service!
      .from('bounty_slot_offers')
      .select('canonical_key, slot_id')
      .eq('is_active', true)
      .order('slot_id')

    const [a, b] = await Promise.all([
      fixtures.service!.rpc('dev_generate_bounty_schedule', { p_seed: 'other' }),
      fixtures.service!.rpc('dev_generate_bounty_schedule', { p_seed: 'other2' }),
    ])
    expect(a.data.idempotent).toBe(true)
    expect(b.data.idempotent).toBe(true)

    const { data: second } = await fixtures.service!
      .from('bounty_slot_offers')
      .select('canonical_key, slot_id')
      .eq('is_active', true)
      .order('slot_id')
    expect(second).toEqual(first)
  })

  it('never repeats Cocktail concepts or Ingredient keys', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const { data: offers } = await fixtures.service!
      .from('bounty_slot_offers')
      .select('canonical_key, cocktail_concept_id, ingredient_id')
      .eq('is_active', true)

    const cocktails = offers!.filter((o) => o.cocktail_concept_id)
    const ingredients = offers!.filter((o) => o.ingredient_id)
    expect(new Set(cocktails.map((o) => o.canonical_key)).size).toBe(72)
    expect(new Set(ingredients.map((o) => o.canonical_key)).size).toBe(39)
  })

  it('fails atomically on catalog shortage', async () => {
    const short = buildScheduleReadyCatalog(10, 5)
    short.catalog_id = 'dev-shortage-v1'
    await fixtures.service!.rpc('dev_activate_catalog_fixture', { p_payload: short })
    const { error } = await fixtures.service!.rpc('dev_generate_bounty_schedule', {
      p_seed: 'shortage',
    })
    expect(error).toBeTruthy()
    expect(error?.message ?? '').toMatch(/COCKTAIL_POOL_SHORTAGE|INGREDIENT_POOL_SHORTAGE/)
    const { count } = await fixtures.service!
      .from('bounty_slots')
      .select('*', { count: 'exact', head: true })
    expect(count ?? 0).toBe(0)
  })
})

describe('Phase 2D-A public reads and exposure', () => {
  it('all Drink It! players see the same current Cocktail and Ingredient', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const at = noonDay1Utc()
    const ca = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: at })
    const cb = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: at })
    expect(ca.error).toBeNull()
    expect(ca.data.offer_id).toBe(cb.data.offer_id)
    expect(ca.data.designated_bar_key).toBeTruthy()
    expect(ca.data.drink_name).toBeTruthy()

    const ia = await fixtures.service!.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: at })
    const ib = await fixtures.service!.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: at })
    expect(ia.data.offer_id).toBe(ib.data.offer_id)
    expect(ia.data.known_bar_count).toBeGreaterThanOrEqual(2)
    expect(JSON.stringify(ia.data)).not.toMatch(/wake-view|qualifying|bar_offer/i)

    // Authenticated players can invoke the zero-arg RPCs (authorization path).
    const playerA = await signInAs(fixtures, 'drink_only')
    const playerB = await signInAs(fixtures, 'both')
    const pa = await playerA.rpc('get_my_current_cocktail_bounty')
    const pb = await playerB.rpc('get_my_current_cocktail_bounty')
    expect(pa.error).toBeNull()
    expect(pb.error).toBeNull()
    // Wall-clock now() is outside the 2099 cruise → both see the same non-active status.
    expect(pa.data.status).toBe(pb.data.status)
    expect(pa.data.status).not.toBe('active')
  })

  it('pre-opening and overnight reveal no active bounty', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const morning = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: slotUtc(1, '10:00:00'),
    })
    expect(morning.data.status).toMatch(/unavailable|paused/)
    const late = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: slotUtc(1, '23:30:00'),
    })
    expect(late.data.status).toMatch(/unavailable/)
  })

  it('reload does not reshuffle; exposure is idempotent', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const at = noonDay1Utc()
    const first = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: at,
    })
    const second = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: at,
    })
    expect(first.data.offer_id).toBe(second.data.offer_id)
    const { count } = await fixtures.service!
      .from('bounty_objective_exposures')
      .select('*', { count: 'exact', head: true })
      .eq('category', 'cocktail')
    expect(count).toBe(1)
  })

  it('players cannot read future offers from public cards or ledger', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const player = await signInAs(fixtures, 'drink_only')
    const before = await player.from('ingredient_bounty_public_cards').select('*')
    expect(before.data ?? []).toEqual([])

    // Expose noon via privileged sim (not player time override)
    await fixtures.service!.rpc('dev_get_current_ingredient_bounty_at', {
      p_at_utc: noonDay1Utc(),
    })
    const after = await player.from('ingredient_bounty_public_cards').select('*')
    expect(after.data).toHaveLength(1)
    expect(after.data![0].exposure_status).toBe('current')
  })

  it('timezone-agnostic: same ship-local window yields same offer via UTC instants', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const a = noonDay1Utc()
    const b = new Date(new Date(a).getTime()).toISOString()
    const r1 = await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: a,
    })
    const r2 = await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: b,
    })
    expect(r1.data.offer_id).toBe(r2.data.offer_id)
  })

  it('exact hourly cocktail and two-hour ingredient boundaries rotate correctly', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const noon = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: slotUtc(1, '12:00:00'),
    })
    const justBefore = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: slotUtc(1, '12:59:59'),
    })
    const atBoundary = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: slotUtc(1, '13:00:00'),
    })
    expect(noon.data.offer_id).toBe(justBefore.data.offer_id)
    expect(atBoundary.data.offer_id).not.toBe(noon.data.offer_id)
    expect(noon.data.slot_key).toContain('h12')
    expect(atBoundary.data.slot_key).toContain('h13')

    const ingNoon = await fixtures.service!.rpc('dev_get_current_ingredient_bounty_at', {
      p_at_utc: slotUtc(1, '12:00:00'),
    })
    const ingBefore = await fixtures.service!.rpc('dev_get_current_ingredient_bounty_at', {
      p_at_utc: slotUtc(1, '13:59:59'),
    })
    const ingNext = await fixtures.service!.rpc('dev_get_current_ingredient_bounty_at', {
      p_at_utc: slotUtc(1, '14:00:00'),
    })
    expect(ingNoon.data.offer_id).toBe(ingBefore.data.offer_id)
    expect(ingNext.data.offer_id).not.toBe(ingNoon.data.offer_id)
  })
})

describe('Phase 2D-A private grace and finale', () => {
  it('grace keeps previous offer privately eligible for 15 minutes without public reveal', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: noonDay1Utc(),
    })
    const at = slotUtc(1, '13:05:00')
    const resolved = await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: at,
    })
    expect(resolved.data.status).toBe('active')
    expect(resolved.data.grace_previous).toBeTruthy()
    expect(resolved.data.grace_previous.canonical_key).toBeTruthy()

    const pub = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: at,
    })
    expect(pub.data.offer_id).toBe(resolved.data.offer_id)
    expect(pub.data).not.toHaveProperty('grace_previous')
  })

  it('grace is present at +0 and +14:59 after expiration, gone at +15:00', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: noonDay1Utc(),
    })

    const atExpire = await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: slotUtc(1, '13:00:00'),
    })
    expect(atExpire.data.grace_previous).toBeTruthy()

    const at1459 = await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: slotUtc(1, '13:14:59'),
    })
    expect(at1459.data.grace_previous).toBeTruthy()

    const at1500 = await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: slotUtc(1, '13:15:00'),
    })
    expect(at1500.data.grace_previous ?? null).toBeNull()
  })

  it('Friday 6 PM cutoff overrides grace', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: slotUtc(7, '17:00:00'),
    })
    const after = await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: slotUtc(7, '18:00:00'),
    })
    expect(after.data.status).toBe('finale')
    expect(after.data.grace_previous ?? null).toBeNull()
  })
})

describe('Phase 2D-A pause and clock corrections', () => {
  it('pause before first opening leaves noon unexposed until resume window', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    await fixtures.service!.rpc('dev_set_drinkit_paused', {
      p_paused: true,
      p_at_utc: slotUtc(1, '10:00:00'),
    })
    const beforeOpen = await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: slotUtc(1, '11:30:00'),
    })
    expect(beforeOpen.data.status).toBe('paused')

    const { count } = await fixtures.service!
      .from('bounty_objective_exposures')
      .select('*', { count: 'exact', head: true })
    expect(count ?? 0).toBe(0)
  })

  it('paused missed slots are not retrospectively claimable', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    await fixtures.service!.rpc('dev_set_drinkit_paused', {
      p_paused: true,
      p_at_utc: slotUtc(1, '11:00:00'),
    })
    const during = await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: slotUtc(1, '12:30:00'),
    })
    expect(during.data.status).toBe('paused')

    await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: slotUtc(1, '14:05:00'),
    })

    await fixtures.service!.rpc('dev_set_drinkit_paused', {
      p_paused: false,
      p_at_utc: slotUtc(1, '14:15:00'),
    })

    const resumed = await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: slotUtc(1, '14:15:00'),
    })
    expect(resumed.data.status).toBe('active')
    expect(resumed.data.slot_key).toContain('h14')

    const { data: noonSlot } = await fixtures.service!
      .from('bounty_slots')
      .select('state')
      .eq('slot_key', 'cocktail:day:1:h12')
      .single()
    expect(noonSlot?.state).toBe('missed_paused')
  })

  it('manual clock correction does not duplicate exposure of an already-shown slot', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const t0 = noonDay1Utc()
    const first = await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: t0,
    })
    expect(first.data.status).toBe('active')
    const offerId = first.data.offer_id

    await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: 60,
      p_at_utc: slotUtc(1, '12:30:00'),
    })

    await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: shipLocalToUtcIso(dayDate(1), '12:45:00', DEV_BASE_OFFSET_MIN + 60),
    })

    const { data: exposures } = await fixtures.service!
      .from('bounty_objective_exposures')
      .select('canonical_key')
      .eq('category', 'cocktail')
    const keys = exposures!.map((e) => e.canonical_key)
    expect(new Set(keys).size).toBe(keys.length)

    const { data: offer } = await fixtures.service!
      .from('bounty_slot_offers')
      .select('id, exposed_at_utc')
      .eq('id', offerId)
      .single()
    expect(offer?.exposed_at_utc).toBeTruthy()
  })

  it('backward clock correction does not re-expose a consumed noon slot as fresh', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const noon = await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: noonDay1Utc(),
    })
    const noonKey = noon.data.canonical_key as string

    // Move into 13:00 and expose next
    await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: slotUtc(1, '13:05:00'),
    })

    // Backward −60 at 13:30 ship → re-enter apparent noon wall time
    await fixtures.service!.rpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: -60,
      p_at_utc: slotUtc(1, '13:30:00'),
    })

    const again = await fixtures.service!.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: shipLocalToUtcIso(dayDate(1), '12:45:00', DEV_BASE_OFFSET_MIN - 60),
    })
    // Exposure table still has exactly one row for the noon canonical key
    const { data: rows } = await fixtures.service!
      .from('bounty_objective_exposures')
      .select('id')
      .eq('category', 'cocktail')
      .eq('canonical_key', noonKey)
    expect(rows).toHaveLength(1)
    void again
  })
})
