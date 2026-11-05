/**
 * Organizer Pause/Resume for Drink It! — never touches Ship Clock.
 * Lost-response recovery mirrors Admin clock corrections: persist before mutate,
 * reconcile via durable server request-id ledger, never unlock on failed reads.
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { pauseFingerprint } from '@/lib/pendingDrinkItPause'

export class AdminPauseError extends Error {
  code: 'unavailable' | 'error' | 'forbidden' | 'finale' | 'mismatch'

  constructor(
    message: string,
    code: 'unavailable' | 'error' | 'forbidden' | 'finale' | 'mismatch' = 'error',
  ) {
    super(message)
    this.name = 'AdminPauseError'
    this.code = code
  }
}

export interface DrinkItPauseStatus {
  cruise_config_id?: string | null
  drinkit: {
    status: string
    paused: boolean
    paused_at_utc: string | null
    finalized_at_utc: string | null
  }
  shipit: {
    status: string
    paused: boolean
    finalized_at_utc: string | null
  }
}

export interface SetPauseResult {
  paused: boolean
  status: string
  changed: boolean
  paused_at_utc: string | null
  finalized_at_utc: string | null
  client_request_id: string | null
  client_request_fingerprint?: string | null
  idempotent_replay?: boolean
  cruise_config_id?: string | null
}

export interface PauseRequestRecord {
  client_request_id: string
  fingerprint: string
  desired_paused: boolean
  paused: boolean
  status: string
  changed: boolean
  paused_at_utc: string | null
  finalized_at_utc: string | null
  cruise_config_id: string | null
  created_at?: string
  idempotent_replay?: boolean
}

export type PauseApplyResult =
  | {
      status: 'ok'
      result: SetPauseResult
      pauseStatus: DrinkItPauseStatus
      clientRequestId: string
      desiredPaused: boolean
    }
  | {
      status: 'failed'
      message: string
      code: AdminPauseError['code']
      clientRequestId: string
      desiredPaused: boolean
      pauseStatus?: DrinkItPauseStatus
    }
  | {
      status: 'unknown'
      message: string
      clientRequestId: string
      desiredPaused: boolean
      pauseStatus?: DrinkItPauseStatus
    }

export function newPauseRequestId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID()
  }
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`.slice(0, 36)
}

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new AdminPauseError('Supabase is not configured.', 'unavailable')
  }
  return supabase
}

function mapRpcError(message: string): AdminPauseError {
  if (/ADMIN_REQUIRED/i.test(message)) return new AdminPauseError(message, 'forbidden')
  if (/FINALE_LOCKED/i.test(message)) return new AdminPauseError(message, 'finale')
  if (/REQUEST_ID_OPERATION_MISMATCH/i.test(message)) {
    return new AdminPauseError(message, 'mismatch')
  }
  return new AdminPauseError(message, 'error')
}

function isTransportOrUnknown(message: string): boolean {
  return /failed to fetch|network|timeout|abort|load failed|fetch/i.test(message)
}

export async function fetchDrinkItPauseStatus(): Promise<DrinkItPauseStatus> {
  const { data, error } = await client().rpc('admin_get_drinkit_pause_status')
  if (error) throw mapRpcError(error.message ?? '')
  return data as DrinkItPauseStatus
}

export async function findPauseRequestById(
  clientRequestId: string,
): Promise<PauseRequestRecord | null> {
  const { data, error } = await client().rpc(
    'admin_find_drinkit_pause_request_by_id' as 'get_ship_clock_state',
    { p_client_request_id: clientRequestId } as never,
  )
  if (error) throw mapRpcError(error.message ?? '')
  if (data == null) return null
  return data as unknown as PauseRequestRecord
}

async function rpcSetPaused(
  paused: boolean,
  clientRequestId: string,
): Promise<SetPauseResult> {
  const { data, error } = await client().rpc('admin_set_drinkit_paused' as 'get_ship_clock_state', {
    p_paused: paused,
    p_client_request_id: clientRequestId,
  } as never)
  if (error) throw mapRpcError(error.message ?? '')
  return data as SetPauseResult
}

/**
 * Reconcile an unresolved Pause/Resume against the durable server ledger.
 * Failed diagnostic reads stay `unknown` — callers must NOT clear pending.
 * Matching current pause status alone is not success (another admin may have acted).
 */
