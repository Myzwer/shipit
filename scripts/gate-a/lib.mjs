/**
 * Gate A — disposable-only helpers (:55321 / star-princess-disposable-mo).
 * Never targets organizer :54321 or Agent 2 :56321.
 * Never sets QA_ALLOW_ORGANIZER_MUTATION=1.
 */
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import ws from 'ws'

export const DISPOSABLE_URL = 'http://127.0.0.1:55321'
export const ORGANIZER_CRUISE_EXPECTED = '48fa40c6-e7cd-4f8f-8b81-e3e48d10eb13'
export const AGENT2_CRUISE_EXPECTED = '191aaab1-c67a-445d-86e7-8fd6f99fc26d'
export const DISPOSABLE_DB = 'supabase_db_star-princess-disposable-mo'
export const ORGANIZER_DB = 'supabase_db_star-princess-local'
export const AGENT2_DB = 'supabase_db_star-princess-qa2-backend'

export const DEV_DAY1 = '2099-01-03' // Saturday
export const DEV_OFFSET_MIN = -240
export const ROOT = process.cwd()
export const EVIDENCE = join(ROOT, 'docs/qa/campaign/final-acceptance/gate-a/evidence')
export const GATE_A = join(ROOT, 'docs/qa/campaign/final-acceptance/gate-a')

mkdirSync(EVIDENCE, { recursive: true })

export function loadDisposableEnv() {
  if (process.env.QA_ALLOW_ORGANIZER_MUTATION === '1') {
    throw new Error('REFUSE: QA_ALLOW_ORGANIZER_MUTATION must not be set')
  }
  const path = join(ROOT, '.local/qa2a-disposable.env')
  if (!existsSync(path)) throw new Error(`missing ${path}`)
  const env = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
  for (const k of [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'LOCAL_TEST_PASSWORD',
  ]) {
    if (!env[k]) throw new Error(`.local/qa2a-disposable.env missing ${k}`)
  }
  if (env.VITE_SUPABASE_URL !== DISPOSABLE_URL) {
    throw new Error(`REFUSING: URL ${env.VITE_SUPABASE_URL} is not ${DISPOSABLE_URL}`)
  }
  return env
}

export function createClients(env = loadDisposableEnv()) {
  const opts = {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  }
  return {
    env,
    service: createClient(DISPOSABLE_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts),
    anon: () => createClient(DISPOSABLE_URL, env.VITE_SUPABASE_ANON_KEY, opts),
  }
}

