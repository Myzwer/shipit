/**
 * QA-4A diagnostic probes for roster RPCs + Mobile Order submit against :56321 only.
 * Synthetic data; does not touch organizer/Agent1.
 */
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import ws from 'ws'

function readStatus() {
  const raw = execSync('npx supabase status -o env', { encoding: 'utf8' })
  const env = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '')
  }
  return env
}

const sb = readStatus()
if (!sb.API_URL?.includes(':56321')) {
  console.error('REFUSING: expected API on :56321, got', sb.API_URL)
  process.exit(2)
}

const pw = process.env.LOCAL_TEST_PASSWORD
if (!pw) {
  console.error('LOCAL_TEST_PASSWORD required')
  process.exit(1)
}

const summary = JSON.parse(readFileSync('.local/test-identities.json', 'utf8'))
const adminRow = summary.identities.find((i) => i.key === 'admin')
const drinkRow = summary.identities.find((i) => i.key === 'drink_only')

const svc = createClient(sb.API_URL, sb.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
})
const admin = createClient(sb.API_URL, sb.ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
})

const { error: se } = await admin.auth.signInWithPassword({
  email: adminRow.login_alias,
  password: pw,
})
console.log(JSON.stringify({ step: 'admin_signin', error: se?.message ?? null }, null, 2))

const me = await admin.rpc('get_my_player')
console.log(JSON.stringify({ step: 'get_my_player', data: me.data, error: me.error?.message }, null, 2))

const roster = await admin.rpc('admin_list_roster')
console.log(
  JSON.stringify(
    {
      step: 'admin_list_roster',
      error: roster.error?.message ?? null,
      len: Array.isArray(roster.data) ? roster.data.length : null,
      sample: Array.isArray(roster.data) ? roster.data[0] ?? null : roster.data,
    },
    null,
    2,
  ),
)

const teams = await admin.rpc('admin_list_teams')
console.log(
  JSON.stringify(
    {
      step: 'admin_list_teams',
      error: teams.error?.message ?? null,
      len: Array.isArray(teams.data) ? teams.data.length : null,
      data: teams.data,
    },
    null,
    2,
  ),
)

const { count: playerCount } = await svc.from('players').select('*', { count: 'exact', head: true })
const { data: players } = await svc.from('players').select('id, login_alias, is_admin, active')
const { data: memberships } = await svc.from('game_memberships').select('player_id, game, active')
const { data: teamRows } = await svc.from('teams').select('id, name')
console.log(
  JSON.stringify(
    { step: 'db_snapshot', playerCount, players, memberships, teams: teamRows },
    null,
    2,
  ),
)

// Mobile Order probe
const { data: moDrinks, error: moErr } = await svc.rpc('list_drinkit_mobile_order_drinks')
console.log(
  JSON.stringify(
    {
      step: 'list_mobile_order_drinks',
      error: moErr?.message ?? null,
      count: Array.isArray(moDrinks) ? moDrinks.length : null,
      sample: Array.isArray(moDrinks) ? moDrinks.slice(0, 2) : moDrinks,
    },
    null,
    2,
  ),
)

const offeringId = Array.isArray(moDrinks) && moDrinks[0]?.offering_id
if (offeringId) {
  const at = '2099-01-03T16:00:00.000Z' // noon day1 with -240 offset
  const { data: submit, error: subErr } = await svc.rpc('dev_submit_drink_log_at', {
    p_author_player_id: drinkRow.player_id,
    p_at_utc: at,
    p_payload: {
      bar_key: 'mobile-order',
      offering_id: offeringId,
      companions: [],
      client_request_id: crypto.randomUUID(),
    },
  })
  console.log(
    JSON.stringify({ step: 'mo_submit', error: subErr?.message ?? null, data: submit }, null, 2),
  )
}
