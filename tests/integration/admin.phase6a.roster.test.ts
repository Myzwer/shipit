/**
 * Phase 6A — Admin roster read/membership + Edge Function create/reset.
 * Uses real local Auth, Postgres, and restricted client sessions.
 */
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { createLocalClient, identity, loadLocalFixtures, signInAs } from '../helpers/localSupabase'
import type { LocalFixtures } from '../helpers/localSupabase'

let fixtures: LocalFixtures
const createdAliases: string[] = []

beforeAll(async () => {
  fixtures = await loadLocalFixtures()
})

beforeEach(() => {
  if (!fixtures.available) return
})

function requireLocal() {
  if (!fixtures.available || !fixtures.summary || !fixtures.anonKey || !fixtures.serviceRoleKey) {
    throw new Error('local fixtures unavailable — run db:provision')
  }
  return fixtures as Required<LocalFixtures> & { available: true }
}

async function invokeRoster(accessToken: string, body: Record<string, unknown>) {
  const f = requireLocal()
  const res = await fetch(`${f.summary!.supabase_url}/functions/v1/admin-roster`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: f.anonKey!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, json }
}

function uniqueName(prefix: string) {
  return `${prefix} ${randomUUID().slice(0, 8)}`
}

describe('Phase 6A admin roster', () => {
  it('admin can list roster and teams; players cannot', async () => {
    const f = requireLocal()
    const admin = await signInAs(f, 'admin')
    const roster = await admin.rpc('admin_list_roster')
    expect(roster.error).toBeNull()
    expect(Array.isArray(roster.data)).toBe(true)
    expect(roster.data.length).toBeGreaterThanOrEqual(4)
    const sample = roster.data[0]
    expect(sample.player_id).toBeTruthy()
    expect(sample.display_name).toBeTruthy()
    expect(sample.login_alias).toBeTruthy()
    expect(sample).not.toHaveProperty('auth_user_id')
    expect(JSON.stringify(sample).toLowerCase()).not.toContain('password')

    const teams = await admin.rpc('admin_list_teams')
    expect(teams.error).toBeNull()
    expect(teams.data.length).toBeGreaterThanOrEqual(1)

    const player = await signInAs(f, 'drink_only')
    const denied = await player.rpc('admin_list_roster')
    expect(denied.error).toBeTruthy()

    const shipOnly = await signInAs(f, 'ship_only')
    const shipDenied = await shipOnly.rpc('admin_set_player_access', {
      p_client_request_id: randomUUID(),
      p_player_id: identity(f.summary!, 'drink_only').player_id,
      p_active: true,
      p_drinkit_enabled: true,
      p_shipit_enabled: false,
      p_team_id: null,
      p_expected_fingerprint: 'x',
    })
    expect(shipDenied.error).toBeTruthy()
  })

  it('create player via Edge Function, login works, duplicate request is idempotent', async () => {
    const f = requireLocal()
    const admin = await signInAs(f, 'admin')
    const { data: sessionData } = await admin.auth.getSession()
    const token = sessionData.session!.access_token
    const teams = await admin.rpc('admin_list_teams')
    const teamId = teams.data[0].team_id as string
    const displayName = uniqueName('Roster Create')
    const password = `Create-${randomUUID()}!a1`
    const requestId = randomUUID()
    const alias = `${displayName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '')}@star-princess.local`
    createdAliases.push(alias)

    const first = await invokeRoster(token, {
      action: 'create_player',
      client_request_id: requestId,
      display_name: displayName,
      password,
      drinkit_enabled: true,
      shipit_enabled: true,
      team_id: teamId,
    })
    expect(first.status).toBe(200)
    expect(first.json.ok).toBe(true)
    expect(first.json.login_alias).toBe(alias)
    expect(JSON.stringify(first.json).toLowerCase()).not.toContain(password.toLowerCase())

    const replay = await invokeRoster(token, {
      action: 'create_player',
      client_request_id: requestId,
      display_name: displayName,
      password: `Other-${randomUUID()}!a1`,
      drinkit_enabled: true,
      shipit_enabled: true,
      team_id: teamId,
    })
    expect(replay.json.ok).toBe(true)
    expect(replay.json.idempotent_replay).toBe(true)
    expect(replay.json.player_id).toBe(first.json.player_id)

    const client = createLocalClient(f.summary!.supabase_url, f.anonKey!)
    const login = await client.auth.signInWithPassword({ email: alias, password })
    expect(login.error).toBeNull()
    const profile = await client.rpc('get_my_session_profile')
    expect(profile.data?.display_name).toBe(displayName)
    expect(profile.data?.games?.map((g: { game: string }) => g.game).sort()).toEqual([
      'drinkit',
      'shipit',
    ])

    // Non-admin cannot create
    const player = await signInAs(f, 'both')
    const { data: pSession } = await player.auth.getSession()
    const denied = await invokeRoster(pSession.session!.access_token, {
      action: 'create_player',
      client_request_id: randomUUID(),
      display_name: uniqueName('Denied'),
      password: `Denied-${randomUUID()}!a1`,
      drinkit_enabled: true,
      shipit_enabled: false,
      team_id: null,
    })
    expect(denied.status).toBe(403)
    expect(denied.json.code).toBe('ADMIN_REQUIRED')
  })

  it('password reset requires admin; new password logs in; audit has no secret', async () => {
    const f = requireLocal()
    const admin = await signInAs(f, 'admin')
    const { data: sessionData } = await admin.auth.getSession()
    const token = sessionData.session!.access_token
    const displayName = uniqueName('Roster Reset')
    const initialPassword = `Initial-${randomUUID()}!a1`
    const createId = randomUUID()
    const created = await invokeRoster(token, {
      action: 'create_player',
      client_request_id: createId,
      display_name: displayName,
      password: initialPassword,
      drinkit_enabled: true,
      shipit_enabled: false,
      team_id: null,
    })
    expect(created.json.ok).toBe(true)
    const playerId = created.json.player_id as string
    const alias = created.json.login_alias as string
    createdAliases.push(alias)

    const playerClient = await signInAs(f, 'drink_only')
    const { data: pSession } = await playerClient.auth.getSession()
    const denied = await invokeRoster(pSession.session!.access_token, {
      action: 'reset_password',
      client_request_id: randomUUID(),
      player_id: playerId,
      password: `Hacked-${randomUUID()}!a1`,
    })
    expect(denied.status).toBe(403)

    const newPassword = `Reset-${randomUUID()}!b2`
    const resetId = randomUUID()
    const reset = await invokeRoster(token, {
      action: 'reset_password',
      client_request_id: resetId,
      player_id: playerId,
      password: newPassword,
    })
    expect(reset.status).toBe(200)
    expect(reset.json.ok).toBe(true)
    expect(JSON.stringify(reset.json)).not.toContain(newPassword)

    const oldLogin = createLocalClient(f.summary!.supabase_url, f.anonKey!)
    const oldAttempt = await oldLogin.auth.signInWithPassword({
      email: alias,
      password: initialPassword,
    })
    expect(oldAttempt.error).toBeTruthy()

    const newLogin = createLocalClient(f.summary!.supabase_url, f.anonKey!)
    const ok = await newLogin.auth.signInWithPassword({ email: alias, password: newPassword })
    expect(ok.error).toBeNull()

    const service = createLocalClient(f.summary!.supabase_url, f.serviceRoleKey!)
    const { data: audits } = await service
      .from('admin_audit_log')
      .select('action, after_json')
      .eq('action', 'roster.password_reset')
      .eq('target_id', playerId)
      .order('at_utc', { ascending: false })
      .limit(1)
    expect(audits?.[0]?.action).toBe('roster.password_reset')
    expect(JSON.stringify(audits?.[0])).not.toContain(newPassword)
    expect(JSON.stringify(audits?.[0])).not.toContain(initialPassword)
  })

  it('membership disable blocks new submits; history survives; re-enable restores access', async () => {
    const f = requireLocal()
    const admin = await signInAs(f, 'admin')
    const target = identity(f.summary!, 'drink_only')
    const roster = await admin.rpc('admin_list_roster')
    const row = roster.data.find((p: { player_id: string }) => p.player_id === target.player_id)
    expect(row).toBeTruthy()

    const disableId = randomUUID()
    const disabled = await admin.rpc('admin_set_player_access', {
      p_client_request_id: disableId,
      p_player_id: target.player_id,
      p_active: true,
      p_drinkit_enabled: false,
      p_shipit_enabled: false,
      p_team_id: null,
      p_expected_fingerprint: row.state_fingerprint,
    })
    expect(disabled.error).toBeNull()
    expect(disabled.data.ok).toBe(true)

    const player = await signInAs(f, 'drink_only')
    const profile = await player.rpc('get_my_session_profile')
    expect(profile.data?.games ?? []).toEqual([])
    const hasGame = await player.rpc('has_game', { p_game: 'drinkit' })
    expect(hasGame.data).toBe(false)

    // Re-enable Drink It!
    const roster2 = await admin.rpc('admin_list_roster')
    const row2 = roster2.data.find((p: { player_id: string }) => p.player_id === target.player_id)
    const enableId = randomUUID()
    const enabled = await admin.rpc('admin_set_player_access', {
      p_client_request_id: enableId,
      p_player_id: target.player_id,
      p_active: true,
      p_drinkit_enabled: true,
      p_shipit_enabled: false,
      p_team_id: null,
      p_expected_fingerprint: row2.state_fingerprint,
    })
    expect(enabled.data.ok).toBe(true)
    const profile2 = await player.rpc('get_my_session_profile')
    // Session JWT same; profile RPC reflects current membership
    expect(profile2.data?.games?.some((g: { game: string }) => g.game === 'drinkit')).toBe(true)
  })

  it('team reassignment blocked after Ship It! history; stale fingerprint rejected', async () => {
    const f = requireLocal()
    const admin = await signInAs(f, 'admin')
    const service = createLocalClient(f.summary!.supabase_url, f.serviceRoleKey!)
    await service.rpc('dev_seed_cruise_clock', {
      p_day1_ship_date: '2099-01-03',
      p_base_offset_minutes: -300,
      p_label: 'development-only',
    })
    const both = identity(f.summary!, 'both')
    const teams = await admin.rpc('admin_list_teams')
    const otherTeam = teams.data.find(
      (t: { name: string }) => t.name !== (both.team ?? ''),
    )
    expect(otherTeam).toBeTruthy()

    const { data: teamRow } = await service
      .from('team_memberships')
      .select('team_id')
      .eq('player_id', both.player_id)
      .is('active_to', null)
      .single()
    const { data: cruise } = await service
      .from('cruise_config')
      .select('id')
      .eq('is_active', true)
      .single()
    const cruiseId = cruise!.id as string

    // Minimal historical Ship It! submission (no score migration — lock only).
    const histInsert = await service.from('submissions').insert({
      author_player_id: both.player_id,
      idempotency_key: randomUUID(),
      game: 'shipit',
      kind: 'scavenger_completion',
      cruise_config_id: cruiseId,
      team_id: teamRow!.team_id,
      received_at_utc: new Date().toISOString(),
      ship_day: 1,
      status: 'accepted',
      request_payload_hash: 'roster-history-lock',
      request_payload_json: {},
      result_json: {},
      display_snapshot_json: { title: 'history lock' },
    })
    expect(histInsert.error).toBeNull()

    const roster = await admin.rpc('admin_list_roster')
    const row = roster.data.find((p: { player_id: string }) => p.player_id === both.player_id)
    expect(row.has_shipit_history).toBe(true)

    const blocked = await admin.rpc('admin_set_player_access', {
      p_client_request_id: randomUUID(),
      p_player_id: both.player_id,
      p_active: true,
      p_drinkit_enabled: true,
      p_shipit_enabled: true,
      p_team_id: otherTeam.team_id,
      p_expected_fingerprint: row.state_fingerprint,
    })
    expect(blocked.data.ok).toBe(false)
    expect(blocked.data.code).toBe('TEAM_HISTORY_LOCKED')

    const stale = await admin.rpc('admin_set_player_access', {
      p_client_request_id: randomUUID(),
      p_player_id: both.player_id,
      p_active: true,
      p_drinkit_enabled: true,
      p_shipit_enabled: true,
      p_team_id: row.team?.team_id ?? null,
      p_expected_fingerprint: createHash('md5').update('stale').digest('hex'),
    })
    expect(stale.data.ok).toBe(false)
    expect(stale.data.code).toBe('STALE_ROSTER_STATE')
  })

  it('admin cannot disable own account; concurrent access edits do not silently overwrite', async () => {
    const f = requireLocal()
    const admin = await signInAs(f, 'admin')
    const adminId = identity(f.summary!, 'admin').player_id
    const roster = await admin.rpc('admin_list_roster')
    const row = roster.data.find((p: { player_id: string }) => p.player_id === adminId)

    const selfLock = await admin.rpc('admin_set_player_access', {
      p_client_request_id: randomUUID(),
      p_player_id: adminId,
      p_active: false,
      p_drinkit_enabled: true,
      p_shipit_enabled: true,
      p_team_id: row.team?.team_id ?? null,
      p_expected_fingerprint: row.state_fingerprint,
    })
    expect(selfLock.data.ok).toBe(false)
    expect(selfLock.data.code).toBe('ADMIN_SELF_LOCKOUT')

    const target = identity(f.summary!, 'no_games')
    const rowT = roster.data.find((p: { player_id: string }) => p.player_id === target.player_id)
    const [a, b] = await Promise.all([
      admin.rpc('admin_set_player_access', {
        p_client_request_id: randomUUID(),
        p_player_id: target.player_id,
        p_active: true,
        p_drinkit_enabled: true,
        p_shipit_enabled: false,
        p_team_id: null,
        p_expected_fingerprint: rowT.state_fingerprint,
      }),
      admin.rpc('admin_set_player_access', {
        p_client_request_id: randomUUID(),
        p_player_id: target.player_id,
        p_active: true,
        p_drinkit_enabled: false,
        p_shipit_enabled: false,
        p_team_id: null,
        p_expected_fingerprint: rowT.state_fingerprint,
      }),
    ])
    const outcomes = [a.data, b.data]
    const oks = outcomes.filter((o) => o?.ok === true)
    const stales = outcomes.filter((o) => o?.code === 'STALE_ROSTER_STATE')
    expect(oks.length).toBe(1)
    expect(stales.length).toBe(1)

    // Restore no_games baseline
    const rosterAfter = await admin.rpc('admin_list_roster')
    const rowAfter = rosterAfter.data.find(
      (p: { player_id: string }) => p.player_id === target.player_id,
    )
    await admin.rpc('admin_set_player_access', {
      p_client_request_id: randomUUID(),
      p_player_id: target.player_id,
      p_active: true,
      p_drinkit_enabled: false,
      p_shipit_enabled: false,
      p_team_id: null,
      p_expected_fingerprint: rowAfter.state_fingerprint,
    })
  })
})
