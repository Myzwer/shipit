/**
 * Phase 2D-A closeout — player time-override lockdown + concurrent generation safety.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { signInAs } from '../helpers/localSupabase'
import {
  activateReadyCatalogAndSchedule,
  loadBountyFixtures,
  noonDay1Utc,
  slotUtc,
  DEV_BASE_OFFSET_MIN,
} from '../helpers/bountyFixtures'
import type { ClockFixtures } from '../helpers/clockFixtures'

const url = process.env.VITE_SUPABASE_URL!
const anon = process.env.VITE_SUPABASE_ANON_KEY!

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

describe('Phase 2D-A closeout — player cannot control authoritative time', () => {
  it('authenticated player RPC rejects p_at_utc (no overload) under development-only', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const player = await signInAs(fixtures, 'drink_only')
    const future = slotUtc(3, '14:00:00')

    const cocktail = await player.rpc('get_my_current_cocktail_bounty', {
      p_at_utc: future,
    })
    // PostgREST: no matching overload → error; must not return a future active offer
    expect(cocktail.error).toBeTruthy()
    expect(cocktail.data).toBeNull()

    const ingredient = await player.rpc('get_my_current_ingredient_bounty', {
      p_at_utc: future,
    })
    expect(ingredient.error).toBeTruthy()
    expect(ingredient.data).toBeNull()
  })

  it('zero-arg player RPCs use server now() and never disclose future 2099 schedule', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const player = await signInAs(fixtures, 'drink_only')

    const cocktail = await player.rpc('get_my_current_cocktail_bounty')
    expect(cocktail.error).toBeNull()
    // Cruise is 2099; wall-clock now is outside → unavailable (or equivalent non-active)
    expect(cocktail.data.status).not.toBe('active')
    expect(cocktail.data.offer_id ?? null).toBeNull()

    const ingredient = await player.rpc('get_my_current_ingredient_bounty')
    expect(ingredient.error).toBeNull()
    expect(ingredient.data.status).not.toBe('active')
    expect(ingredient.data.offer_id ?? null).toBeNull()

    const cards = await player.from('ingredient_bounty_public_cards').select('*')
    expect(cards.data ?? []).toEqual([])
  })

  it('player time override fails under a normal (non development-only) cruise label', async () => {
    await fixtures.service!.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: '2099-01-03',
      p_base_offset_minutes: DEV_BASE_OFFSET_MIN,
      p_label: 'production-sim',
    })
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const player = await signInAs(fixtures, 'drink_only')

    const cocktail = await player.rpc('get_my_current_cocktail_bounty', {
      p_at_utc: noonDay1Utc(),
    })
    expect(cocktail.error).toBeTruthy()
    expect(cocktail.data).toBeNull()

    const zero = await player.rpc('get_my_current_cocktail_bounty')
    expect(zero.error).toBeNull()
    expect(zero.data.status).not.toBe('active')
  })

  it('privileged timed sim works for service_role and is denied to authenticated players', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const at = noonDay1Utc()

    const ok = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: at,
    })
    expect(ok.error).toBeNull()
    expect(ok.data.status).toBe('active')
    expect(ok.data.offer_id).toBeTruthy()

    const player = await signInAs(fixtures, 'drink_only')
    const denied = await player.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: at,
    })
    expect(denied.error).toBeTruthy()
    expect(denied.data).toBeNull()

    const deniedIng = await player.rpc('dev_get_current_ingredient_bounty_at', {
      p_at_utc: at,
    })
    expect(deniedIng.error).toBeTruthy()

    const deniedResolve = await player.rpc('dev_resolve_bounty_eligibility_at', {
      p_category: 'cocktail',
      p_at_utc: at,
    })
    expect(deniedResolve.error).toBeTruthy()
  })

  it('player cannot invoke bounty_resolve_at or move another player schedule via RPC', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const playerA = await signInAs(fixtures, 'drink_only')
    const playerB = await signInAs(fixtures, 'both')

    const attempt = await playerA.rpc('bounty_resolve_at', {
      p_category: 'cocktail',
      p_at_utc: noonDay1Utc(),
    })
    expect(attempt.error).toBeTruthy()

    // Player A cannot force exposure through any timed path
    await playerA.rpc('get_my_current_cocktail_bounty', { p_at_utc: noonDay1Utc() })

    const cardsB = await playerB.from('ingredient_bounty_public_cards').select('*')
    expect(cardsB.data ?? []).toEqual([])

    const { count } = await fixtures.service!
      .from('bounty_objective_exposures')
      .select('*', { count: 'exact', head: true })
    expect(count ?? 0).toBe(0)
  })

  it('anonymous clients cannot call player bounty RPCs', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const anonClient = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const c = await anonClient.rpc('get_my_current_cocktail_bounty')
    expect(c.error).toBeTruthy()
    const i = await anonClient.rpc('get_my_current_ingredient_bounty')
    expect(i.error).toBeTruthy()
  })
})

describe('Phase 2D-A closeout — concurrent reads and unauthorized mutation', () => {
  it('concurrent privileged current reads return the same offer without duplicate exposure rows', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const at = noonDay1Utc()
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: at }),
      ),
    )
    const offerIds = results.map((r) => r.data?.offer_id)
    expect(new Set(offerIds).size).toBe(1)
    expect(offerIds[0]).toBeTruthy()

    const { count } = await fixtures.service!
      .from('bounty_objective_exposures')
      .select('*', { count: 'exact', head: true })
      .eq('category', 'cocktail')
    expect(count).toBe(1)
  })

  it('authenticated player cannot mutate bounty_slots or bounty_slot_offers', async () => {
    await activateReadyCatalogAndSchedule(fixtures.service!)
    const player = await signInAs(fixtures, 'drink_only')

    const slotUpdate = await player
      .from('bounty_slots')
      .update({ state: 'missed_paused' })
      .eq('slot_key', 'cocktail:day:1:h12')
    expect((slotUpdate.data ?? []).length).toBe(0)

    const offerInsert = await player.from('bounty_slot_offers').insert({
      slot_id: '00000000-0000-0000-0000-000000000001',
      canonical_key: 'tamper',
      is_active: true,
    })
    expect(offerInsert.error).toBeTruthy()

    const { data: slot } = await fixtures.service!
      .from('bounty_slots')
      .select('state')
      .eq('slot_key', 'cocktail:day:1:h12')
      .single()
    expect(slot?.state).toBe('scheduled')
  })
})
