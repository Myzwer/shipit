/**
 * Phase 6A — privileged Admin roster Auth operations.
 * Actions: create_player | reset_password
 *
 * Service-role key stays in Edge Function secrets. Passwords are never logged,
 * never written to audit/result JSON, and never returned.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type CreateBody = {
  action: 'create_player'
  client_request_id: string
  display_name: string
  password: string
  drinkit_enabled?: boolean
  shipit_enabled?: boolean
  team_id?: string | null
}

type ResetBody = {
  action: 'reset_password'
  client_request_id: string
  player_id: string
  password: string
}

type Body = CreateBody | ResetBody

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizeAlias(displayName: string): string | null {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
  if (!slug) return null
  return `${slug}@star-princess.local`
}

function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string') return 'PASSWORD_REQUIRED'
  if (password.length < 12) return 'PASSWORD_TOO_SHORT'
  if (password.length > 128) return 'PASSWORD_TOO_LONG'
  return null
}

function fingerprintCreate(input: {
  display_name: string
  login_alias: string
  drinkit_enabled: boolean
  shipit_enabled: boolean
  team_id: string | null
}) {
  // Intentionally excludes password — retries with same request id replay the
  // prior Auth/DB outcome; a new password requires a new client_request_id.
  return [
    'create_player',
    input.display_name.trim().toLowerCase(),
    input.login_alias.trim().toLowerCase(),
    String(input.drinkit_enabled),
    String(input.shipit_enabled),
    input.team_id ?? '',
  ].join('|')
}

function fingerprintReset(playerId: string) {
  // Avoid the substring "password" — DB ledger rejects fingerprints that look
  // like they embed credential material.
  return ['credential_reset', playerId].join('|')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json(405, { ok: false, code: 'METHOD_NOT_ALLOWED' })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json(500, { ok: false, code: 'SERVER_MISCONFIGURED' })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return json(401, { ok: false, code: 'NOT_AUTHENTICATED' })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return json(400, { ok: false, code: 'INVALID_JSON' })
  }

  // User-scoped client: verifies JWT + Admin via RPC (never trust client claims).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const actorRes = await userClient.rpc('admin_roster_resolve_actor')
  if (actorRes.error || !actorRes.data?.ok) {
    return json(403, { ok: false, code: 'ADMIN_REQUIRED' })
  }
  const actorId = actorRes.data.actor_id as string

  if (!body?.action || !body.client_request_id) {
    return json(400, { ok: false, code: 'INVALID_ARGUMENT' })
  }

  if (body.action === 'create_player') {
    return await handleCreate(service, actorId, body)
  }
  if (body.action === 'reset_password') {
    return await handleReset(service, actorId, body)
  }
  return json(400, { ok: false, code: 'UNKNOWN_ACTION' })
})

async function handleCreate(
  service: ReturnType<typeof createClient>,
  actorId: string,
  body: CreateBody,
) {
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : ''
  if (displayName.length < 2 || displayName.length > 80) {
    return json(400, { ok: false, code: 'INVALID_DISPLAY_NAME' })
  }
  const pwErr = validatePassword(body.password)
  if (pwErr) return json(400, { ok: false, code: pwErr })

  const loginAlias = normalizeAlias(displayName)
  if (!loginAlias) return json(400, { ok: false, code: 'INVALID_DISPLAY_NAME' })

  const drinkit = Boolean(body.drinkit_enabled)
  const shipit = Boolean(body.shipit_enabled)
  const teamId = body.team_id ?? null
  if (shipit && !teamId) {
    return json(400, { ok: false, code: 'TEAM_REQUIRED' })
  }

  const fp = fingerprintCreate({
    display_name: displayName,
    login_alias: loginAlias,
    drinkit_enabled: drinkit,
    shipit_enabled: shipit,
    team_id: teamId,
  })

  const begin = await service.rpc('admin_roster_auth_begin', {
    p_client_request_id: body.client_request_id,
    p_action: 'create_player',
    p_fingerprint: fp,
    p_actor_id: actorId,
    p_player_id: null,
    p_login_alias: loginAlias,
  })
  if (begin.error) {
    return json(500, { ok: false, code: 'LEDGER_ERROR' })
  }
  if (begin.data?.ok === false) {
    return json(409, begin.data as Record<string, unknown>)
  }
  if (begin.data?.replay) {
    const prior = (begin.data.result ?? {}) as Record<string, unknown>
    return json(prior.ok === false ? 400 : 200, {
      ...prior,
      idempotent_replay: true,
      client_request_id: body.client_request_id,
    })
  }

  // Reconcile orphan Auth user with same alias from a prior partial failure.
  // Never overwrite credentials for an alias that already has a linked player.
  const listed = await service.auth.admin.listUsers({ perPage: 1000 })
  if (listed.error) {
    return json(500, { ok: false, code: 'AUTH_LIST_FAILED' })
  }
  const existingAuth = listed.data.users.find(
    (u) => u.email?.toLowerCase() === loginAlias.toLowerCase(),
  )

  let authUserId: string
  let reusedOrphanAuth = false
  if (existingAuth) {
    const linked = await service
      .from('players')
      .select('id')
      .eq('auth_user_id', existingAuth.id)
      .maybeSingle()
    if (linked.data?.id) {
      const fail = {
        ok: false,
        code: 'LOGIN_ALIAS_TAKEN',
        player_id: linked.data.id,
        client_request_id: body.client_request_id,
      }
      await service.rpc('admin_roster_auth_complete', {
        p_client_request_id: body.client_request_id,
        p_action: 'create_player',
        p_fingerprint: fp,
        p_actor_id: actorId,
        p_player_id: linked.data.id,
        p_login_alias: loginAlias,
        p_result: fail,
        p_orphan_auth_user_id: null,
      })
      return json(409, fail)
    }
    authUserId = existingAuth.id
    reusedOrphanAuth = true
    const { error: pwUpdateError } = await service.auth.admin.updateUserById(authUserId, {
      password: body.password,
      email_confirm: true,
      ban_duration: 'none',
    })
    if (pwUpdateError) {
      return json(500, { ok: false, code: 'AUTH_UPDATE_FAILED' })
    }
  } else {
    const created = await service.auth.admin.createUser({
      email: loginAlias,
      password: body.password,
      email_confirm: true,
    })
    if (created.error || !created.data.user) {
      const msg = created.error?.message ?? ''
      if (/already/i.test(msg)) {
        return json(409, { ok: false, code: 'LOGIN_ALIAS_TAKEN' })
      }
      return json(500, { ok: false, code: 'AUTH_CREATE_FAILED' })
    }
    authUserId = created.data.user.id
  }

  const provisioned = await service.rpc('admin_provision_player_record', {
    p_client_request_id: body.client_request_id,
    p_actor_id: actorId,
    p_auth_user_id: authUserId,
    p_display_name: displayName,
    p_login_alias: loginAlias,
    p_drinkit_enabled: drinkit,
    p_shipit_enabled: shipit,
    p_team_id: teamId,
  })

  if (provisioned.error || provisioned.data?.ok === false) {
    // Best-effort cleanup when we created a brand-new Auth user this request.
    let orphan: string | null = authUserId
    if (!reusedOrphanAuth) {
      const del = await service.auth.admin.deleteUser(authUserId)
      if (!del.error) orphan = null
    }
    const fail = {
      ok: false,
      code: (provisioned.data?.code as string) || 'PROVISION_FAILED',
      message: provisioned.error?.message,
      client_request_id: body.client_request_id,
      partial_auth_orphan: Boolean(orphan),
    }
    await service.rpc('admin_roster_auth_complete', {
      p_client_request_id: body.client_request_id,
      p_action: 'create_player',
      p_fingerprint: fp,
      p_actor_id: actorId,
      p_player_id: null,
      p_login_alias: loginAlias,
      p_result: fail,
      p_orphan_auth_user_id: orphan,
    })
    return json(409, fail)
  }

  const result = {
    ok: true,
    action: 'create_player',
    player_id: provisioned.data.player_id,
    display_name: provisioned.data.display_name,
    login_alias: provisioned.data.login_alias,
    drinkit_enabled: drinkit,
    shipit_enabled: shipit,
    team_id: teamId,
    client_request_id: body.client_request_id,
    reconciled: Boolean(provisioned.data.reconciled),
  }
  await service.rpc('admin_roster_auth_complete', {
    p_client_request_id: body.client_request_id,
    p_action: 'create_player',
    p_fingerprint: fp,
    p_actor_id: actorId,
    p_player_id: provisioned.data.player_id,
    p_login_alias: loginAlias,
    p_result: result,
    p_orphan_auth_user_id: null,
  })
  return json(200, result)
}

async function handleReset(
  service: ReturnType<typeof createClient>,
  actorId: string,
  body: ResetBody,
) {
  if (!body.player_id) {
    return json(400, { ok: false, code: 'PLAYER_REQUIRED' })
  }
  const pwErr = validatePassword(body.password)
  if (pwErr) return json(400, { ok: false, code: pwErr })

  const fp = fingerprintReset(body.player_id)
  const begin = await service.rpc('admin_roster_auth_begin', {
    p_client_request_id: body.client_request_id,
    p_action: 'reset_password',
    p_fingerprint: fp,
    p_actor_id: actorId,
    p_player_id: body.player_id,
    p_login_alias: null,
  })
  if (begin.error) {
    return json(500, { ok: false, code: 'LEDGER_ERROR' })
  }
  if (begin.data?.ok === false) {
    return json(409, begin.data as Record<string, unknown>)
  }
  if (begin.data?.replay) {
    const prior = (begin.data.result ?? {}) as Record<string, unknown>
    // Password is never stored — replay only confirms the prior attempt completed.
    // A new password always requires a new client_request_id.
    return json(prior.ok === false ? 400 : 200, {
      ...prior,
      idempotent_replay: true,
      client_request_id: body.client_request_id,
      password_replay_note:
        'Prior reset intent already completed. Submit a new request id to set a different password.',
    })
  }

  const player = await service.rpc('admin_roster_get_player_auth', {
    p_player_id: body.player_id,
  })
  if (player.error || !player.data?.ok) {
    const fail = {
      ok: false,
      code: (player.data?.code as string) || 'PLAYER_NOT_FOUND',
      client_request_id: body.client_request_id,
    }
    await service.rpc('admin_roster_auth_complete', {
      p_client_request_id: body.client_request_id,
      p_action: 'reset_password',
      p_fingerprint: fp,
      p_actor_id: actorId,
      p_player_id: body.player_id,
      p_login_alias: null,
      p_result: fail,
      p_orphan_auth_user_id: null,
    })
    return json(404, fail)
  }

  const authUserId = player.data.auth_user_id as string | null
  if (!authUserId) {
    const fail = {
      ok: false,
      code: 'AUTH_USER_MISSING',
      message: 'Player has no linked Auth identity.',
      client_request_id: body.client_request_id,
    }
    await service.rpc('admin_roster_auth_complete', {
      p_client_request_id: body.client_request_id,
      p_action: 'reset_password',
      p_fingerprint: fp,
      p_actor_id: actorId,
      p_player_id: body.player_id,
      p_login_alias: player.data.login_alias,
      p_result: fail,
      p_orphan_auth_user_id: null,
    })
    return json(409, fail)
  }

  const updated = await service.auth.admin.updateUserById(authUserId, {
    password: body.password,
  })
  if (updated.error) {
    // Do not mark success. Leave ledger incomplete so reconcile can retry same id
    // only if begin didn't complete — here we complete as failed.
    const fail = {
      ok: false,
      code: 'AUTH_UPDATE_FAILED',
      client_request_id: body.client_request_id,
    }
    await service.rpc('admin_roster_auth_complete', {
      p_client_request_id: body.client_request_id,
      p_action: 'reset_password',
      p_fingerprint: fp,
      p_actor_id: actorId,
      p_player_id: body.player_id,
      p_login_alias: player.data.login_alias,
      p_result: fail,
      p_orphan_auth_user_id: null,
    })
    return json(500, fail)
  }

  await service.rpc('admin_roster_audit_password_reset', {
    p_actor_id: actorId,
    p_player_id: body.player_id,
  })

  const result = {
    ok: true,
    action: 'reset_password',
    player_id: body.player_id,
    display_name: player.data.display_name,
    client_request_id: body.client_request_id,
  }
  await service.rpc('admin_roster_auth_complete', {
    p_client_request_id: body.client_request_id,
    p_action: 'reset_password',
    p_fingerprint: fp,
    p_actor_id: actorId,
    p_player_id: body.player_id,
    p_login_alias: player.data.login_alias,
    p_result: result,
    p_orphan_auth_user_id: null,
  })
  return json(200, result)
}
