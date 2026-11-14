/**
 * Provision disposable synthetic role identities on :55321 only.
 *
 *   node scripts/qa2a/setup-synthetics.mjs
 *
 * Loads env from .local/qa2a-disposable.env (gitignored).
 * Refuses organizer :54321. Never sets QA_ALLOW_ORGANIZER_MUTATION.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { spawnSync } from 'node:child_process'
import ws from 'ws'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const disposableWorkdir =
  process.env.QA_DISPOSABLE_WORKDIR ||
  '/Users/josh/Documents/Web Projects/Vue/Ship-It-disposable-mo'

async function loadEnvFile(path) {
  const env = {}
  const raw = await readFile(path, 'utf8')
  for (const line of raw.split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    env[line.slice(0, i)] = line.slice(i + 1)
  }
  return env
}

const fileEnv = await loadEnvFile(join(root, '.local/qa2a-disposable.env'))
const url = fileEnv.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = fileEnv.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const password = fileEnv.LOCAL_TEST_PASSWORD || process.env.LOCAL_TEST_PASSWORD
const identitiesPath =
  fileEnv.QA_E2E_IDENTITIES ||
  join(disposableWorkdir, '.local/test-identities.json')

if (!url || !serviceKey || !password) {
  console.error('Missing disposable URL / service key / password')
  process.exit(1)
}
if (!url.includes(':55321')) {
  console.error('REFUSE: QA-2A synthetics only against disposable :55321, got', url)
  process.exit(1)
}
if (process.env.QA_ALLOW_ORGANIZER_MUTATION === '1') {
  console.error('REFUSE: QA_ALLOW_ORGANIZER_MUTATION must not be set')
  process.exit(1)
}

const status = spawnSync('npx', ['supabase', 'status', '-o', 'env'], {
  cwd: disposableWorkdir,
  encoding: 'utf8',
})
const statusUrl = status.stdout.match(/^API_URL=(.+)$/m)?.[1]?.replace(/^"|"$/g, '')
if (statusUrl !== url) {
  console.error('REFUSE: disposable status URL mismatch', { statusUrl, url })
  process.exit(1)
}

const SYNTHETIC_ROLE_DEFS = [
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

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
})

async function ensureTeam(name) {
  const { data: existing, error: findError } = await service
    .from('teams')
    .select('id')
    .ilike('name', name)
    .maybeSingle()
  if (findError) throw findError
  if (existing) return existing.id
  const { data, error } = await service.from('teams').insert({ name, active: true }).select('id').single()
  if (error) throw error
  return data.id
}

async function ensureAuthUser(email) {
  const { data: listed, error: listError } = await service.auth.admin.listUsers({ perPage: 200 })
  if (listError) throw listError
  const found = listed.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
  if (found) {
    const { error } = await service.auth.admin.updateUserById(found.id, {
      password,
      email_confirm: true,
      ban_duration: 'none',
    })
    if (error) throw error
    return found.id
  }
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) throw error
  return data.user.id
}

async function ensurePlayer(role, authUserId) {
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
    return data.id
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
  return data.id
}

const summary = JSON.parse(await readFile(identitiesPath, 'utf8'))
if (!String(summary.supabase_url).includes(':55321')) {
  console.error('REFUSE: identities file not disposable', summary.supabase_url)
  process.exit(1)
}

const teamCache = new Map()
const provisioned = []

for (const role of SYNTHETIC_ROLE_DEFS) {
  const authUserId = await ensureAuthUser(role.login_alias)
  const playerId = await ensurePlayer(role, authUserId)

  await service.from('game_memberships').delete().eq('player_id', playerId)
  await service
    .from('team_memberships')
    .update({ active_to: new Date().toISOString() })
    .eq('player_id', playerId)
    .is('active_to', null)

  if (role.team) {
    let teamId = teamCache.get(role.team)
    if (!teamId) {
      teamId = await ensureTeam(role.team)
      teamCache.set(role.team, teamId)
    }
    const { error } = await service.from('team_memberships').insert({
      player_id: playerId,
      team_id: teamId,
      active_from: new Date().toISOString(),
      active_to: null,
    })
    if (error) throw error
  }

  for (const game of role.games) {
    const { error } = await service.from('game_memberships').insert({
      player_id: playerId,
      game,
      enabled: true,
    })
    if (error) throw error
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

const privateOnly = (summary.identities || []).filter(
  (row) => !SYNTHETIC_ROLE_DEFS.some((r) => r.key === row.key),
)
const out = {
  supabase_url: url,
  identities: [...provisioned, ...privateOnly],
  provisioned_at: new Date().toISOString(),
  note: 'QA-2A disposable synthetics + private roster keys; do not commit',
}

const outPath = join(root, '.local/qa2a-identities.json')
await writeFile(outPath, JSON.stringify(out, null, 2))
console.log(
  JSON.stringify(
    {
      wrote: outPath,
      synthetics: provisioned.map((p) => ({ key: p.key, player_id: p.player_id })),
      private_count: privateOnly.length,
      url,
    },
    null,
    2,
  ),
)
