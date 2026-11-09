/**
 * Provision disposable synthetic role accounts for achievement / engine tests.
 * Does not read, rewrite, or depend on private/roster keys.
 * Private roster rows stay intact; synthetics are merged only into the in-memory fixture summary.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createLocalClient,
  type LocalFixtures,
  type ProvisionedIdentity,
} from './localSupabase'

export const SYNTHETIC_ROLE_KEYS = [
  'drink_only',
  'ship_only',
  'both',
  'admin',
  'no_games',
] as const

export type SyntheticRoleKey = (typeof SYNTHETIC_ROLE_KEYS)[number]

const SYNTHETIC_ROLE_DEFS: Array<{
  key: SyntheticRoleKey
  display_name: string
  login_alias: string
  is_admin: boolean
  games: Array<'drinkit' | 'shipit'>
  team: string | null
}> = [
  {
    key: 'drink_only',
    display_name: 'Demo Drink Only',
    login_alias: 'drink.only@star-princess.local',
    is_admin: false,
    games: ['drinkit'],
    team: null,
  },
  {
    key: 'ship_only',
    display_name: 'Demo Ship Only',
    login_alias: 'ship.only@star-princess.local',
    is_admin: false,
    games: ['shipit'],
    team: 'Demo Team Alpha',
  },
  {
    key: 'both',
    display_name: 'Demo Both Games',
    login_alias: 'both.games@star-princess.local',
    is_admin: false,
    games: ['drinkit', 'shipit'],
    team: 'Demo Team Alpha',
  },
  {
    key: 'admin',
    display_name: 'Demo Organizer',
    login_alias: 'organizer@star-princess.local',
    is_admin: true,
    games: ['drinkit', 'shipit'],
    team: 'Demo Team Bravo',
  },
  {
    key: 'no_games',
    display_name: 'Demo No Games',
    login_alias: 'no.games@star-princess.local',
    is_admin: false,
    games: [],
    team: null,
  },
]

export async function ensureSyntheticRoleIdentities(
  fixtures: LocalFixtures,
): Promise<LocalFixtures> {
  if (!fixtures.available || !fixtures.summary || !fixtures.serviceRoleKey || !fixtures.password) {
    throw new Error('synthetic roles require local fixtures + LOCAL_TEST_PASSWORD')
  }

  const service = createLocalClient(fixtures.summary.supabase_url, fixtures.serviceRoleKey)
  const teamCache = new Map<string, string>()
  const provisioned: ProvisionedIdentity[] = []

  for (const role of SYNTHETIC_ROLE_DEFS) {
    const authUserId = await ensureAuthUser(service, role.login_alias, fixtures.password)
    const playerId = await ensurePlayer(service, role, authUserId)

    await service.from('game_memberships').delete().eq('player_id', playerId)
    await service
      .from('team_memberships')
      .update({ active_to: new Date().toISOString() })
      .eq('player_id', playerId)
      .is('active_to', null)

    if (role.team) {
      let teamId = teamCache.get(role.team)
      if (!teamId) {
        teamId = await ensureTeam(service, role.team)
        teamCache.set(role.team, teamId)
      }
      const { error: teamError } = await service.from('team_memberships').insert({
        player_id: playerId,
        team_id: teamId,
        active_from: new Date().toISOString(),
        active_to: null,
      })
      if (teamError) throw teamError
    }

    for (const game of role.games) {
      const { error: membershipError } = await service.from('game_memberships').insert({
        player_id: playerId,
        game,
        enabled: true,
      })
      if (membershipError) throw membershipError
    }

    provisioned.push({
      key: role.key,
      display_name: role.display_name,
      login_alias: role.login_alias,
      player_id: playerId,
      games: role.games,
      team: role.team,
      is_admin: role.is_admin,
    })
  }

  const privateOnly = fixtures.summary.identities.filter(
    (row) => !SYNTHETIC_ROLE_KEYS.includes(row.key as SyntheticRoleKey),
  )

  return {
    ...fixtures,
    summary: {
      ...fixtures.summary,
      identities: [...provisioned, ...privateOnly],
    },
  }
}

async function ensureTeam(service: SupabaseClient, name: string) {
  const { data: existing, error: findError } = await service
    .from('teams')
    .select('id')
    .ilike('name', name)
    .maybeSingle()
  if (findError) throw findError
  if (existing) return existing.id as string

  const { data, error } = await service.from('teams').insert({ name, active: true }).select('id').single()
  if (error) throw error
  return data.id as string
}

async function ensureAuthUser(service: SupabaseClient, email: string, password: string) {
  const { data: listed, error: listError } = await service.auth.admin.listUsers({ perPage: 200 })
  if (listError) throw listError
  const found = listed.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
  if (found) {
    const { error: updateError } = await service.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
      ban_duration: 'none',
    })
    if (updateError) throw updateError
    return found.id
  }
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  return data.user!.id
}

async function ensurePlayer(
  service: SupabaseClient,
  role: (typeof SYNTHETIC_ROLE_DEFS)[number],
  authUserId: string,
) {
  const { data: existing, error: findError } = await service
    .from('players')
    .select('id')
    .eq('login_alias', role.login_alias)
    .maybeSingle()
  if (findError) throw findError

  if (existing) {
    const { data, error } = await service
      .from('players')
      .update({
        auth_user_id: authUserId,
        display_name: role.display_name,
        is_admin: role.is_admin,
        active: true,
      })
      .eq('id', existing.id)
      .select('id')
      .single()
    if (error) throw error
    return data.id as string
  }

  const { data, error } = await service
    .from('players')
    .insert({
      auth_user_id: authUserId,
      display_name: role.display_name,
      login_alias: role.login_alias,
      is_admin: role.is_admin,
      active: true,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}
