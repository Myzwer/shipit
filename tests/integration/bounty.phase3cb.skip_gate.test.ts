/**
 * Admin Skip gates:
 * 1. Unexposed preallocated offers are NOT skippable merely because the window began.
 * 2. Concurrent same-UUID Skip returns the original durable result.
 * 3. Exposed current offer remains skippable while Drink It! is paused.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import {
  activateCatalogWithSkipReserves,
  loadBountyFixtures,
  noonDay1Utc,
  slotUtc,
  DEV_BASE_OFFSET_MIN,
} from '../helpers/bountyFixtures'
import { exposeCurrentSlots, playerId } from '../helpers/drinkitSubmit'
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
  await activateCatalogWithSkipReserves(fixtures.service!, `gate-${randomUUID().slice(0, 8)}`)
})

async function currentOfferAt(at: string) {
  const res = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: at })
  return res.data as {
    status: string
    offer_id?: string
    drink_name?: string
    public_end_utc?: string
  } | null
}

async function scheduledNoonOffer() {
  const { data: slot } = await fixtures.service!
    .from('bounty_slots')
    .select('id, current_offer_id, state, public_start_ship_local, public_end_ship_local, slot_key')
    .eq('category', 'cocktail')
    .eq('ship_date', '2099-01-03')
    .eq('public_start_ship_local', '12:00:00')
    .single()
  expect(slot).toBeTruthy()
  const { data: offer } = await fixtures.service!
    .from('bounty_slot_offers')
    .select('id, canonical_key, is_active, exposed_at_utc, reason')
    .eq('id', slot!.current_offer_id)
    .single()
  return { slot: slot!, offer: offer! }
}

describe('Phase 4B1 Skip gate — exposure required', () => {
  it('refuses Skip of preallocated not-yet-exposed offer while paused across opening', async () => {
    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })

    const beforeOpen = slotUtc(1, '11:50:00')
    const duringWindow = noonDay1Utc()

    const pre = await scheduledNoonOffer()
    expect(pre.slot.state).toBe('scheduled')
    expect(pre.offer.exposed_at_utc).toBeNull()
    expect(pre.offer.is_active).toBe(true)

    const tooEarly = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'cocktail',
      p_expected_offer_id: pre.offer.id,
      p_client_request_id: randomUUID(),
      p_at_utc: beforeOpen,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(tooEarly.error).toBeNull()
    expect(tooEarly.data.ok).toBe(false)
    expect(tooEarly.data.code).toBe('NO_PUBLIC_SLOT')

    // Window open + paused + never exposed → not a "current" skippable bounty.
    const skip = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'cocktail',
      p_expected_offer_id: pre.offer.id,
      p_client_request_id: randomUUID(),
      p_at_utc: duringWindow,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(skip.error).toBeNull()
    expect(skip.data.ok).toBe(false)
    expect(skip.data.code).toBe('NOT_EXPOSED')

    const still = await scheduledNoonOffer()
    expect(still.offer.id).toBe(pre.offer.id)
    expect(still.offer.exposed_at_utc).toBeNull()
    expect(still.slot.state).toBe('scheduled')
  })

  it('still allows Skip of an exposed current offer while paused', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const before = await currentOfferAt(at)
    expect(before?.status).toBe('active')
    expect(before?.offer_id).toBeTruthy()

    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: true })
    const skip = await fixtures.service!.rpc('dev_admin_skip_bounty_at', {
      p_category: 'cocktail',
      p_expected_offer_id: before!.offer_id!,
      p_client_request_id: randomUUID(),
      p_at_utc: at,
      p_actor_id: playerId(fixtures, 'admin'),
    })
    expect(skip.error).toBeNull()
    expect(skip.data.ok).toBe(true)
    expect(skip.data.replacement_offer_id).not.toBe(before!.offer_id)

    await fixtures.service!.rpc('dev_set_drinkit_paused', { p_paused: false })
    await exposeCurrentSlots(fixtures.service!, at)
    const after = await currentOfferAt(at)
    expect(after?.offer_id).toBe(skip.data.replacement_offer_id)
  })
})

describe('Phase 3C-B Skip gate — concurrent same UUID', () => {
  it('two concurrent skips with same request UUID return the same original result', async () => {
    const at = noonDay1Utc()
    await exposeCurrentSlots(fixtures.service!, at)
    const before = await currentOfferAt(at)
    expect(before?.status).toBe('active')
    expect(before?.offer_id).toBeTruthy()

    const req = randomUUID()
    const actor = playerId(fixtures, 'admin')
    const payload = {
      p_category: 'cocktail' as const,
      p_expected_offer_id: before!.offer_id!,
      p_client_request_id: req,
      p_at_utc: at,
      p_actor_id: actor,
    }

    const [a, b] = await Promise.all([
      fixtures.service!.rpc('dev_admin_skip_bounty_at', payload),
      fixtures.service!.rpc('dev_admin_skip_bounty_at', payload),
    ])

    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect(a.data.ok).toBe(true)
    expect(b.data.ok).toBe(true)
    expect(a.data.code).not.toBe('STALE_OFFER')
    expect(b.data.code).not.toBe('STALE_OFFER')
    expect(a.data.replacement_offer_id).toBe(b.data.replacement_offer_id)
    expect(a.data.retired_offer_id).toBe(b.data.retired_offer_id)

    const { data: rows, error } = await fixtures.service!
      .from('admin_bounty_skip_requests')
      .select('client_request_id, replacement_offer_id, result_json')
      .eq('client_request_id', req)
    expect(error).toBeNull()
    expect(rows).toHaveLength(1)
    expect(rows![0].replacement_offer_id).toBe(a.data.replacement_offer_id)

    const live = await currentOfferAt(at)
    expect(live?.offer_id).toBe(a.data.replacement_offer_id)
  })
})
