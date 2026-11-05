/**
 * Phase 1A RLS integration tests.
 * Requires local Supabase + provisioned identities.
 *
 *   npx supabase start
 *   LOCAL_TEST_PASSWORD='…' npm run db:provision
 *   LOCAL_TEST_PASSWORD='…' npm run test:rls
 *
 * Skips automatically when local Supabase / identities are unavailable (e.g. CI without Docker).
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'
import ws from 'ws'

type IdentitySummary = {
  supabase_url: string
  identities: Array<{
    key: string
    display_name: string
    login_alias: string
    player_id: string
    games: string[]
    team: string | null
    is_admin: boolean
  }>
}

const password = process.env.LOCAL_TEST_PASSWORD
const identitiesPath = join(process.cwd(), '.local', 'test-identities.json')

let summary: IdentitySummary | null = null
let anonKey: string | null = null
let available = false

function client(url: string, key: string) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Node < 22 has no native WebSocket; supabase-js requires an explicit transport.
    realtime: { transport: ws as unknown as typeof WebSocket },
  })
}

async function signIn(loginAlias: string): Promise<SupabaseClient> {
  if (!summary || !anonKey || !password) throw new Error('missing local auth fixtures')
  const c = client(summary.supabase_url, anonKey)
  const { error } = await c.auth.signInWithPassword({
    email: loginAlias,
    password,
  })
  if (error) throw error
  return c
}

function identity(key: string) {
  const row = summary?.identities.find((i) => i.key === key)
  if (!row) throw new Error(`missing identity ${key}`)
  return row
}

beforeAll(async () => {
  if (!password) {
    available = false
    return
  }
  try {
    const raw = await readFile(identitiesPath, 'utf8')
    summary = JSON.parse(raw) as IdentitySummary
    anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || null
    if (!anonKey) {
      const { execSync } = await import('node:child_process')
      const envText = execSync('npx supabase status -o env', { encoding: 'utf8' })
      const match = envText.match(/^ANON_KEY=(.+)$/m)
      anonKey = match?.[1]?.replace(/^"|"$/g, '') ?? null
    }
    available = Boolean(summary?.supabase_url && anonKey && summary.identities.length >= 4)
  } catch {
    available = false
  }
})

describe('Phase 1A RLS (local Supabase)', () => {
  it('reports fixture availability', () => {
    // When Docker/Supabase are missing, remaining cases no-op so default CI stays green.
    // If LOCAL_TEST_PASSWORD is set, fixtures must load — otherwise we'd false-green.
    expect(typeof available).toBe('boolean')
    if (password) {
      expect(available).toBe(true)
    }
  })

  it('allows anon to read login_directory only (no sensitive fields)', async () => {
    if (!available || !summary || !anonKey) return
    const c = client(summary.supabase_url, anonKey)
    const { data, error } = await c.from('login_directory').select('*')
    expect(error).toBeNull()
    expect(data?.length).toBeGreaterThan(0)
    for (const row of data ?? []) {
      expect(Object.keys(row).sort()).toEqual(['display_name', 'login_alias'])
    }

    const players = await c.from('players').select('id, is_admin, auth_user_id')
    expect(players.data ?? []).toEqual([])
  })

  it('resolves authenticated identity to the correct player profile', async () => {
    if (!available) return
    const both = identity('both')
    const c = await signIn(both.login_alias)
    const { data, error } = await c.rpc('get_my_session_profile')
    expect(error).toBeNull()
    expect(data.player_id).toBe(both.player_id)
    expect(data.display_name).toBe(both.display_name)
    expect(data.team?.name).toBe('Demo Team Alpha')
    const games = (data.games as Array<{ game: string }>).map((g) => g.game).sort()
    expect(games).toEqual(['drinkit', 'shipit'])
  })

  it('prevents drink-only member from reading Ship It! teams', async () => {
    if (!available) return
    const drink = identity('drink_only')
    const c = await signIn(drink.login_alias)
    const teams = await c.from('teams').select('id, name')
    expect(teams.error).toBeNull()
    expect(teams.data ?? []).toEqual([])

    const memberships = await c.from('team_memberships').select('id')
    expect(memberships.data ?? []).toEqual([])
  })

  it('prevents ship-only member from reading drink-only player rows', async () => {
    if (!available) return
    const ship = identity('ship_only')
    const drink = identity('drink_only')
    const c = await signIn(ship.login_alias)
    const { data, error } = await c.from('players').select('id, display_name').eq('id', drink.player_id)
    expect(error).toBeNull()
    expect(data ?? []).toEqual([])
  })

  it('allows dual-game member to see both scopes', async () => {
    if (!available) return
    const both = identity('both')
    const drink = identity('drink_only')
    const ship = identity('ship_only')
    const c = await signIn(both.login_alias)

    const players = await c.from('players').select('id')
    const ids = new Set((players.data ?? []).map((p) => p.id))
    expect(ids.has(drink.player_id)).toBe(true)
    expect(ids.has(ship.player_id)).toBe(true)

    const teams = await c.from('teams').select('name')
    expect((teams.data ?? []).length).toBeGreaterThan(0)
  })

  it('rejects self-elevation to admin and membership edits', async () => {
    if (!available) return
    const drink = identity('drink_only')
    const c = await signIn(drink.login_alias)

    const elevate = await c.from('players').update({ is_admin: true }).eq('id', drink.player_id).select()
    expect(elevate.data ?? []).toEqual([])

    const insertMembership = await c
      .from('game_memberships')
      .insert({ player_id: drink.player_id, game: 'shipit', enabled: true })
      .select()
    expect(insertMembership.data ?? []).toEqual([])
    expect(insertMembership.error).toBeTruthy()

    const { data: profile } = await c.rpc('get_my_session_profile')
    expect(profile.is_admin).toBe(false)
  })

  it('rejects unauthenticated private roster reads', async () => {
    if (!available || !summary || !anonKey) return
    const c = client(summary.supabase_url, anonKey)
    const players = await c.from('players').select('id')
    expect(players.data ?? []).toEqual([])
    const memberships = await c.from('game_memberships').select('*')
    expect(memberships.data ?? []).toEqual([])
  })

  it('enforces one active team membership via unique index', async () => {
    if (!available || !summary) return
    const { execSync } = await import('node:child_process')
    const envText = execSync('npx supabase status -o env', { encoding: 'utf8' })
    const service = envText.match(/^SERVICE_ROLE_KEY=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
    if (!service) return

    const admin = client(summary.supabase_url, service)
    const ship = identity('ship_only')
    const { data: teams } = await admin.from('teams').select('id').limit(2)

    let secondTeamId = teams?.[1]?.id
    if (!secondTeamId) {
      const created = await admin.from('teams').insert({ name: 'Demo Team Constraint' }).select('id').single()
      secondTeamId = created.data?.id
    }
    if (!secondTeamId) return

    const attempt = await admin.from('team_memberships').insert({
      player_id: ship.player_id,
      team_id: secondTeamId,
      active_to: null,
    })
    expect(attempt.error).toBeTruthy()
  })
})
