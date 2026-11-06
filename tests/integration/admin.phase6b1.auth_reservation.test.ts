/**
 * Phase 6B1 Gate — durable Auth request reservation concurrency.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createLocalClient, identity, loadLocalFixtures, signInAs } from '../helpers/localSupabase'
import type { LocalFixtures } from '../helpers/localSupabase'

let fixtures: LocalFixtures

beforeAll(async () => {
  fixtures = await loadLocalFixtures()
})

function requireLocal() {
  if (!fixtures.available || !fixtures.summary || !fixtures.anonKey || !fixtures.serviceRoleKey) {
    throw new Error('local fixtures unavailable')
  }
  return fixtures
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

describe('Phase 6B1 Auth request reservation', () => {
  it('begin inserts durable in_progress; second identical begin is not reserved', async () => {
    const f = requireLocal()
    const service = createLocalClient(f.summary!.supabase_url, f.serviceRoleKey!)
    const actor = identity(f.summary!, 'admin').player_id
    const requestId = randomUUID()
    const fp = `create_player|gate.a|gate.a@star-princess.local|true|false|`

    const first = await service.rpc('admin_roster_auth_begin', {
      p_client_request_id: requestId,
      p_action: 'create_player',
      p_fingerprint: fp,
      p_actor_id: actor,
      p_player_id: null,
      p_login_alias: 'gate.a@star-princess.local',
    })
    expect(first.error).toBeNull()
    expect(first.data.ok).toBe(true)
    expect(first.data.reserved).toBe(true)

    const { data: row } = await service
      .from('admin_roster_auth_requests')
      .select('status, fingerprint, result_json')
      .eq('client_request_id', requestId)
      .single()
    expect(row!.status).toBe('in_progress')
    expect(JSON.stringify(row)).not.toMatch(/password=/i)

    const second = await service.rpc('admin_roster_auth_begin', {
      p_client_request_id: requestId,
      p_action: 'create_player',
      p_fingerprint: fp,
      p_actor_id: actor,
      p_player_id: null,
      p_login_alias: 'gate.a@star-princess.local',
    })
    expect(second.data.ok).toBe(true)
    expect(second.data.reserved).toBe(false)
    expect(second.data.in_progress).toBe(true)

    const mismatch = await service.rpc('admin_roster_auth_begin', {
      p_client_request_id: requestId,
      p_action: 'create_player',
      p_fingerprint: fp + '|other',
      p_actor_id: actor,
      p_player_id: null,
      p_login_alias: 'gate.a@star-princess.local',
    })
    expect(mismatch.data.ok).toBe(false)
    expect(mismatch.data.code).toBe('REQUEST_ID_OPERATION_MISMATCH')

    const done = await service.rpc('admin_roster_auth_complete', {
      p_client_request_id: requestId,
      p_action: 'create_player',
      p_fingerprint: fp,
      p_actor_id: actor,
      p_player_id: null,
      p_login_alias: 'gate.a@star-princess.local',
      p_result: { ok: true, code: 'TEST_COMPLETE' },
      p_orphan_auth_user_id: null,
    })
    expect(done.data.ok).toBe(true)

    const overwrite = await service.rpc('admin_roster_auth_complete', {
      p_client_request_id: requestId,
      p_action: 'create_player',
      p_fingerprint: fp + '|evil',
      p_actor_id: actor,
      p_player_id: null,
      p_login_alias: 'gate.a@star-princess.local',
      p_result: { ok: true, code: 'SHOULD_NOT_WIN' },
      p_orphan_auth_user_id: null,
    })
    expect(overwrite.data.ok).toBe(false)
    expect(overwrite.data.code).toBe('REQUEST_ID_OPERATION_MISMATCH')

    const { data: finalRow } = await service
      .from('admin_roster_auth_requests')
      .select('status, result_json')
      .eq('client_request_id', requestId)
      .single()
    expect(finalRow!.status).toBe('completed')
    expect(finalRow!.result_json.code).toBe('TEST_COMPLETE')
  })

  it('concurrent identical create Edge calls create one Auth identity', async () => {
    const f = requireLocal()
    const admin = await signInAs(f, 'admin')
    const token = (await admin.auth.getSession()).data.session!.access_token
    const requestId = randomUUID()
    const displayName = `Gate Conc ${randomUUID().slice(0, 6)}`
    const password = `GateConc-${randomUUID()}!a1`
    const body = {
      action: 'create_player',
      client_request_id: requestId,
      display_name: displayName,
      password,
      drinkit_enabled: true,
      shipit_enabled: false,
      team_id: null,
    }

    const [a, b] = await Promise.all([invokeRoster(token, body), invokeRoster(token, body)])
    const oks = [a, b].filter((r) => r.json.ok === true)
    expect(oks.length).toBeGreaterThanOrEqual(1)
    // At least one success; losers may be in_progress then replay, or idempotent replay
    const playerIds = new Set(
      [a, b].map((r) => r.json.player_id).filter((id) => typeof id === 'string'),
    )
    expect(playerIds.size).toBeLessThanOrEqual(1)

    const service = createLocalClient(f.summary!.supabase_url, f.serviceRoleKey!)
    const alias = `${displayName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '.')
      .replace(/^\.+|\.+$/g, '')}@star-princess.local`
    const listed = await service.auth.admin.listUsers({ perPage: 1000 })
    const matches = listed.data.users.filter((u) => u.email?.toLowerCase() === alias)
    expect(matches.length).toBe(1)

    const client = createLocalClient(f.summary!.supabase_url, f.anonKey!)
    const login = await client.auth.signInWithPassword({ email: alias, password })
    expect(login.error).toBeNull()
  })

  it('concurrent mismatched fingerprints reject; password reset unknown stays explicit', async () => {
    const f = requireLocal()
    const admin = await signInAs(f, 'admin')
    const token = (await admin.auth.getSession()).data.session!.access_token
    const requestId = randomUUID()
    const nameA = `Gate Mis A ${randomUUID().slice(0, 5)}`
    const nameB = `Gate Mis B ${randomUUID().slice(0, 5)}`

    const [a, b] = await Promise.all([
      invokeRoster(token, {
        action: 'create_player',
        client_request_id: requestId,
        display_name: nameA,
        password: `GateMisA-${randomUUID()}!a1`,
        drinkit_enabled: false,
        shipit_enabled: false,
        team_id: null,
      }),
      invokeRoster(token, {
        action: 'create_player',
        client_request_id: requestId,
        display_name: nameB,
        password: `GateMisB-${randomUUID()}!a1`,
        drinkit_enabled: true,
        shipit_enabled: false,
        team_id: null,
      }),
    ])
    const codes = [a.json.code, b.json.code]
    expect(codes.includes('REQUEST_ID_OPERATION_MISMATCH') || a.json.ok !== b.json.ok).toBe(true)

    // Reset: force in_progress then second call must not claim success
    const service = createLocalClient(f.summary!.supabase_url, f.serviceRoleKey!)
    const target = identity(f.summary!, 'no_games')
    const resetId = randomUUID()
    const fp = `credential_reset|${target.player_id}`
    const begin = await service.rpc('admin_roster_auth_begin', {
      p_client_request_id: resetId,
      p_action: 'reset_password',
      p_fingerprint: fp,
      p_actor_id: identity(f.summary!, 'admin').player_id,
      p_player_id: target.player_id,
      p_login_alias: null,
    })
    expect(begin.data.reserved).toBe(true)

    const racing = await invokeRoster(token, {
      action: 'reset_password',
      client_request_id: resetId,
      player_id: target.player_id,
      password: `ShouldNotApply-${randomUUID()}!z9`,
    })
    expect(racing.json.ok).toBe(false)
    expect(['OPERATION_IN_PROGRESS', 'REQUEST_ID_OPERATION_MISMATCH']).toContain(racing.json.code)

    // Cleanup reservation as failed so later tests are clean
    await service.rpc('admin_roster_auth_complete', {
      p_client_request_id: resetId,
      p_action: 'reset_password',
      p_fingerprint: fp,
      p_actor_id: identity(f.summary!, 'admin').player_id,
      p_player_id: target.player_id,
      p_login_alias: null,
      p_result: { ok: false, code: 'TEST_ABORT' },
      p_orphan_auth_user_id: null,
    })
  })

  it('complete rejects missing reservation; completed v1 replay still works', async () => {
    const f = requireLocal()
    const service = createLocalClient(f.summary!.supabase_url, f.serviceRoleKey!)
    const actor = identity(f.summary!, 'admin').player_id
    const missing = await service.rpc('admin_roster_auth_complete', {
      p_client_request_id: randomUUID(),
      p_action: 'create_player',
      p_fingerprint: 'x',
      p_actor_id: actor,
      p_player_id: null,
      p_login_alias: null,
      p_result: { ok: true },
      p_orphan_auth_user_id: null,
    })
    expect(missing.data.ok).toBe(false)
    expect(missing.data.code).toBe('RESERVATION_MISSING')

    const requestId = randomUUID()
    const fp = `create_player|replay.v1|replay.v1@star-princess.local|false|false|`
    await service.rpc('admin_roster_auth_begin', {
      p_client_request_id: requestId,
      p_action: 'create_player',
      p_fingerprint: fp,
      p_actor_id: actor,
      p_player_id: null,
      p_login_alias: 'replay.v1@star-princess.local',
    })
    await service.rpc('admin_roster_auth_complete', {
      p_client_request_id: requestId,
      p_action: 'create_player',
      p_fingerprint: fp,
      p_actor_id: actor,
      p_player_id: null,
      p_login_alias: 'replay.v1@star-princess.local',
      p_result: { ok: true, code: 'V1_DONE' },
      p_orphan_auth_user_id: null,
    })
    const replay = await service.rpc('admin_roster_auth_begin', {
      p_client_request_id: requestId,
      p_action: 'create_player',
      p_fingerprint: fp,
      p_actor_id: actor,
      p_player_id: null,
      p_login_alias: 'replay.v1@star-princess.local',
    })
    expect(replay.data.replay).toBe(true)
    expect(replay.data.result.code).toBe('V1_DONE')
  })
})
