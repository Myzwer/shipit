/**
 * Load the Phase 7B2 working achievement catalog into local development.
 *
 *   npx supabase db reset && LOCAL_TEST_PASSWORD='…' npm run db:provision
 *   npm run db:load-working-achievements
 *
 * Idempotent upsert by stable_key. Only runs against development-only cruises.
 * Never invents awards. Never writes from the browser client.
 */
import { createClient } from '@supabase/supabase-js'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

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

function loadCatalog() {
  // Prefer compiled/transpiled path via vite-node when available; fall back to JSON export.
  const jsonPath = join(__dir, '../content/achievements/workingCatalog.json')
  try {
    return JSON.parse(readFileSync(jsonPath, 'utf8'))
  } catch {
    /* continue */
  }
  // Dynamic import of TS via vite-node spawn is awkward; generate JSON alongside.
  throw new Error(
    'Missing content/achievements/workingCatalog.json — run: node scripts/export-working-catalog.mjs',
  )
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
})

// Ensure an active development-only cruise exists (loader is gated on that label).
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

const catalog = loadCatalog()
const keepKeys = []
let enabled = 0
let disabled = 0
let errors = 0

for (const row of catalog) {
  const stub =
    !row.conditionType || !row.conditionConfig
      ? {
          condition_type: 'event_count',
          condition_config: { event: 'drink_log', threshold: 999999 },
        }
      : {
          condition_type: row.conditionType,
          condition_config: row.conditionConfig,
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
    condition_type: stub.condition_type,
    condition_config: stub.condition_config,
    test_only: true,
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
      total: catalog.length,
      upserted: keepKeys.length,
      enabled,
      disabled,
      removedDisabled: disableRes?.disabled ?? 0,
      errors,
    },
    null,
    2,
  ),
)
process.exit(errors ? 1 : 0)
