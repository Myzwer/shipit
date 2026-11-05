/**
 * Organizer Ship Clock mutations. All authorization is server-side (require_admin).
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import type {
  AdminClockDiagnostics,
  ManualCorrectionIntent,
  PlanDeltaChoice,
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
  // Generated Database typings for these RPCs are incomplete; cast at the boundary.
  const { data, error } = await client().rpc(fn as 'get_ship_clock_state', args as never)
  return { data, error }
}

export async function fetchAdminClockDiagnostics(): Promise<AdminClockDiagnostics> {
  const { data, error } = await adminRpc('admin_get_clock_diagnostics')
  if (error) {
    const kind = /ADMIN_REQUIRED|42501|permission/i.test(error.message) ? 'auth' : 'rpc'
    throw new AdminClockError(error.message, kind)
  }
  return data as unknown as AdminClockDiagnostics
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
  | { status: 'ok'; after: ShipClockState; diagnostics: AdminClockDiagnostics }
  | {
      status: 'ambiguous'
      message: string
      before: ShipClockState
      diagnostics: AdminClockDiagnostics
      intent: ManualCorrectionIntent
    }
  | { status: 'failed'; message: string; intent: ManualCorrectionIntent; before: ShipClockState }

/**
 * Apply a non-idempotent correction. On uncertain network failure, re-fetch and
 * require reconciliation instead of blindly retrying ±1h.
 */
export async function applyManualCorrection(
  intent: ManualCorrectionIntent,
): Promise<ApplyCorrectionResult> {
  const beforeDiag = await fetchAdminClockDiagnostics()
  const before = beforeDiag.state
  const beforeOffset = before.offset_minutes

  try {
    if (intent.kind === 'set_time') {
      if (!intent.targetShipLocal) {
        return { status: 'failed', message: 'Enter a Ship Time to apply.', intent, before }
      }
      const { data, error } = await adminRpc('admin_apply_manual_clock_set', {
        p_target_ship_local: intent.targetShipLocal,
        p_note: 'Admin Set Ship Time',
      })
      if (error) throw new AdminClockError(error.message, 'rpc')
      const diagnostics = await fetchAdminClockDiagnostics()
      return {
        status: 'ok',
        after: (data as unknown as { after: ShipClockState }).after ?? diagnostics.state,
        diagnostics,
      }
    }

    const delta = intent.deltaMinutes
    if (delta !== 60 && delta !== -60) {
      return { status: 'failed', message: 'Invalid adjustment.', intent, before }
    }
    const { data, error } = await adminRpc('admin_apply_manual_clock_correction', {
      p_delta_minutes: delta,
      p_note: delta === 60 ? 'Admin +1 Hour' : 'Admin −1 Hour',
    })
    if (error) throw new AdminClockError(error.message, 'rpc')
    const diagnostics = await fetchAdminClockDiagnostics()
    return {
      status: 'ok',
      after: (data as unknown as { after: ShipClockState }).after ?? diagnostics.state,
      diagnostics,
    }
  } catch (err) {
    // Uncertain outcome — do not auto-retry non-idempotent ±1h.
    let diagnostics: AdminClockDiagnostics
    try {
      diagnostics = await fetchAdminClockDiagnostics()
    } catch {
      return {
        status: 'failed',
        message: err instanceof Error ? err.message : 'Change Not Saved',
        intent,
        before,
      }
    }

    const afterOffset = diagnostics.state.offset_minutes
    if (
      beforeOffset != null &&
      afterOffset != null &&
      afterOffset !== beforeOffset &&
      intent.kind !== 'set_time'
    ) {
      return {
        status: 'ambiguous',
        message:
          'The previous attempt may already have applied. Review Current Ship Time before trying again.',
        before,
        diagnostics,
        intent,
      }
    }

    return {
      status: 'failed',
      message: err instanceof Error ? err.message : 'Change Not Saved',
      intent,
      before,
    }
  }
}

export async function upsertPlanDay(
  dayNumber: number,
  deltaMinutes: PlanDeltaChoice,
  enabled = true,
): Promise<AdminClockDiagnostics> {
  const { error } = await adminRpc('admin_upsert_ship_clock_plan_day', {
    p_day_number: dayNumber,
    p_delta_minutes: deltaMinutes,
    p_enabled: enabled,
  })
  if (error) throw new AdminClockError(error.message, 'rpc')
  return fetchAdminClockDiagnostics()
}

export async function savePlanDays(
  days: Array<{ day_number: number; delta_minutes: PlanDeltaChoice; enabled: boolean }>,
): Promise<AdminClockDiagnostics> {
  for (const day of days) {
    const { error } = await adminRpc('admin_upsert_ship_clock_plan_day', {
      p_day_number: day.day_number,
      p_delta_minutes: day.delta_minutes,
      p_enabled: day.enabled,
    })
    if (error) throw new AdminClockError(error.message, 'rpc')
  }
  return fetchAdminClockDiagnostics()
}