export async function reconcileDrinkItPause(
  clientRequestId: string,
  desiredPaused: boolean,
): Promise<PauseApplyResult> {
  const expectedFp = pauseFingerprint(desiredPaused)
  try {
    const found = await findPauseRequestById(clientRequestId)
    let pauseStatus: DrinkItPauseStatus | undefined
    try {
      pauseStatus = await fetchDrinkItPauseStatus()
    } catch {
      // Status read failed — still may have found the request ledger row.
    }

    if (found) {
      if (found.fingerprint !== expectedFp) {
        return {
          status: 'unknown',
          message:
            'This pending change does not match the server record. Refresh status, then retry the same change.',
          clientRequestId,
          desiredPaused,
          pauseStatus,
        }
      }
      if (!pauseStatus) {
        // Ledger confirms apply, but live status could not be loaded — keep unknown.
        return {
          status: 'unknown',
          message:
            'We confirmed the change was recorded but could not refresh Game Status. Refresh again.',
          clientRequestId,
          desiredPaused,
        }
      }
      return {
        status: 'ok',
        result: {
          paused: found.paused,
          status: found.status,
          changed: found.changed,
          paused_at_utc: found.paused_at_utc,
          finalized_at_utc: found.finalized_at_utc,
          client_request_id: found.client_request_id,
          client_request_fingerprint: found.fingerprint,
          idempotent_replay: true,
          cruise_config_id: found.cruise_config_id,
        },
        pauseStatus,
        clientRequestId,
        desiredPaused,
      }
    }

    // Successful reads and id absent: may still be processing — stay unknown.
    // Do not claim "Change Not Saved" and do not unlock for a conflicting op.
    return {
      status: 'unknown',
      message:
        'We could not confirm whether that change was saved. It may still be processing. Refresh again, or retry the same change.',
      clientRequestId,
      desiredPaused,
      pauseStatus,
    }
  } catch {
    return {
      status: 'unknown',
      message:
        'We could not confirm whether that change was saved. Refresh status before trying again.',
      clientRequestId,
      desiredPaused,
    }
  }
}

/**
 * Apply Pause/Resume then validate against the authoritative ledger + status.
 * Callers must persist the pending request id before invoking this.
 */
export async function applyDrinkItPaused(
  paused: boolean,
  clientRequestId: string,
): Promise<PauseApplyResult> {
  try {
    const result = await rpcSetPaused(paused, clientRequestId)
    // Validate via ledger — never claim success on transport alone.
    const validated = await reconcileDrinkItPause(clientRequestId, paused)
    if (validated.status === 'ok') {
      return {
        ...validated,
        result: {
          ...validated.result,
          changed: result.changed,
          idempotent_replay: result.idempotent_replay ?? validated.result.idempotent_replay,
        },
      }
    }
    if (validated.status === 'unknown') {
      // RPC appeared to succeed but post-validation could not confirm — stay unknown.
      return validated
    }
    return validated
  } catch (err) {
    if (err instanceof AdminPauseError) {
      if (err.code === 'finale' || err.code === 'forbidden' || err.code === 'mismatch') {
        // Confirmed non-application (or binding mismatch) — safe to surface as failed.
        let pauseStatus: DrinkItPauseStatus | undefined
        try {
          pauseStatus = await fetchDrinkItPauseStatus()
        } catch {
          /* ignore */
        }
        return {
          status: 'failed',
          message: err.message,
          code: err.code,
          clientRequestId,
          desiredPaused: paused,
          pauseStatus,
        }
      }
      if (!isTransportOrUnknown(err.message) && err.code === 'error') {
        // Non-transport RPC rejection without confirmation of apply.
        return {
          status: 'unknown',
          message: err.message,
          clientRequestId,
          desiredPaused: paused,
        }
      }
    }
    return reconcileDrinkItPause(clientRequestId, paused)
  }
}

/** @deprecated Prefer applyDrinkItPaused — kept for simple fire-and-forget callers. */
export async function setDrinkItPaused(
  paused: boolean,
  clientRequestId: string,
): Promise<SetPauseResult> {
  const outcome = await applyDrinkItPaused(paused, clientRequestId)
  if (outcome.status === 'ok') return outcome.result
  if (outcome.status === 'failed') {
    throw new AdminPauseError(outcome.message, outcome.code)
  }
  throw new AdminPauseError(outcome.message, 'error')
}
