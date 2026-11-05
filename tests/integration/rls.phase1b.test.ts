/**
 * Phase 1B RLS hardening — internal identity columns.
 *
 *   LOCAL_TEST_PASSWORD='…' npm run test:rls
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

describe('Phase 1B player column restrictions', () => {
  it('reports fixture availability', () => {
    expect(typeof fixtures.available).toBe('boolean')
    if (fixtures.password) expect(fixtures.available).toBe(true)
  })

  it('blocks peer reads of auth_user_id and is_admin via ordinary players select', async () => {
    if (!fixtures.available || !fixtures.summary) return
    const both = identity(fixtures.summary, 'both')
    const drink = identity(fixtures.summary, 'drink_only')
    const c = await signInAs(fixtures, 'both')

    const denied = await c
      .from('players')
      .select('id, display_name, auth_user_id, is_admin')
      .eq('id', drink.player_id)

    expect(denied.error).toBeTruthy()
    expect(denied.data).toBeNull()

    const rosterSafe = await c
      .from('players')
      .select('id, display_name')
      .eq('id', drink.player_id)
      .maybeSingle()
    expect(rosterSafe.error).toBeNull()
    expect(rosterSafe.data?.id).toBe(drink.player_id)
    expect(rosterSafe.data?.display_name).toBe(drink.display_name)
    expect(rosterSafe.data && 'auth_user_id' in rosterSafe.data).toBe(false)
    expect(rosterSafe.data && 'is_admin' in rosterSafe.data).toBe(false)

    const viaRoster = await c.from('player_roster').select('*').eq('id', drink.player_id).maybeSingle()
    expect(viaRoster.error).toBeNull()
    expect(Object.keys(viaRoster.data ?? {}).sort()).toEqual(['active', 'display_name', 'id'])

    // Own admin flag still available through the session RPC — not peer table reads.
    const { data: profile } = await c.rpc('get_my_session_profile')
    expect(profile.player_id).toBe(both.player_id)
    expect(typeof profile.is_admin).toBe('boolean')
  })

  it('still returns own is_admin via get_my_session_profile for organizer', async () => {
    if (!fixtures.available) return
    const c = await signInAs(fixtures, 'admin')
    const { data, error } = await c.rpc('get_my_session_profile')
    expect(error).toBeNull()
    expect(data.is_admin).toBe(true)
  })

  it('reflects revoked game membership in session profile and cross-game reads', async () => {
    if (!fixtures.available || !fixtures.summary || !fixtures.serviceRoleKey) return
    const both = identity(fixtures.summary, 'both')
    const admin = createLocalClient(fixtures.summary.supabase_url, fixtures.serviceRoleKey)

    // Temporarily disable Ship It! for dual-game member.
    const disable = await admin
      .from('game_memberships')
      .update({ enabled: false })
      .eq('player_id', both.player_id)
      .eq('game', 'shipit')
    expect(disable.error).toBeNull()

    try {
      const c = await signInAs(fixtures, 'both')
      const { data: profile } = await c.rpc('get_my_session_profile')
      const enabled = (profile.games as Array<{ game: string; enabled: boolean }>)
        .filter((g) => g.enabled)
        .map((g) => g.game)
      expect(enabled).toEqual(['drinkit'])

      const teams = await c.from('teams').select('id')
      expect(teams.data ?? []).toEqual([])

      const { data: hasShip } = await c.rpc('has_game', { p_game: 'shipit' })
      expect(hasShip).toBe(false)
    } finally {
      await admin
        .from('game_memberships')
        .update({ enabled: true })
        .eq('player_id', both.player_id)
        .eq('game', 'shipit')
    }
  })
})
