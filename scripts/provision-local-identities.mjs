/**
 * Provision local-only Auth users + player/team rows for Phase 1A RLS tests.
 *
 * Usage (local Supabase must be running):
 *   LOCAL_TEST_PASSWORD='…' node scripts/provision-local-identities.mjs
 *
 * Writes a gitignored summary to .local/test-identities.json (no service-role key).
 * Never commit passwords or service-role secrets.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import ws from 'ws'

function readSupabaseEnv() {
  const raw = execSync('npx supabase status -o env', { encoding: 'utf8' })
  const env = {}
  for (const line of raw.split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!match) continue
    env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  return env
}

const password = process.env.LOCAL_TEST_PASSWORD
if (!password || password.length < 12) {
  console.error(
    'Set LOCAL_TEST_PASSWORD to a local-only password (≥12 chars). Do not use a real production password.',
  )
  process.exit(1)
}

const sbEnv = readSupabaseEnv()
const url = sbEnv.API_URL || sbEnv.SUPABASE_URL
const serviceRole = sbEnv.SERVICE_ROLE_KEY || sbEnv.SUPABASE_SERVICE_ROLE_KEY
const anonKey = sbEnv.ANON_KEY || sbEnv.SUPABASE_ANON_KEY

if (!url || !serviceRole || !anonKey) {
  console.error('Could not read local Supabase URL/keys from `supabase status -o env`.')
  process.exit(1)
}

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
  // Node < 22 has no native WebSocket; supabase-js requires an explicit transport.
  realtime: { transport: ws },
})

const identities = [
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
]

async function ensureTeam(name) {
  const { data: existing, error: findError } = await admin
    .from('teams')
    .select('id, name')
    .ilike('name', name)
    .maybeSingle()
  if (findError) throw findError
  if (existing) return existing

  const { data, error } = await admin.from('teams').insert({ name, color: null }).select('id, name').single()
  if (error) throw error
  return data
}

async function ensureAuthUser(email) {
  const { data: listed, error: listError } = await admin.auth.admin.listUsers({ perPage: 200 })
  if (listError) throw listError
  const found = listed.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (found) {
    const { error: updateError } = await admin.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
      ban_duration: 'none',
    })
    if (updateError) throw updateError
    return found.id
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  return data.user.id
}

async function ensurePlayer(identity, authUserId) {
  const { data: existing, error: findError } = await admin
    .from('players')
    .select('id')
    .eq('login_alias', identity.login_alias)
    .maybeSingle()
  if (findError) throw findError

  if (existing) {
    const { data, error } = await admin
      .from('players')
      .update({
        auth_user_id: authUserId,
        display_name: identity.display_name,
        is_admin: identity.is_admin,
        active: true,
      })
      .eq('id', existing.id)
      .select('id')
      .single()
    if (error) throw error
    return data.id
  }

  const { data, error } = await admin
    .from('players')
    .insert({
      auth_user_id: authUserId,
      display_name: identity.display_name,
      login_alias: identity.login_alias,
      is_admin: identity.is_admin,
      active: true,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

const teamCache = {}
const summary = {
  created_at: new Date().toISOString(),
  supabase_url: url,
  anon_key_present: Boolean(anonKey),
  password_source: 'LOCAL_TEST_PASSWORD env (not written here)',
  identities: [],
}

for (const identity of identities) {
  const authUserId = await ensureAuthUser(identity.login_alias)
  const playerId = await ensurePlayer(identity, authUserId)

  // Reset in constraint-safe order: drop game memberships before closing teams.
  {
    const { error } = await admin.from('game_memberships').delete().eq('player_id', playerId)
    if (error) throw error
  }
  {
    const { error } = await admin
      .from('team_memberships')
      .update({ active_to: new Date().toISOString() })
      .eq('player_id', playerId)
      .is('active_to', null)
    if (error) throw error
  }

  if (identity.team) {
    if (!teamCache[identity.team]) {
      teamCache[identity.team] = await ensureTeam(identity.team)
    }
    const { error: teamError } = await admin.from('team_memberships').insert({
      player_id: playerId,
      team_id: teamCache[identity.team].id,
      active_from: new Date().toISOString(),
      active_to: null,
    })
    if (teamError) throw teamError
  }

  for (const game of identity.games) {
    const { error: gmError } = await admin.from('game_memberships').insert({
      player_id: playerId,
      game,
      enabled: true,
    })
    if (gmError) throw gmError
  }

  summary.identities.push({
    key: identity.key,
    display_name: identity.display_name,
    login_alias: identity.login_alias,
    player_id: playerId,
    auth_user_id: authUserId,
    games: identity.games,
    team: identity.team,
    is_admin: identity.is_admin,
  })
}

await mkdir('.local', { recursive: true })
const outPath = join('.local', 'test-identities.json')
await writeFile(outPath, `${JSON.stringify(summary, null, 2)}\n`)

console.log(`Provisioned ${summary.identities.length} local identities.`)
console.log(`Wrote ${outPath} (gitignored). Password kept only in LOCAL_TEST_PASSWORD.`)
