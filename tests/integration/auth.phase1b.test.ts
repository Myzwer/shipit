/**
 * Phase 1B Auth + membership integration (local Supabase).
 *
 *   LOCAL_TEST_PASSWORD='…' npm run test:auth
 */
import { beforeAll, describe, expect, it } from 'vitest'
import {
  createLocalClient,
  identity,
  loadLocalFixtures,
  signInAs,
  type LocalFixtures,
} from '../helpers/localSupabase'

let fixtures: LocalFixtures

beforeAll(async () => {
  fixtures = await loadLocalFixtures()
})

describe('Phase 1B Auth integration', () => {
  it('reports fixture availability', () => {
    expect(typeof fixtures.available).toBe('boolean')
    if (fixtures.password) expect(fixtures.available).toBe(true)
  })

  it('signs in with valid credentials for all provisioned identities', async () => {
    if (!fixtures.available || !fixtures.summary) return
    for (const row of fixtures.summary.identities) {
      const c = await signInAs(fixtures, row.key)
      const { data, error } = await c.rpc('get_my_session_profile')
      expect(error).toBeNull()
      expect(data.player_id).toBe(row.player_id)
      expect(data.display_name).toBe(row.display_name)
      await c.auth.signOut()
    }
  })

  it('rejects invalid credentials', async () => {
    if (!fixtures.available || !fixtures.summary || !fixtures.anonKey) return
    const drink = identity(fixtures.summary, 'drink_only')
    const c = createLocalClient(fixtures.summary.supabase_url, fixtures.anonKey)
    const { error } = await c.auth.signInWithPassword({
      email: drink.login_alias,
      password: 'definitely-wrong-password-xx',
    })
    expect(error).toBeTruthy()
  })

  it('maps drink-only membership to drinkit only', async () => {
    if (!fixtures.available) return
    const c = await signInAs(fixtures, 'drink_only')
    const { data } = await c.rpc('get_my_session_profile')
    const enabled = (data.games as Array<{ game: string; enabled: boolean }>)
      .filter((g) => g.enabled)
      .map((g) => g.game)
    expect(enabled).toEqual(['drinkit'])
    expect(data.team).toBeNull()
  })

  it('maps ship-only membership to shipit + team', async () => {
    if (!fixtures.available) return
    const c = await signInAs(fixtures, 'ship_only')
    const { data } = await c.rpc('get_my_session_profile')
    const enabled = (data.games as Array<{ game: string; enabled: boolean }>)
      .filter((g) => g.enabled)
      .map((g) => g.game)
    expect(enabled).toEqual(['shipit'])
    expect(data.team?.name).toBe('Demo Team Alpha')
  })

  it('maps dual-game membership to both games', async () => {
    if (!fixtures.available) return
    const c = await signInAs(fixtures, 'both')
    const { data } = await c.rpc('get_my_session_profile')
    const enabled = (data.games as Array<{ game: string; enabled: boolean }>)
      .filter((g) => g.enabled)
      .map((g) => g.game)
      .sort()
    expect(enabled).toEqual(['drinkit', 'shipit'])
  })

  it('maps no-games identity to empty enabled set', async () => {
    if (!fixtures.available || !fixtures.summary?.identities.some((i) => i.key === 'no_games')) {
      return
    }
    const c = await signInAs(fixtures, 'no_games')
    const { data } = await c.rpc('get_my_session_profile')
    const enabled = (data.games as Array<{ game: string; enabled: boolean }>).filter(
      (g) => g.enabled,
    )
    expect(enabled).toEqual([])
  })

  it('logs out and clears the Auth session', async () => {
    if (!fixtures.available) return
    const c = await signInAs(fixtures, 'both')
    await c.auth.signOut()
    const { data } = await c.auth.getSession()
    expect(data.session).toBeNull()
  })

  it('restores an Auth session from the persisted SDK session', async () => {
    if (!fixtures.available || !fixtures.summary || !fixtures.anonKey || !fixtures.password) return
    const both = identity(fixtures.summary, 'both')
    const first = createLocalClient(fixtures.summary.supabase_url, fixtures.anonKey)
    const { data: signed, error } = await first.auth.signInWithPassword({
      email: both.login_alias,
      password: fixtures.password,
    })
    expect(error).toBeNull()
    expect(signed.session?.access_token).toBeTruthy()

    // Simulate another client reconstituting from the same access/refresh tokens.
    const restored = createLocalClient(fixtures.summary.supabase_url, fixtures.anonKey)
    const { data: setData, error: setError } = await restored.auth.setSession({
      access_token: signed.session!.access_token,
      refresh_token: signed.session!.refresh_token,
    })
    expect(setError).toBeNull()
    expect(setData.session?.user.id).toBe(signed.session?.user.id)

    const { data: profile } = await restored.rpc('get_my_session_profile')
    expect(profile.player_id).toBe(both.player_id)
  })

  it('keeps non-admin from receiving is_admin true in session profile', async () => {
    if (!fixtures.available) return
    const c = await signInAs(fixtures, 'drink_only')
    const { data } = await c.rpc('get_my_session_profile')
    expect(data.is_admin).toBe(false)
  })
})
