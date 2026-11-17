/**
 * Phase 2C.13A — Ingredient Bounty eligible bar availability RPC (local).
 * Read-only against whatever active Ingredient offer exists.
 * Does not seed clocks/schedules (protected fixtures must stay untouched).
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalClient, loadLocalFixtures, signInAs } from '../helpers/localSupabase'

let available = false
let rpcAvailable = false
let fixtures: Awaited<ReturnType<typeof loadLocalFixtures>>

beforeAll(async () => {
  fixtures = await loadLocalFixtures()
  available = Boolean(
    fixtures.available && fixtures.summary && fixtures.anonKey && fixtures.serviceRoleKey,
  )
  if (!available) return

  const anon = createLocalClient(fixtures.summary!.supabase_url, fixtures.anonKey!)
  const probe = await anon.rpc('get_my_ingredient_bounty_bar_availability' as never)
  const missing =
    probe.error?.code === 'PGRST202' ||
    /could not find the function/i.test(probe.error?.message ?? '')
  rpcAvailable = !missing
})

describe('Phase 2C.13A Ingredient bar availability (read-only)', () => {
  it('player RPC returns bar keys + count only; Home known_bar_count agrees when active', async () => {
    if (!available || !rpcAvailable) {
      expect(rpcAvailable, 'migration 12000 functions not present on local API').toBe(true)
      return
    }

    // Use a roster Drink It! identity — no synthetic provisioning / no clock seed.
    const playerKey =
      fixtures.summary!.identities.find((i) => (i.games ?? []).includes('drinkit'))?.key ?? null
    expect(playerKey).toBeTruthy()
    const player = await signInAs(fixtures, playerKey!)
    const home = await player.rpc('get_my_current_ingredient_bounty')
    expect(home.error).toBeNull()

    const avail = await player.rpc('get_my_ingredient_bounty_bar_availability' as never)
    expect(avail.error).toBeNull()
    expect(avail.data).toBeTruthy()
    expect(Array.isArray(avail.data.bar_canonical_keys)).toBe(true)
    expect(typeof avail.data.bar_count).toBe('number')
    expect(avail.data.bar_count).toBe(avail.data.bar_canonical_keys.length)

    const keys = avail.data.bar_canonical_keys as string[]
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys.includes('mobile-order')).toBe(false)
    expect(JSON.stringify(avail.data)).not.toMatch(
      /drink_name|cocktail_name|qualifying_drink|offering_name/i,
    )
    expect(avail.data).not.toHaveProperty('drinks')
    expect(avail.data).not.toHaveProperty('offerings')

    if (home.data?.status === 'active' && avail.data.status === 'active') {
      expect(home.data.known_bar_count).toBe(avail.data.bar_count)
      expect(avail.data.bar_count).toBeGreaterThanOrEqual(0)
    }
  })

  it('denies anonymous callers', async () => {
    if (!available || !rpcAvailable) {
      expect(rpcAvailable).toBe(true)
      return
    }
    const anon = createLocalClient(fixtures.summary!.supabase_url, fixtures.anonKey!)
    const res = await anon.rpc('get_my_ingredient_bounty_bar_availability' as never)
    expect(res.error).toBeTruthy()
  })
})
