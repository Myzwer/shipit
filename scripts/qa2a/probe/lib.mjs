/**
 * Shared helpers for QA-4A Agent 2 probes. qa2 backend ONLY (API :56321 / DB :56322).
 *
 * Safety:
 *  - credentials come from .local/qa2-backend.env (export KEY=VALUE lines) — never from
 *    `supabase status`, never from organizer/Agent1 projects.
 *  - hard refusal unless the URL is http://127.0.0.1:56321.
 *  - organizer cruise id is only READ (docker exec ... select) to prove it is unchanged.
 *  - synthetic data only: every created player alias is prefixed `qa2a-`.
 */
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ws from 'ws'

export const QA2_URL = 'http://127.0.0.1:56321'
export const ORGANIZER_CRUISE_EXPECTED = '48fa40c6-e7cd-4f8f-8b81-e3e48d10eb13'
export const CAMPAIGN_DIR = 'docs/qa/campaign/agent-2-backend-integration'
export const EVIDENCE_DIR = join(CAMPAIGN_DIR, 'evidence')
export const DEV_DAY1 = '2099-01-03'
export const DEV_OFFSET_MIN = -240

mkdirSync(EVIDENCE_DIR, { recursive: true })

export function loadQa2Env() {
  const path = '.local/qa2-backend.env'
  if (!existsSync(path)) throw new Error(`missing ${path}`)
  const env = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '')
  }
  for (const k of ['VITE_SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'LOCAL_TEST_PASSWORD']) {
    if (!env[k]) throw new Error(`.local/qa2-backend.env missing ${k}`)
  }
  if (env.VITE_SUPABASE_URL !== QA2_URL) {
    throw new Error(`REFUSING: env URL ${env.VITE_SUPABASE_URL} is not the qa2 backend ${QA2_URL}`)
  }
  return env
}

export function createQa2Clients() {
  const env = loadQa2Env()
  const opts = { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws } }
  const svc = createClient(QA2_URL, env.SUPABASE_SERVICE_ROLE_KEY, opts)
  const anon = () => createClient(QA2_URL, env.SUPABASE_ANON_KEY, opts)
  return { env, svc, anon }
}

const QA2_DB = 'supabase_db_star-princess-qa2-backend'
const ORG_DB = 'supabase_db_star-princess-local'

/** psql against qa2 DB container only. */
export function qa2Sql(sql) {
  return execFileSync('docker', ['exec', QA2_DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', sql], {
    encoding: 'utf8',
  }).trim()
}

/** Run a SELECT against qa2 and return parsed JSON rows. */
export function qa2Json(selectSql) {
  const out = qa2Sql(`select coalesce(json_agg(t), '[]'::json) from (${selectSql}) t`)
  return JSON.parse(out)
}

/** READ-ONLY organizer cruise id probe. */
export function organizerCruiseId() {
  return execFileSync(
    'docker',
    ['exec', ORG_DB, 'psql', '-U', 'postgres', '-d', 'postgres', '-tAc', 'select id from public.cruise_config where is_active limit 1;'],
    { encoding: 'utf8' },
  ).trim()
}