export function sql(container, statement) {
  return execFileSync(
    'docker',
    ['exec', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', statement],
    { encoding: 'utf8' },
  ).trim()
}

export function disposableSql(statement) {
  return sql(DISPOSABLE_DB, statement)
}

export function disposableJson(selectSql) {
  const out = disposableSql(`select coalesce(json_agg(t), '[]'::json) from (${selectSql}) t`)
  return JSON.parse(out)
}

export function organizerCruiseId() {
  return sql(
    ORGANIZER_DB,
    'select id from public.cruise_config where is_active limit 1;',
  )
}

export function agent2CruiseId() {
  return sql(
    AGENT2_DB,
    'select id from public.cruise_config where is_active limit 1;',
  )
}

export function assertProtectedStacksUnchanged(beforeOrg, beforeA2) {
  const org = organizerCruiseId()
  const a2 = agent2CruiseId()
  return {
    organizer: {
      before: beforeOrg,
      after: org,
      unchanged: org === beforeOrg,
      matches_expected: org === ORGANIZER_CRUISE_EXPECTED,
    },
    agent2: {
      before: beforeA2,
      after: a2,
      unchanged: a2 === beforeA2,
      matches_expected: a2 === AGENT2_CRUISE_EXPECTED,
    },
  }
}

export function shipLocalToUtcIso(shipDate, time, offsetMinutes = DEV_OFFSET_MIN) {
  const ship = new Date(`${shipDate}T${time}Z`)
  return new Date(ship.getTime() - offsetMinutes * 60_000).toISOString()
}

export function dayDate(day, day1 = DEV_DAY1) {
  const d = new Date(`${day1}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + (day - 1))
  return d.toISOString().slice(0, 10)
}

export const slotUtc = (day, time, day1 = DEV_DAY1) =>
  shipLocalToUtcIso(dayDate(day, day1), time)

export function makeRecorder(label) {
  const results = []
  return {
    label,
    results,
    record(id, status, detail = {}) {
      const row = { id, status, ...detail, at: new Date().toISOString() }
      results.push(row)
      const summary = detail.summary ? ` — ${detail.summary}` : ''
      console.log(`[${status}] ${id}${summary}`)
      return row
    },
    totals() {
      const t = { pass: 0, fail: 0, info: 0, blocked: 0, skip: 0 }
      for (const r of results) {
        const k = String(r.status).toLowerCase()
        if (k in t) t[k] += 1
      }
      t.total = results.length
      return t
    },
  }
}

export function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + '\n')
  console.log('wrote', path)
}

export function loadIdentities() {
  return JSON.parse(readFileSync(join(ROOT, '.local/qa2a-identities.json'), 'utf8'))
}

export async function signIn(anonFactory, email, password) {
  const client = anonFactory()
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
  return client
}

export async function ensureCruiseNotOrganizer(service) {
  const { data: cruise, error } = await service
    .from('cruise_config')
    .select('id, label, day1_ship_date, base_ship_offset_minutes')
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error
  if (!cruise) throw new Error('REFUSE: no active cruise')
  if (cruise.id === ORGANIZER_CRUISE_EXPECTED) throw new Error('REFUSE: organizer cruise id')
  if (cruise.id === AGENT2_CRUISE_EXPECTED) throw new Error('REFUSE: agent2 cruise id')
  return cruise
}

export async function resetClockPreCruise(service, day1 = DEV_DAY1, offset = DEV_OFFSET_MIN) {
  const { error } = await service.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: day1,
    p_base_offset_minutes: offset,
    p_label: 'development-only',
  })
  if (error) throw new Error(`dev_seed_cruise_clock: ${error.message}`)
  for (const game of ['drinkit', 'shipit']) {
    const { error: e } = await service
      .from('game_control')
      .update({ finalized_at_utc: null, status: 'active' })
      .eq('game', game)
    if (e) throw new Error(`game_control reset: ${e.message}`)
  }
  await service.rpc('dev_set_drinkit_paused', { p_paused: false })
  return ensureCruiseNotOrganizer(service)
}

export async function clearSchedule(service) {
  await service.from('cruise_config').update({ label: 'development-only' }).eq('is_active', true)
  const { error } = await service.rpc('dev_clear_bounty_schedule_ledger')
  if (error) throw new Error(`dev_clear_bounty_schedule_ledger: ${error.message}`)
}

export async function exposeSlots(service, atUtc) {
  await service.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: atUtc })
  await service.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: atUtc })
}

export function drinkPayload({
  barKey,
  offeringId,
  companions = [],
  selectedClaims = [],
  key,
  mode,
  confirmContainsIngredientKey,
} = {}) {
  const drink = offeringId
    ? {
        mode: 'named_catalog',
        offering_id: offeringId,
        ...(confirmContainsIngredientKey
          ? { confirm_contains_ingredient_key: confirmContainsIngredientKey }
          : {}),
      }
    : { mode: mode ?? 'generic_beer' }
  return {
    idempotency_key: key ?? randomUUID(),
    bar_canonical_key: barKey,
    drink,
    companion_player_ids: companions,
    bar_eligible_companion_ids: [],
    selected_claims: selectedClaims,
    caption: null,
    photo_storage_key: null,
  }
}

export async function submitDrinkAt(service, playerId, payload, atUtc) {
  await exposeSlots(service, atUtc)
  return service.rpc('dev_submit_drink_at', {
    p_payload: payload,
    p_at_utc: atUtc,
    p_player_id: playerId,
  })
}

export function newId() {
  return randomUUID()
}
