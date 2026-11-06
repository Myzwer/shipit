/**
 * Phase 6A — Admin roster client helpers.
 * Access edits go through RPCs; create/reset go through the `admin-roster` Edge Function.
 * Passwords are only ever sent in the Edge Function request body. They are never
 * logged, persisted, or included in error messages.
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { copy } from '@/ui/copy'

export type AdminRosterErrorCode =
  | 'unavailable'
  | 'error'
  | 'forbidden'
  | 'stale'
  | 'mismatch'
  | 'not_found'
  | 'team_required'
  | 'team_locked'
  | 'self_lockout'
  | 'name_taken'
  | 'invalid_password'
  | 'invalid_name'

export class AdminRosterError extends Error {
  code: AdminRosterErrorCode

  constructor(message: string, code: AdminRosterErrorCode = 'error') {
    super(message)
    this.name = 'AdminRosterError'
    this.code = code
  }
}

export interface RosterTeamRef {
  team_id: string
  name: string
  color?: string | null
}

export interface RosterPlayer {
  player_id: string
  display_name: string
  login_alias: string | null
  active: boolean
  is_admin: boolean
  updated_at: string | null
  state_fingerprint: string
  drinkit_enabled: boolean
  shipit_enabled: boolean
  team: RosterTeamRef | null
  has_shipit_history: boolean
}

export interface RosterTeam {
  team_id: string
  name: string
  color?: string | null
  active?: boolean
}

export interface AdminRosterResult {
  ok: boolean
  code?: string
  message?: string
  player_id?: string
  display_name?: string
  login_alias?: string
  active?: boolean
  drinkit_enabled?: boolean
  shipit_enabled?: boolean
  team_id?: string | null
  state_fingerprint?: string
  client_request_id?: string
  idempotent_replay?: boolean
  [key: string]: unknown
}

export type AdminRosterApplyResult =
  | { status: 'ok'; result: AdminRosterResult; clientRequestId: string }
  | {
      status: 'failed'
      message: string
      code: AdminRosterErrorCode
      clientRequestId: string
      result?: AdminRosterResult
    }
  | { status: 'unknown'; message: string; clientRequestId: string }

export interface ApplyPlayerAccessInput {
  clientRequestId: string
  playerId: string
  active: boolean
  drinkitEnabled: boolean
  shipitEnabled: boolean
  teamId: string | null
  expectedFingerprint: string
}

export interface CreatePlayerInput {
  clientRequestId: string
  displayName: string
  password: string
  drinkitEnabled: boolean
  shipitEnabled: boolean
  teamId: string | null
}

export interface ResetPasswordInput {
  clientRequestId: string
  playerId: string
  password: string
}

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

export function newRosterRequestId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`.slice(0, 36)
}

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new AdminRosterError('Supabase is not configured.', 'unavailable')
  }
  return supabase
}

async function rpc(fn: string, args?: Record<string, unknown>) {
  return client().rpc(fn as 'get_ship_clock_state', (args ?? {}) as never)
}

/** Map a server failure code to a client error code. */
export function mapRosterFailCode(code?: string): AdminRosterErrorCode {
  switch (code) {
    case 'ADMIN_REQUIRED':
    case 'NOT_AUTHENTICATED':
      return 'forbidden'
    case 'STALE_ROSTER_STATE':
      return 'stale'
    case 'REQUEST_ID_OPERATION_MISMATCH':
      return 'mismatch'
    case 'PLAYER_NOT_FOUND':
    case 'TEAM_NOT_FOUND':
      return 'not_found'
    case 'TEAM_REQUIRED':
      return 'team_required'
    case 'TEAM_HISTORY_LOCKED':
      return 'team_locked'
    case 'ADMIN_SELF_LOCKOUT':
      return 'self_lockout'
    case 'DISPLAY_NAME_TAKEN':
    case 'LOGIN_ALIAS_TAKEN':
      return 'name_taken'
    case 'PASSWORD_REQUIRED':
    case 'PASSWORD_TOO_SHORT':
    case 'PASSWORD_TOO_LONG':
      return 'invalid_password'
    case 'INVALID_DISPLAY_NAME':
      return 'invalid_name'
    default:
      return 'error'
  }
}

