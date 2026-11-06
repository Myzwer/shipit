import { supabase, isSupabaseConfigured } from '@/lib/supabase'

export class AdminVoidError extends Error {
  code: 'unavailable' | 'error' | 'forbidden' | 'finale' | 'mismatch' | 'stale' | 'not_found'

  constructor(
    message: string,
    code:
      | 'unavailable'
      | 'error'
      | 'forbidden'
      | 'finale'
      | 'mismatch'
      | 'stale'
      | 'not_found' = 'error',
  ) {
    super(message)
    this.name = 'AdminVoidError'
    this.code = code
  }
}

export interface AdminVoidPreview {
  ok: boolean
  code?: string
  message?: string
  submission_id?: string
  game?: 'drinkit' | 'shipit'
  kind?: string
  status?: string
  expected_status?: string
  owner_player_name?: string | null
  owner_team_name?: string | null
  received_at_utc?: string
  ship_day?: number
  display?: Record<string, unknown>
  points_active?: number
  claims?: Array<Record<string, unknown>>
  scavenger_completion?: Record<string, unknown> | null
  void_permitted?: boolean
  void_block_code?: string | null
  consequences?: Record<string, unknown>
}

export interface AdminVoidResult {
  ok: boolean
  code?: string
  message?: string
  voided?: boolean
  client_request_id?: string
  submission_id?: string
  game?: string
  kind?: string
  points_removed?: number
  claims_voided?: number
  idempotent_replay?: boolean
  [key: string]: unknown
}

export type AdminVoidApplyResult =
  | {
      status: 'ok'
      result: AdminVoidResult
      clientRequestId: string
    }
  | {
      status: 'failed'
      message: string
      code: AdminVoidError['code']
      clientRequestId: string
      result?: AdminVoidResult
    }
  | {
      status: 'unknown'
      message: string
      clientRequestId: string
    }

export function newVoidRequestId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`.slice(0, 36)
}

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new AdminVoidError('Supabase is not configured.', 'unavailable')
  }
  return supabase
}

async function rpc(fn: string, args?: Record<string, unknown>) {
  return client().rpc(fn as 'get_ship_clock_state', (args ?? {}) as never)
}

function mapFailCode(code?: string): AdminVoidError['code'] {
  if (code === 'FINALE_LOCKED') return 'finale'
  if (code === 'STALE_EXPECTED_STATE' || code === 'ALREADY_VOIDED') return 'stale'
  if (code === 'REQUEST_ID_OPERATION_MISMATCH') return 'mismatch'
  if (code === 'SUBMISSION_NOT_FOUND') return 'not_found'
  if (code === 'ADMIN_REQUIRED') return 'forbidden'
  return 'error'
}

export async function previewVoidSubmission(submissionId: string): Promise<AdminVoidPreview> {
  const { data, error } = await rpc('admin_preview_void_submission', {
    p_submission_id: submissionId,
  })
  if (error) {
    if (/ADMIN_REQUIRED/i.test(error.message)) {
      throw new AdminVoidError('Admin access required.', 'forbidden')
    }
    throw new AdminVoidError(error.message || 'Preview failed.', 'error')
  }
  return data as AdminVoidPreview
}

export async function applyVoidSubmission(input: {
  clientRequestId: string
  submissionId: string
  expectedStatus: string
  reason?: string | null
}): Promise<AdminVoidApplyResult> {
  try {
    const { data, error } = await rpc('admin_void_submission', {
      p_client_request_id: input.clientRequestId,
      p_submission_id: input.submissionId,
      p_expected_status: input.expectedStatus,
      p_reason: input.reason ?? null,
    })
    if (error) {
      if (/ADMIN_REQUIRED/i.test(error.message)) {
        return {
          status: 'failed',
          message: 'Admin access required.',
          code: 'forbidden',
          clientRequestId: input.clientRequestId,
        }
      }
      return {
        status: 'unknown',
        message: error.message || 'Could not confirm void.',
        clientRequestId: input.clientRequestId,
      }
    }
    const result = data as AdminVoidResult
    if (result?.ok) {
      return { status: 'ok', result, clientRequestId: input.clientRequestId }
    }
    return {
      status: 'failed',
      message: result?.message || result?.code || 'Void failed.',
      code: mapFailCode(result?.code),
      clientRequestId: input.clientRequestId,
      result,
    }
  } catch (err) {
    return {
      status: 'unknown',
      message: err instanceof Error ? err.message : 'Could not confirm void.',
      clientRequestId: input.clientRequestId,
    }
  }
}

export async function reconcileVoidSubmission(
  clientRequestId: string,
  submissionId: string,
  expectedStatus: string,
  reason?: string | null,
): Promise<AdminVoidApplyResult> {
  try {
    const { data: found, error: findErr } = await rpc('admin_find_void_request_by_id', {
      p_client_request_id: clientRequestId,
    })
    if (!findErr && found && typeof found === 'object') {
      const result = found as AdminVoidResult
      if (result.ok) {
        return { status: 'ok', result, clientRequestId }
      }
      return {
        status: 'failed',
        message: result.message || result.code || 'Void failed.',
        code: mapFailCode(result.code),
        clientRequestId,
        result,
      }
    }
  } catch {
    /* fall through to retry same UUID */
  }
  return applyVoidSubmission({
    clientRequestId,
    submissionId,
    expectedStatus,
    reason,
  })
}
