/**
 * Organizer Admin — first production bounty schedule initialization.
 * Does not start gameplay. Lost-response recovery via durable request-id ledger.
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { scheduleInitFingerprint } from '@/lib/pendingBountyScheduleInit'

export class AdminScheduleInitError extends Error {
  code: 'unavailable' | 'error' | 'forbidden' | 'finale' | 'mismatch'

  constructor(
    message: string,
    code: 'unavailable' | 'error' | 'forbidden' | 'finale' | 'mismatch' = 'error',
  ) {
    super(message)
    this.name = 'AdminScheduleInitError'
    this.code = code
  }
}

export type BountyScheduleCompleteness = {
  cocktail_slots: number
  ingredient_slots: number
  bar_assignments: number
  daily_challenges: number
  schedule_runs: number
  active_claims: number
  complete: boolean
  partial: boolean
}

export type BountyScheduleStatus = {
  ok: boolean
  initialized?: boolean
  can_initialize?: boolean
  partial?: boolean
  code?: string
  message?: string
  cruise_config_id?: string | null
  cruise_label?: string | null
  day1_ship_date?: string | null
  catalog_version_id?: string | null
  drinkit_status?: string | null
  finalized_at_utc?: string | null
  completeness?: BountyScheduleCompleteness
  eligible_cocktail_candidates?: number
  eligible_ingredient_candidates?: number
  gameplay_started_by_schedule?: boolean
}

export type ScheduleInitResult = {
  ok: boolean
  code?: string
  message?: string
  idempotent?: boolean
  idempotent_replay?: boolean
  client_request_id?: string
  client_request_fingerprint?: string
  cruise_config_id?: string | null
  catalog_version_id?: string | null
  schedule_run_id?: string
  cocktail_slots?: number
  ingredient_slots?: number
  bar_assignments?: number
  daily_challenges?: number
  gameplay_started?: boolean
  completeness?: BountyScheduleCompleteness
}

export type ScheduleInitApplyResult =
  | {
      status: 'ok'
      result: ScheduleInitResult
      scheduleStatus: BountyScheduleStatus
      clientRequestId: string
    }
  | {
      status: 'failed'
      message: string
      code: AdminScheduleInitError['code']
      clientRequestId: string
      scheduleStatus?: BountyScheduleStatus
      result?: ScheduleInitResult
    }
  | {
      status: 'unknown'
      message: string
      clientRequestId: string
      scheduleStatus?: BountyScheduleStatus
    }

export function newScheduleInitRequestId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID()
  }
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`.slice(0, 36)
}

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new AdminScheduleInitError('Supabase is not configured.', 'unavailable')
  }
  return supabase
}

function mapRpcError(message: string): AdminScheduleInitError {
  if (/ADMIN_REQUIRED/i.test(message)) return new AdminScheduleInitError(message, 'forbidden')
  if (/CRUISE_FINALIZED|FINALE_LOCKED/i.test(message)) {
    return new AdminScheduleInitError(message, 'finale')
  }
  if (/REQUEST_ID_OPERATION_MISMATCH/i.test(message)) {
    return new AdminScheduleInitError(message, 'mismatch')
  }
  return new AdminScheduleInitError(message, 'error')
}

function isTransportOrUnknown(message: string): boolean {
  return /failed to fetch|network|timeout|abort|load failed|fetch/i.test(message)
}

export async function fetchBountyScheduleStatus(): Promise<BountyScheduleStatus> {
  const { data, error } = await client().rpc(
    'admin_get_bounty_schedule_status' as 'get_ship_clock_state',
  )
  if (error) throw mapRpcError(error.message ?? '')
  return data as unknown as BountyScheduleStatus
}

export async function findScheduleInitRequestById(
  clientRequestId: string,
): Promise<{ ok: boolean; result?: ScheduleInitResult; code?: string }> {
  const { data, error } = await client().rpc(
    'admin_find_bounty_schedule_init_request_by_id' as 'get_ship_clock_state',
    { p_client_request_id: clientRequestId } as never,
  )
  if (error) throw mapRpcError(error.message ?? '')
  const row = data as {
    ok: boolean
    code?: string
    result?: ScheduleInitResult
  }
  return row
}

export async function applyBountyScheduleInit(opts: {
  clientRequestId: string
  seed?: string | null
  cruiseConfigId?: string | null
}): Promise<ScheduleInitApplyResult> {
  const { clientRequestId, seed = null } = opts
  void scheduleInitFingerprint(seed)

  try {
    const { data, error } = await client().rpc(
      'admin_initialize_bounty_schedule' as 'get_ship_clock_state',
      {
        p_client_request_id: clientRequestId,
        p_seed: seed,
      } as never,
    )
    if (error) {
      if (isTransportOrUnknown(error.message ?? '')) {
        return {
          status: 'unknown',
          message: error.message ?? 'Unknown transport error',
          clientRequestId,
        }
      }
      const mapped = mapRpcError(error.message ?? '')
      return {
        status: 'failed',
        message: mapped.message,
        code: mapped.code,
        clientRequestId,
      }
    }

    const result = data as ScheduleInitResult
    let scheduleStatus: BountyScheduleStatus
    try {
      scheduleStatus = await fetchBountyScheduleStatus()
    } catch {
      scheduleStatus = {
        ok: true,
        initialized: Boolean(result.ok && result.code !== 'SCHEDULE_INCOMPLETE_OR_CORRUPT'),
      }
    }

    if (result.ok) {
      return { status: 'ok', result, scheduleStatus, clientRequestId }
    }

    return {
      status: 'failed',
      message: result.message || result.code || 'Schedule initialization failed',
      code: /FINAL/i.test(result.code || '') ? 'finale' : 'error',
      clientRequestId,
      scheduleStatus,
      result,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isTransportOrUnknown(message)) {
      return { status: 'unknown', message, clientRequestId }
    }
    const mapped = mapRpcError(message)
    return {
      status: 'failed',
      message: mapped.message,
      code: mapped.code,
      clientRequestId,
    }
  }
}

export async function reconcileBountyScheduleInit(opts: {
  clientRequestId: string
}): Promise<ScheduleInitApplyResult> {
  const { clientRequestId } = opts
  try {
    const found = await findScheduleInitRequestById(clientRequestId)
    if (!found.ok || found.code === 'NOT_FOUND') {
      return {
        status: 'unknown',
        message: 'Schedule initialization request was not found yet.',
        clientRequestId,
      }
    }
    const result = (found.result || {}) as ScheduleInitResult
    let scheduleStatus: BountyScheduleStatus | undefined
    try {
      scheduleStatus = await fetchBountyScheduleStatus()
    } catch {
      /* keep pending until status readable */
    }
    if (result.ok) {
      return {
        status: 'ok',
        result: { ...result, idempotent_replay: true },
        scheduleStatus: scheduleStatus || { ok: true, initialized: true },
        clientRequestId,
      }
    }
    return {
      status: 'failed',
      message: result.message || result.code || 'Schedule initialization failed',
      code: 'error',
      clientRequestId,
      scheduleStatus,
      result,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (isTransportOrUnknown(message)) {
      return { status: 'unknown', message, clientRequestId }
    }
    return {
      status: 'failed',
      message,
      code: 'error',
      clientRequestId,
    }
  }
}
