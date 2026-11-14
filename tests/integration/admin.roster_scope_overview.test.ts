/**
 * Cruise-scoped Admin roster + overview. Local fixtures only.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalClient, loadLocalFixtures, signInAs } from '../helpers/localSupabase'
import type { LocalFixtures } from '../helpers/localSupabase'
import { ensureSyntheticRoleIdentities } from '../helpers/syntheticRoles'

let fixtures: LocalFixtures

beforeAll(async () => {
  fixtures = await loadLocalFixtures()
  if (fixtures.available) {
    fixtures = await ensureSyntheticRoleIdentities(fixtures)
  }
}, 120000)

function requireLocal() {
  if (!fixtures.available || !fixtures.summary || !fixtures.anonKey || !fixtures.serviceRoleKey) {
    throw new Error('local fixtures unavailable — run db:provision')
  }
  return fixtures as Required<LocalFixtures> & { available: true }
}

describe('Admin roster scope + overview', () => {
  it('lists only Auth-linked cruise guests (excludes Demo roles and Auth-less synthetics)', async () => {
    const f = requireLocal()
    const admin = await signInAs(f, 'josh_forrester')
    const roster = await admin.rpc('admin_list_roster')
    expect(roster.error).toBeNull()
    expect(Array.isArray(roster.data)).toBe(true)
    expect(roster.data).toHaveLength(22)

    const aliases = (roster.data as Array<{ login_alias: string }>).map((r) =>
      String(r.login_alias || '').toLowerCase(),
    )
    expect(aliases.some((a) => a.startsWith('b2-synth-'))).toBe(false)
    expect(aliases.some((a) => a.startsWith('b4-synth-'))).toBe(false)
    expect(aliases).not.toContain('organizer@star-princess.local')
    expect(aliases).not.toContain('drink.only@star-princess.local')

    const teams = await admin.rpc('admin_list_teams')
    expect(teams.error).toBeNull()
    const teamNames = (teams.data as Array<{ name: string }>).map((t) => t.name)
    expect(teamNames.every((n) => !n.startsWith('Crew Synth'))).toBe(true)
    expect(teamNames.every((n) => !n.startsWith('Demo Team'))).toBe(true)
    expect(teamNames.length).toBe(6)

    const overview = await admin.rpc('admin_overview_summary')
    expect(overview.error).toBeNull()
    expect(overview.data.ok).toBe(true)
    expect(overview.data.players).toBe(22)
    expect(overview.data.drinkit_enabled).toBe(11)
    expect(overview.data.shipit_enabled).toBe(21)
    expect(overview.data.teams).toBe(6)
    expect(overview.data.shipit_unassigned).toBe(0)

    const player = await signInAs(f, 'june_becker')
    const denied = await player.rpc('admin_list_roster')
    expect(denied.error).toBeTruthy()
    const deniedOverview = await player.rpc('admin_overview_summary')
    expect(deniedOverview.error).toBeTruthy()
  })

  it('service role still sees Demo role rows in players table (filtered only from Admin list)', async () => {
    const f = requireLocal()
    const service = createLocalClient(f.summary!.supabase_url, f.serviceRoleKey!)
    const { data, error } = await service
      .from('players')
      .select('login_alias,active')
      .eq('login_alias', 'organizer@star-princess.local')
      .maybeSingle()
    expect(error).toBeNull()
    expect(data?.login_alias).toBe('organizer@star-princess.local')
  })
})
