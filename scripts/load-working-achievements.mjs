/**
 * Load the working achievement catalog into local development.
 *
 *   npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
 *   npm run db:load-working-achievements
 *
 * Composes base 140 + Stage A3 packs. Resolves companion aliases via private roster.
 * Idempotent upsert by stable_key. Only runs against development-only cruises.
 * Never invents awards. Never writes from the browser client.
 * Never runs the production achievement loader.
 */
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import ws from 'ws'
import { composeWorkingAchievements } from './lib/composeWorkingAchievements.mjs'
import {
  loadCompanionAliasVocabulary,
  loadPrivateCompanionAliasMap,
  loadPrivateRosterPlayers,
  materializeConditionConfig,
} from './lib/resolveCompanionAliases.mjs'

const __dir = dirname(fileURLToPath(import.meta.url))

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

const sb = readSupabaseEnv()
const url = sb.API_URL || sb.SUPABASE_URL
const serviceRole = sb.SERVICE_ROLE_KEY || sb.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRole) {
  console.error('Could not read local Supabase URL/service role from status.')
  process.exit(1)
}

const admin = createClient(url, serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
  realtime: { transport: ws },
})

{
  const { data: cruise } = await admin
    .from('cruise_config')
    .select('id, label, is_active')
    .eq('is_active', true)
    .maybeSingle()
  if (!cruise || cruise.label !== 'development-only') {
    const { error } = await admin.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: '2099-01-03',
      p_base_offset_minutes: -240,
      p_label: 'development-only',
    })
    if (error) {
      console.error('dev_seed_cruise_clock failed', error.message)
      process.exit(1)
    }
  }
}

const { definitions: catalog, counts } = composeWorkingAchievements()
const aliasVocab = loadCompanionAliasVocabulary()
const privateAliasMap = loadPrivateCompanionAliasMap()
const rosterPlayers = loadPrivateRosterPlayers()
const { data: playerRows, error: playerError } = await admin
  .from('players')
  .select('id, login_alias')
  .eq('active', true)
if (playerError) {
  console.error('Failed to load players for alias resolution', playerError.message)
  process.exit(1)
}
const loginAliasToPlayerId = new Map(
  (playerRows || []).map((p) => [String(p.login_alias).toLowerCase(), p.id]),
)
const resolveCtx = {
  publicAliases: aliasVocab.aliases || [],
  privateAliasMap,
  rosterPlayers: rosterPlayers || [],
  loginAliasToPlayerId,
}

const keepKeys = []
let enabled = 0
let disabled = 0
let errors = 0
const aliasFailures = []

for (const row of catalog) {
  let conditionType = row.conditionType
  let conditionConfig = row.conditionConfig

  if (!conditionType || !conditionConfig) {
    conditionType = 'event_count'
    conditionConfig = { event: 'drink_log', threshold: 999999 }
  } else {
    const materialized = materializeConditionConfig(conditionConfig, resolveCtx)
    if (materialized.unresolved.length > 0 && row.enabledInDev) {
      aliasFailures.push({
        stable_key: row.stableKey,
        unresolved: materialized.unresolved.map((u) => ({
          alias: u.alias,
          reason: u.reason,
        })),
      })
      errors += 1
      continue
    }
    conditionConfig = materialized.config
  }

  const payload = {
    stable_key: row.stableKey,
    game: row.game,
    owner_type: row.ownerType,
    group_key: row.groupKey,
    title: row.title,
    display_description: row.displayDescription,
    secret: !!row.secret,
    exclusive: !!row.exclusive,
    enabled: !!row.enabledInDev,
    condition_type: conditionType,
    condition_config: conditionConfig,
    test_only: true,
    icon_key: row.iconKey || null,
  }

  const { data, error } = await admin.rpc('dev_upsert_working_achievement_definition', {
    p_row: payload,
  })
  if (error || !data?.ok) {
    console.error('FAIL', row.stableKey, error?.message || JSON.stringify(data))
    errors += 1
    continue
  }
  keepKeys.push(row.stableKey)
  if (payload.enabled) enabled += 1
  else disabled += 1
}

if (aliasFailures.length > 0) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        code: 'COMPANION_ALIAS_UNRESOLVED',
        message:
          'Required private roster aliases could not be resolved. Fail closed — fix private/roster or provision identities.',
        failures: aliasFailures,
      },
      null,
      2,
    ),
  )
  process.exit(1)
}

const { data: disableRes, error: disableErr } = await admin.rpc(
  'dev_disable_missing_working_achievements',
  { p_keep_keys: keepKeys },
)
if (disableErr) {
  console.error('disable-missing failed', disableErr.message)
  process.exit(1)
}

console.log(
  JSON.stringify(
    {
      ok: errors === 0,
      composed: counts,
      upserted: keepKeys.length,
      enabled,
      disabled,
      removedDisabled: disableRes?.disabled ?? 0,
      errors,
      alias_resolution:
        privateAliasMap && rosterPlayers
          ? 'private_alias_map'
          : 'unavailable_private_alias_map',
      companion_aliases_public: (aliasVocab.aliases || []).length,
    },
    null,
    2,
  ),
)
process.exit(errors ? 1 : 0)