/** Human-readable message for a mapped code. Never includes request payloads. */
export function rosterFailMessage(code: AdminRosterErrorCode, fallback: string): string {
  switch (code) {
    case 'forbidden':
      return copy.admin.forbiddenBody
    case 'stale':
      return copy.admin.accessStaleBody
    case 'self_lockout':
      return copy.admin.accessSelfLockoutBody
    case 'team_locked':
      return copy.admin.accessTeamLockedBody
    case 'team_required':
      return copy.admin.teamRequired
    case 'name_taken':
      return copy.admin.nameTakenBody
    case 'invalid_password':
      return copy.admin.passwordTooShort
    case 'invalid_name':
      return copy.admin.playerNameInvalid
    default:
      return fallback
  }
}

/** Client-side password validation. Returns a message or null when valid. */
export function validateRosterPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return copy.admin.passwordTooShort
  if (password.length > PASSWORD_MAX_LENGTH) return copy.admin.passwordTooLong
  return null
}

function asFailed(
  result: AdminRosterResult | null | undefined,
  clientRequestId: string,
  fallback: string,
): AdminRosterApplyResult {
  const code = mapRosterFailCode(result?.code)
  return {
    status: 'failed',
    message: rosterFailMessage(code, fallback),
    code,
    clientRequestId,
    result: result ?? undefined,
  }
}

function safeMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listRoster(): Promise<RosterPlayer[]> {
  const { data, error } = await rpc('admin_list_roster')
  if (error) {
    if (/ADMIN_REQUIRED/i.test(error.message)) {
      throw new AdminRosterError(copy.admin.forbiddenBody, 'forbidden')
    }
    throw new AdminRosterError(error.message || copy.admin.rosterLoadError, 'error')
  }
  return (Array.isArray(data) ? data : []) as unknown as RosterPlayer[]
}

export async function listTeams(): Promise<RosterTeam[]> {
  const { data, error } = await rpc('admin_list_teams')
  if (error) {
    if (/ADMIN_REQUIRED/i.test(error.message)) {
      throw new AdminRosterError(copy.admin.forbiddenBody, 'forbidden')
    }
    throw new AdminRosterError(error.message || copy.admin.rosterLoadError, 'error')
  }
  return (Array.isArray(data) ? data : []) as unknown as RosterTeam[]
}

// ---------------------------------------------------------------------------
// Access edits (RPC)
// ---------------------------------------------------------------------------

export async function applyPlayerAccess(
  input: ApplyPlayerAccessInput,
): Promise<AdminRosterApplyResult> {
  try {
    const { data, error } = await rpc('admin_set_player_access', {
      p_client_request_id: input.clientRequestId,
      p_player_id: input.playerId,
      p_active: input.active,
      p_drinkit_enabled: input.drinkitEnabled,
      p_shipit_enabled: input.shipitEnabled,
      p_team_id: input.teamId,
      p_expected_fingerprint: input.expectedFingerprint,
    })
    if (error) {
      if (/ADMIN_REQUIRED/i.test(error.message)) {
        return {
          status: 'failed',
          message: copy.admin.forbiddenBody,
          code: 'forbidden',
          clientRequestId: input.clientRequestId,
        }
      }
      return {
        status: 'unknown',
        message: error.message || copy.admin.accessUnknownBody,
        clientRequestId: input.clientRequestId,
      }
    }
    const result = data as AdminRosterResult
    if (result?.ok) {
      return { status: 'ok', result, clientRequestId: input.clientRequestId }
    }
    return asFailed(result, input.clientRequestId, copy.admin.accessFailureBody)
  } catch (err) {
    return {
      status: 'unknown',
      message: safeMessage(err, copy.admin.accessUnknownBody),
      clientRequestId: input.clientRequestId,
    }
  }
}

/**
 * Look up a prior access request by id. A missing ledger row is NOT a failure —
 * it stays `unknown` so the caller can retry the same request id.
 */
export async function reconcilePlayerAccess(
  clientRequestId: string,
): Promise<AdminRosterApplyResult> {
  return reconcileLedger('admin_find_roster_access_request_by_id', clientRequestId, {
    failureFallback: copy.admin.accessFailureBody,
    unknownFallback: copy.admin.accessUnknownBody,
  })
}

/** Look up a prior create/reset request by id (no password involved). */
export async function reconcileAuthRequest(
  clientRequestId: string,
): Promise<AdminRosterApplyResult> {
  return reconcileLedger('admin_find_roster_auth_request_by_id', clientRequestId, {
    failureFallback: copy.admin.createFailureBody,
    unknownFallback: copy.admin.notRecordedBody,
  })
}

