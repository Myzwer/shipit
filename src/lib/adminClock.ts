/**
 * Organizer Ship Clock mutations. All authorization is server-side (require_admin).
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type {
  AdminClockDiagnostics,
  ManualCorrectionIntent,
  PlanDeltaChoice,
  ShipClockPlanDay,
  ShipClockState,
} from '@/types/shipClock'

export class AdminClockError extends Error {
  kind: 'auth' | 'network' | 'rpc' | 'unavailable' | 'ambiguous'

  constructor(
    message: string,
    kind: 'auth' | 'network' | 'rpc' | 'unavailable' | 'ambiguous' = 'rpc',
  ) {
    super(message)
    this.name = 'AdminClockError'
    this.kind = kind
  }
}

function client() {
  if (!isSupabaseConfigured || !supabase) {
    throw new AdminClockError('Supabase is not configured.', 'unavailable')
  }
  return supabase
}

/** Admin RPC helper — args validated at the Postgres boundary via require_admin. */
async function adminRpc(fn: string, args?: Record<string, unknown>) {
  const { data, error } = await client().rpc(fn as 'get_ship_clock_state', args as never)
  return { data, error }
}

function newRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`.slice(0, 36)
}

function isTransportOrUnknownRpcError(message: string): boolean {
  return /failed to fetch|network|timeout|abort|load failed|fetch/i.test(message)
}

function isConfirmedRejection(message: string): boolean {
  return /ADMIN_REQUIRED|INVALID_|MANUAL_DELTA|NO_ACTIVE|PLAN_MUST|DUPLICATE_PLAN|42501|permission|JWT/i.test(
    message,
  )
}

export async function fetchAdminClockDiagnostics(): Promise<AdminClockDiagnostics> {
  const { data, error } = await adminRpc('admin_get_clock_diagnostics')
  if (error) {
    const kind = /ADMIN_REQUIRED|42501|permission/i.test(error.message) ? 'auth' : 'rpc'
    throw new AdminClockError(error.message, kind)
  }
  return data as unknown as AdminClockDiagnostics
}

export async function findEventByRequestId(requestId: string) {
  const { data, error } = await adminRpc('admin_find_clock_event_by_request_id', {
    p_client_request_id: requestId,
  })
  if (error) throw new AdminClockError(error.message, 'rpc')
  return data as unknown as {
    id: string
    delta_minutes: number
    offset_minutes: number
    source: string
    client_request_id: string
  } | null
}

export async function previewManualDelta(deltaMinutes: 60 | -60): Promise<{
  before: ShipClockState
  after_offset_minutes: number
  after_ship_local: string
  delta_minutes: number
}> {
  const { data, error } = await adminRpc('admin_preview_manual_clock_correction', {
    p_delta_minutes: deltaMinutes,
  })
  if (error) throw new AdminClockError(error.message, 'rpc')
  return data as unknown as {
    before: ShipClockState
    after_offset_minutes: number
    after_ship_local: string
    delta_minutes: number
  }
}

export type ApplyCorrectionResult =
  | {
      status: 'ok'
      after: ShipClockState
      diagnostics: AdminClockDiagnostics
      clientRequestId: string
      eventId?: string
    }
  | {
      status: 'failed'
      message: string
      intent: ManualCorrectionIntent
      before: ShipClockState
      clientRequestId: string
    }
  | {
      status: 'unknown'
      message: string
      intent: ManualCorrectionIntent
      before: ShipClockState
      clientRequestId: string
      diagnostics?: AdminClockDiagnostics
    }

async function reconcileByRequestId(
  clientRequestId: string,
  intent: ManualCorrectionIntent,
  before: ShipClockState,
): Promise<ApplyCorrectionResult> {
  try {
    const found = await findEventByRequestId(clientRequestId)
    const diagnostics = await fetchAdminClockDiagnostics()
    if (found) {
      return {
        status: 'ok',
        after: diagnostics.state,
        diagnostics,
        clientRequestId,
        eventId: found.id,
      }
    }
    // Diagnostics succeeded and our request id is absent — still unknown until the
    // operator explicitly refreshes again; do not claim "Change Not Saved".
    return {
      status: 'unknown',
      message:
        'We could not confirm whether that change was saved. Refresh Ship Time before trying again.',
      intent,
      before,
      clientRequestId,
      diagnostics,
    }
  } catch {
    return {
      status: 'unknown',
      message:
        'We could not confirm whether that change was saved. Refresh Ship Time before trying again.',
      intent,
      before,
      clientRequestId,
    }
  }
}

/**
 * Apply a non-idempotent correction with a client request id.
 * Transport failures → unknown (never "Change Not Saved").
 * Server business rejections → failed.
 */
export async function applyManualCorrection(
  intent: ManualCorrectionIntent,
  options?: { clientRequestId?: string },
): Promise<ApplyCorrectionResult> {
  const beforeDiag = await fetchAdminClockDiagnostics()
  const before = beforeDiag.state
  const clientRequestId = options?.clientRequestId ?? newRequestId()

  try {
    if (intent.kind === 'set_time') {
      if (!intent.targetShipLocal) {
        return {
          status: 'failed',
          message: 'Enter a Ship Time to apply.',
          intent,
          before,
          clientRequestId,
        }
      }
      const { data, error } = await adminRpc('admin_apply_manual_clock_set', {
        p_target_ship_local: intent.targetShipLocal,
        p_note: 'Admin Set Ship Time',
        p_client_request_id: clientRequestId,
      })
      if (error) {
        if (isConfirmedRejection(error.message)) {
          return { status: 'failed', message: error.message, intent, before, clientRequestId }
        }
        // Network / ambiguous RPC error — mutation may have applied.
        return reconcileByRequestId(clientRequestId, intent, before)
      }

      const payload = data as unknown as {
        after: ShipClockState
        event_id?: string
        unchanged?: boolean
      }
      try {
        const diagnostics = await fetchAdminClockDiagnostics()
        return {
          status: 'ok',
          after: payload.after ?? diagnostics.state,
          diagnostics,
          clientRequestId,
          eventId: payload.event_id,
        }
      } catch {
        // Mutation response received — confirmed application even if refresh failed.
        return {
          status: 'ok',
          after: payload.after ?? before,
          diagnostics: { ...beforeDiag, state: payload.after ?? before },
          clientRequestId,
          eventId: payload.event_id,
        }
      }
    }

    const delta = intent.deltaMinutes
    if (delta !== 60 && delta !== -60) {
      return {
        status: 'failed',
        message: 'Invalid adjustment.',
        intent,
        before,
        clientRequestId,
      }
    }

    const { data, error } = await adminRpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: delta,
      p_note: delta === 60 ? 'Admin +1 Hour' : 'Admin −1 Hour',
      p_client_request_id: clientRequestId,
    })
    if (error) {
      if (isConfirmedRejection(error.message)) {
        return { status: 'failed', message: error.message, intent, before, clientRequestId }
      }
      return reconcileByRequestId(clientRequestId, intent, before)
    }

    const payload = data as unknown as { after: ShipClockState; event_id?: string }
    try {
      const diagnostics = await fetchAdminClockDiagnostics()
      return {
        status: 'ok',
        after: payload.after ?? diagnostics.state,
        diagnostics,
        clientRequestId,
        eventId: payload.event_id,
      }
    } catch {
      return {
        status: 'ok',
        after: payload.after ?? before,
        diagnostics: { ...beforeDiag, state: payload.after ?? before },
        clientRequestId,
        eventId: payload.event_id,
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    if (isConfirmedRejection(message) && !isTransportOrUnknownRpcError(message)) {
      return { status: 'failed', message, intent, before, clientRequestId }
    }
    return reconcileByRequestId(clientRequestId, intent, before)
  }
}

/** Re-check an UNKNOWN attempt using its request id. Never re-sends ±1h. */
export async function reconcileManualCorrection(
  clientRequestId: string,
  intent: ManualCorrectionIntent,
  before: ShipClockState,
): Promise<ApplyCorrectionResult> {
  return reconcileByRequestId(clientRequestId, intent, before)
}

export type SavePlanResult = {
  diagnostics: AdminClockDiagnostics
  changed: boolean
  rebuilt: boolean
  plan: ShipClockPlanDay[]
  futureEventIdsBefore: string[]
  futureEventIdsAfter: string[]
}

/** Atomic seven-day plan save (single transactional RPC). */
export async function saveShipClockPlan(
  days: Array<{ day_number: number; delta_minutes: PlanDeltaChoice; enabled: boolean }>,
): Promise<SavePlanResult> {
  if (days.length !== 7) {
    throw new AdminClockError('Plan must include exactly seven days.', 'rpc')
  }
  const { data, error } = await adminRpc('admin_save_ship_clock_plan', {
    p_days: days,
  })
  if (error) {
    const kind = /ADMIN_REQUIRED|42501|permission/i.test(error.message) ? 'auth' : 'rpc'
    throw new AdminClockError(error.message, kind)
  }
  const payload = data as unknown as {
    changed: boolean
    rebuilt: boolean
    plan: ShipClockPlanDay[]
    state: ShipClockState
    actor_id: string | null
    future_event_ids_before?: string[]
    future_event_ids_after?: string[]
  }
  let diagnostics: AdminClockDiagnostics
  try {
    diagnostics = await fetchAdminClockDiagnostics()
  } catch {
    diagnostics = {
      actor_id: payload.actor_id,
      state: payload.state,
      plan: payload.plan,
      events: [],
    }
  }
  return {
    diagnostics,
    changed: Boolean(payload.changed),
    rebuilt: Boolean(payload.rebuilt),
    plan: payload.plan ?? diagnostics.plan,
    futureEventIdsBefore: payload.future_event_ids_before ?? [],
    futureEventIdsAfter: payload.future_event_ids_after ?? [],
  }
}

/** @deprecated Use saveShipClockPlan — kept for transitional imports. */
export async function savePlanDays(
  days: Array<{ day_number: number; delta_minutes: PlanDeltaChoice; enabled: boolean }>,
): Promise<AdminClockDiagnostics> {
  const result = await saveShipClockPlan(days)
  return result.diagnostics
}