export function shipLocalToUtcIso(shipDate, time, offsetMinutes = DEV_OFFSET_MIN) {
  const ship = new Date(`${shipDate}T${time}Z`)
  return new Date(ship.getTime() - offsetMinutes * 60_000).toISOString()
}
export function dayDate(day) {
  const d = new Date(`${DEV_DAY1}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + (day - 1))
  return d.toISOString().slice(0, 10)
}
export const slotUtc = (day, time) => shipLocalToUtcIso(dayDate(day), time)
export const noonDay1Utc = () => slotUtc(1, '12:00:00')

export function makeRecorder(label) {
  const results = []
  return {
    results,
    record(id, status, detail = {}) {
      const row = { id, status, ...detail, at: new Date().toISOString() }
      results.push(row)
      console.log(`[${status}] ${id}${detail.summary ? ' — ' + detail.summary : ''}`)
      return row
    },
    totals() {
      const t = { pass: 0, fail: 0, info: 0, blocked: 0 }
      for (const r of results) {
        const k = r.status.toLowerCase()
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

export function assertOrg(before) {
  const now = organizerCruiseId()
  return { before, after: now, unchanged: before === now, matches_expected: now === ORGANIZER_CRUISE_EXPECTED }
}

export async function ensureActiveClock(svc) {
  const { error } = await svc.rpc('dev_seed_cruise_clock', {
    p_day1_ship_date: DEV_DAY1,
    p_base_offset_minutes: DEV_OFFSET_MIN,
    p_label: 'development-only',
  })
  if (error) throw new Error(`dev_seed_cruise_clock: ${error.message}`)
  for (const game of ['drinkit', 'shipit']) {
    const { error: e } = await svc
      .from('game_control')
      .update({ finalized_at_utc: null, status: 'active' })
      .eq('game', game)
    if (e) throw new Error(`game_control reset: ${e.message}`)
  }
  await svc.rpc('dev_set_drinkit_paused', { p_paused: false })
  const { data: cfg } = await svc
    .from('cruise_config')
    .select('id,label,day1_ship_date,base_ship_offset_minutes,is_active')
    .eq('is_active', true)
    .single()
  const { data: ctl } = await svc.from('game_control').select('game,status,finalized_at_utc')
  return { cruise: cfg, game_control: ctl }
}

/** Active catalog already present; ensure bounty schedule + dailies exist for the (re)seeded cruise. */
export async function ensureSchedule(svc, seed = 'qa2a-int') {
  const sched = await svc.rpc('dev_generate_bounty_schedule', { p_seed: seed })
  const daily = await svc.rpc('dev_seed_daily_assignments')
  return { schedule_error: sched.error?.message ?? null, daily_error: daily.error?.message ?? null }
}

export async function exposeSlots(svc, atUtc) {
  await svc.rpc('dev_get_current_cocktail_bounty_at', { p_at_utc: atUtc })
  await svc.rpc('dev_get_current_ingredient_bounty_at', { p_at_utc: atUtc })
}

export function drinkPayload({ barKey, offeringId, mode, companions = [], key } = {}) {
  const drink = offeringId
    ? { mode: 'named_catalog', offering_id: offeringId }
    : { mode: mode ?? 'generic_beer' }
  return {
    idempotency_key: key ?? randomUUID(),
    bar_canonical_key: barKey,
    drink,
    companion_player_ids: companions,
    bar_eligible_companion_ids: [],
    selected_claims: [],
    caption: null,
    photo_storage_key: null,
  }
}

export async function submitAt(svc, playerId, payload, atUtc) {
  await exposeSlots(svc, atUtc)
  return svc.rpc('dev_submit_drink_at', { p_payload: payload, p_at_utc: atUtc, p_player_id: playerId })
}

export async function lookupOffering(svc, barKey, drinkKey) {
  const { data: bar } = await svc.from('bars').select('id').eq('canonical_key', barKey).single()
  const { data: concept } = await svc.from('drink_concepts').select('id').eq('canonical_key', drinkKey).single()
  const { data: off } = await svc
    .from('bar_offerings')
    .select('id')
    .eq('bar_id', bar.id)
    .eq('drink_concept_id', concept.id)
    .maybeSingle()
  return off ? { offering_id: off.id, bar_id: bar.id, drink_concept_id: concept.id } : null
}

export class Cohort {
  constructor(svc, prefix = 'qa2a') {
    this.svc = svc
    this.prefix = prefix
    this.playerIds = []
    this.defIds = []
    this.teamIds = []
    this.catalogTagRows = { offering: [], concept: [] }
    this.dailyIds = []
  }

  async makePlayer(label, games = ['drinkit'], teamId = null) {
    const token = randomUUID().slice(0, 8)
    const { data, error } = await this.svc
      .from('players')
      .insert({
        display_name: `QA2A ${label} ${token}`,
        login_alias: `${this.prefix}-${label}-${token}`,
        is_admin: false,
        active: true,
      })
      .select('id')
      .single()
    if (error) throw new Error(`makePlayer: ${error.message}`)
    this.playerIds.push(data.id)
    if (games.includes('shipit') && teamId) {
      await this.svc.from('team_memberships').insert({ player_id: data.id, team_id: teamId })
    } else if (games.includes('shipit')) {
      const { data: team } = await this.svc
        .from('teams')
        .insert({ name: `QA2A Team ${token}`, active: true })
        .select('id')
        .single()
      this.teamIds.push(team.id)
      await this.svc.from('team_memberships').insert({ player_id: data.id, team_id: team.id })
    }
    const { error: mErr } = await this.svc
      .from('game_memberships')
      .insert(games.map((game) => ({ player_id: data.id, game, enabled: true })))
    if (mErr) throw new Error(`makePlayer membership: ${mErr.message}`)
    return data.id
  }

  async insertDef(stableSuffix, conditionType, conditionConfig, extra = {}) {
    const { data, error } = await this.svc
      .from('achievement_definitions')
      .insert({
        stable_key: `${this.prefix}-${stableSuffix}-${randomUUID().slice(0, 8)}`,
        game: 'drinkit',
        owner_type: 'player',
        group_key: 'other',
        title: `QA2A ${stableSuffix}`,
        display_description: 'Lorem ipsum dolor sit amet.',
        secret: false,
        exclusive: false,
        enabled: true,
        test_only: true,
        condition_type: conditionType,
        condition_config: conditionConfig,
        ...extra,
      })
      .select('id')
      .single()
    if (error) throw new Error(`insertDef(${stableSuffix}): ${error.message}`)
    this.defIds.push(data.id)
    return data.id
  }

  /** Adopt leftovers from earlier qa2a runs (alias / stable_key prefix) so cleanup is idempotent. */
  async adopt() {
    const { data: ps } = await this.svc.from('players').select('id').like('login_alias', `${this.prefix}-%`)
    for (const p of ps ?? []) if (!this.playerIds.includes(p.id)) this.playerIds.push(p.id)
    const { data: ds } = await this.svc.from('achievement_definitions').select('id').like('stable_key', `${this.prefix}-%`)
    for (const d of ds ?? []) if (!this.defIds.includes(d.id)) this.defIds.push(d.id)
    const { data: ts } = await this.svc.from('teams').select('id').like('name', 'QA2A Team %')
    for (const t of ts ?? []) if (!this.teamIds.includes(t.id)) this.teamIds.push(t.id)
    return { players: this.playerIds.length, defs: this.defIds.length, teams: this.teamIds.length }
  }

  async cleanup() {
    const svc = this.svc
    const notes = {}
    const run = async (label, q) => {
      const { error } = await q
      if (error) notes[label] = error.message
    }
    const ids = this.playerIds
    if (ids.length) {
      await run('scav_completions', svc.from('scavenger_completions').delete().in('submitting_player_id', ids))
      const { data: awards } = await svc.from('achievement_awards').select('id').in('owner_player_id', ids)
      const awardIds = (awards ?? []).map((a) => a.id)
      if (awardIds.length) {
        await run('gallery_award_null', svc.from('gallery_events').update({ achievement_award_id: null }).in('achievement_award_id', awardIds))
        await run('award_gallery_null', svc.from('achievement_awards').update({ gallery_event_id: null }).in('id', awardIds))
      }
      await run('sub_gallery_null', svc.from('submissions').update({ gallery_event_id: null }).in('author_player_id', ids))
      await run('gallery_reactions', svc.from('gallery_reactions').delete().in('player_id', ids))
      await run('gallery_owner', svc.from('gallery_events').delete().in('owner_player_id', ids))
      await run('companions', svc.from('drink_log_companions').delete().in('companion_player_id', ids))
      await run('crew', svc.from('bar_bounty_crew_members').delete().in('player_id', ids))
      await run('ingredient_corrections', svc.from('ingredient_corrections').delete().in('confirmed_by_player_id', ids))
      await run('awards', svc.from('achievement_awards').delete().in('owner_player_id', ids))
      await run('claims', svc.from('bounty_claims').delete().in('player_id', ids))
      await run('photos', svc.from('photos').delete().in('owner_player_id', ids))
      await run('submissions', svc.from('submissions').delete().in('author_player_id', ids))
      await run('read_cursors', svc.from('read_cursors').delete().in('player_id', ids))
      await run('wrapped_reveals', svc.from('wrapped_reveals').delete().in('player_id', ids))
      await run('memberships', svc.from('game_memberships').delete().in('player_id', ids))
      await run('team_memberships', svc.from('team_memberships').delete().in('player_id', ids))
    }
    if (this.defIds.length) {
      await run('defs_awards', svc.from('achievement_awards').delete().in('definition_id', this.defIds))
      await run('defs', svc.from('achievement_definitions').delete().in('id', this.defIds))
    }
    if (this.dailyIds.length) await run('daily_challenges', svc.from('daily_challenges').delete().in('id', this.dailyIds))
    if (ids.length) await run('players', svc.from('players').delete().in('id', ids))
    if (this.teamIds.length) await run('teams', svc.from('teams').delete().in('id', this.teamIds))
    for (const row of this.catalogTagRows.offering) {
      await run('tag_off', svc.from('catalog_version_offering_tags').delete().match(row))
    }
    for (const row of this.catalogTagRows.concept) {
      await run('tag_concept', svc.from('catalog_version_drink_concept_tags').delete().match(row))
    }
    this.playerIds = []
    this.defIds = []
    this.teamIds = []
    this.dailyIds = []
    return notes
  }
}

export async function activeAwards(svc, definitionId, ownerId) {
  let q = svc.from('achievement_awards').select('id,owner_player_id,status,source_submission_id,gallery_event_id').eq('definition_id', definitionId)
  if (ownerId) q = q.eq('owner_player_id', ownerId)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

export async function collectionStatus(svc, definitionId, ownerId) {
  const { data, error } = await svc.rpc('achievement_collection_status', {
    p_definition_id: definitionId,
    p_owner_player: ownerId,
  })
  if (error) throw new Error(`achievement_collection_status: ${error.message}`)
  return data
}

export async function signInAdmin(anon, password) {
  const ids = JSON.parse(readFileSync('.local/test-identities.json', 'utf8'))
  if (ids.supabase_url !== QA2_URL) throw new Error('test-identities.json is not qa2')
  const row = ids.identities.find((i) => i.key === 'admin')
  const c = anon()
  const { error } = await c.auth.signInWithPassword({ email: row.login_alias, password })
  if (error) throw new Error(`admin sign-in: ${error.message}`)
  return { client: c, row }
}

/**
 * Remove achievement awards (and their gallery events) created at/after `sinceIso`,
 * including collective awards that landed on non-cohort demo players during a probe.
 */
export async function sweepAwardsSince(svc, sinceIso) {
  const { data: awards } = await svc.from('achievement_awards').select('id').gte('created_at', sinceIso)
  const ids = (awards ?? []).map((a) => a.id)
  if (!ids.length) return { removed_awards: 0 }
  await svc.from('gallery_events').update({ achievement_award_id: null }).in('achievement_award_id', ids)
  await svc.from('achievement_awards').update({ gallery_event_id: null }).in('id', ids)
  await svc.from('gallery_events').delete().eq('kind', 'achievement').is('achievement_award_id', null)
  const { error } = await svc.from('achievement_awards').delete().in('id', ids)
  return { removed_awards: ids.length, error: error?.message ?? null }
}