async function reconcileLedger(
  fn: string,
  clientRequestId: string,
  messages: { failureFallback: string; unknownFallback: string },
): Promise<AdminRosterApplyResult> {
  try {
    const { data, error } = await rpc(fn, { p_client_request_id: clientRequestId })
    if (error) {
      return {
        status: 'unknown',
        message: error.message || messages.unknownFallback,
        clientRequestId,
      }
    }
    if (data && typeof data === 'object') {
      const result = data as AdminRosterResult
      if (result.ok) return { status: 'ok', result, clientRequestId }
      return asFailed(result, clientRequestId, messages.failureFallback)
    }
    return { status: 'unknown', message: copy.admin.notRecordedBody, clientRequestId }
  } catch (err) {
    return {
      status: 'unknown',
      message: safeMessage(err, messages.unknownFallback),
      clientRequestId,
    }
  }
}

// ---------------------------------------------------------------------------
// Auth operations (Edge Function)
// ---------------------------------------------------------------------------

export function buildCreatePlayerBody(input: CreatePlayerInput): Record<string, unknown> {
  return {
    action: 'create_player',
    client_request_id: input.clientRequestId,
    display_name: input.displayName.trim(),
    password: input.password,
    drinkit_enabled: input.drinkitEnabled,
    shipit_enabled: input.shipitEnabled,
    team_id: input.teamId,
  }
}

export function buildResetPasswordBody(input: ResetPasswordInput): Record<string, unknown> {
  return {
    action: 'reset_password',
    client_request_id: input.clientRequestId,
    player_id: input.playerId,
    password: input.password,
  }
}

/** Copy of a request body that is safe to log or assert on. */
export function redactRosterBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body }
  if ('password' in out) out.password = '[redacted]'
  return out
}

interface FunctionHttpErrorLike {
  name?: string
  message?: string
  context?: { status?: number; json?: () => Promise<unknown> }
}

async function readHttpError(
  error: FunctionHttpErrorLike,
): Promise<{ status: number; body: AdminRosterResult | null } | null> {
  const ctx = error.context
  if (!ctx || typeof ctx.status !== 'number') return null
  let body: AdminRosterResult | null = null
  try {
    if (typeof ctx.json === 'function') body = (await ctx.json()) as AdminRosterResult
  } catch {
    body = null
  }
  return { status: ctx.status, body }
}

async function invokeRoster(
  body: Record<string, unknown>,
  clientRequestId: string,
  messages: { failureFallback: string; unknownFallback: string },
): Promise<AdminRosterApplyResult> {
  try {
    const { data, error } = await client().functions.invoke('admin-roster', { body })
    if (error) {
      const http = await readHttpError(error as FunctionHttpErrorLike)
      if (http && http.status >= 400 && http.status < 500 && http.body) {
        return asFailed(http.body, clientRequestId, messages.failureFallback)
      }
      if (http && (http.status === 401 || http.status === 403)) {
        return {
          status: 'failed',
          message: copy.admin.forbiddenBody,
          code: 'forbidden',
          clientRequestId,
        }
      }
      // 5xx or transport loss: outcome not confirmed. Reconcile by request id.
      return { status: 'unknown', message: messages.unknownFallback, clientRequestId }
    }
    const result = data as AdminRosterResult | null
    if (result?.ok) return { status: 'ok', result, clientRequestId }
    if (result && result.ok === false) {
      return asFailed(result, clientRequestId, messages.failureFallback)
    }
    return { status: 'unknown', message: messages.unknownFallback, clientRequestId }
  } catch (err) {
    if (err instanceof AdminRosterError && err.code === 'unavailable') {
      return {
        status: 'failed',
        message: err.message,
        code: 'unavailable',
        clientRequestId,
      }
    }
    return { status: 'unknown', message: messages.unknownFallback, clientRequestId }
  }
}

export async function createPlayer(input: CreatePlayerInput): Promise<AdminRosterApplyResult> {
  return invokeRoster(buildCreatePlayerBody(input), input.clientRequestId, {
    failureFallback: copy.admin.createFailureBody,
    unknownFallback: copy.admin.createUnknownBody,
  })
}

export async function resetPassword(input: ResetPasswordInput): Promise<AdminRosterApplyResult> {
  return invokeRoster(buildResetPasswordBody(input), input.clientRequestId, {
    failureFallback: copy.admin.resetFailureBody,
    unknownFallback: copy.admin.resetUnknownBody,
  })
}
