/**
 * Phase 3B — player-safe wizard catalog reads + cocktail offering_id.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { identity, signInAs } from '../helpers/localSupabase'
import {
  activateReadyCatalogAndSchedule,
  loadBountyFixtures,
  noonDay1Utc,
  DEV_BASE_OFFSET_MIN,
} from '../helpers/bountyFixtures'
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
  await activateReadyCatalogAndSchedule(fixtures.service!, `phase3b-${randomUUID().slice(0, 8)}`)
})

describe('Phase 3B wizard reads', () => {
  it('lists bars with decks; drinks at bar; companions exclude self and ship-only', async () => {
    const drinkOnly = await signInAs(fixtures, 'drink_only')
    const { data: bars, error: barsErr } = await drinkOnly.rpc('list_drinkit_bars')
    expect(barsErr).toBeNull()
    expect(Array.isArray(bars)).toBe(true)
    expect((bars as unknown[]).length).toBeGreaterThan(0)
    const wake = (bars as Array<Record<string, unknown>>).find((b) => b.canonical_key === 'wake-view')
    expect(wake?.name).toBeTruthy()
    expect(Number(wake?.deck)).toBeGreaterThan(0)

    const { data: drinks, error: drinksErr } = await drinkOnly.rpc('list_drinkit_bar_drinks', {
      p_bar_canonical_key: 'wake-view',
    })
    expect(drinksErr).toBeNull()
    expect(Array.isArray(drinks)).toBe(true)
    expect((drinks as unknown[]).length).toBeGreaterThan(0)
    const row = (drinks as Array<Record<string, unknown>>)[0]!
    expect(row.offering_id).toBeTruthy()
    expect(row.display_name).toBeTruthy()

    const { data: companions, error: cErr } = await drinkOnly.rpc('list_drinkit_companions')
    expect(cErr).toBeNull()
    const ids = (companions as Array<Record<string, unknown>>).map((c) => c.player_id)
    const selfId = identity(fixtures.summary!, 'drink_only').player_id
    expect(ids).not.toContain(selfId)
    expect(ids).not.toContain(identity(fixtures.summary!, 'ship_only').player_id)
    expect(ids).toContain(identity(fixtures.summary!, 'both').player_id)
  })

  it('cocktail bounty includes offering_id for Claim It prefill', async () => {
    const at = noonDay1Utc()
    const { data, error } = await fixtures.service!.rpc('dev_get_current_cocktail_bounty_at', {
      p_at_utc: at,
    })
    expect(error).toBeNull()
    expect(data.status).toBe('active')
    expect(data.offering_id).toBeTruthy()
    expect(data.designated_bar_key).toBeTruthy()
  })

  it('bar bounty reminder false for unrelated bar; true when featured and open', async () => {
    const today = new Date()
    const y = today.getUTCFullYear()
    const m = String(today.getUTCMonth() + 1).padStart(2, '0')
    const d = String(today.getUTCDate()).padStart(2, '0')
    // Noon-ish ship local with 0 offset: set day1 to today so cruise is open if wall clock ≥ noon UTC.
    await fixtures.service!.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: `${y}-${m}-${d}`,
      p_base_offset_minutes: -Math.floor(today.getTimezoneOffset()),
      p_label: 'development-only',
    })
    await activateReadyCatalogAndSchedule(fixtures.service!, `phase3b-rem-${randomUUID().slice(0, 6)}`)

    const drinkOnly = await signInAs(fixtures, 'drink_only')
    const { data: other } = await drinkOnly.rpc('drinkit_bar_bounty_reminder', {
      p_bar_canonical_key: 'definitely-not-a-bar',
    })
    expect(other.show_reminder).toBe(false)

    const barNow = await drinkOnly.rpc('get_my_current_bar_bounty')
    if (barNow.data?.status === 'active') {
      const featuredNow = barNow.data.bar_canonical_key as string
      const { data: rem } = await drinkOnly.rpc('drinkit_bar_bounty_reminder', {
        p_bar_canonical_key: featuredNow,
      })
      expect(rem.show_reminder).toBe(true)
    }
  })
})
