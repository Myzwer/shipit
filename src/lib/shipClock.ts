/**
 * Authoritative Ship Clock client. Snapshot from server; local tick is visual only.
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { advanceShipLocal } from '@/lib/shipClockFormat'
import type { ClockFetchStatus, ShipClockState } from '@/types/shipClock'

export class ShipClockError extends Error {
  code: 'unavailable' | 'error' | 'not_configured'

  constructor(message: string, code: 'unavailable' | 'error' | 'not_configured' = 'error') {
    super(message)
    this.name = 'ShipClockError'
    this.code = code
  }
}

export async function fetchShipClockState(): Promise<ShipClockState> {
  if (!isSupabaseConfigured || !supabase) {
    throw new ShipClockError('Supabase is not configured.', 'unavailable')
  }
  const { data, error } = await supabase.rpc('get_ship_clock_state')
  if (error) throw new ShipClockError(error.message, 'error')
  const state = data as ShipClockState
  if (!state?.configured) {
    throw new ShipClockError(state?.error ?? 'NO_ACTIVE_CRUISE_CONFIG', 'not_configured')
  }
  return state
}

export type ShipClockSyncListener = (snapshot: {
  status: ClockFetchStatus
  state: ShipClockState | null
  displayShipLocal: string | null
  fetchedAtMs: number | null
  errorMessage: string | null
}) => void

/**
 * Holds one server snapshot and optionally advances display ship-local between syncs.
 * Phone timezone never feeds eligibility — only the last server snapshot does.
 */
export function createShipClockSync(options?: {
  /** Visual tick interval; 0 disables ticking. */
  tickMs?: number
  /** Server refresh interval; 0 disables auto-refresh. */
  refreshMs?: number
}) {
  const tickMs = options?.tickMs ?? 1000
  const refreshMs = options?.refreshMs ?? 30_000

  let status: ClockFetchStatus = 'idle'
  let state: ShipClockState | null = null
  let fetchedAtMs: number | null = null
  let errorMessage: string | null = null
  let displayShipLocal: string | null = null
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let refreshTimer: ReturnType<typeof setInterval> | null = null
  const listeners = new Set<ShipClockSyncListener>()

  function emit() {
    const payload = { status, state, displayShipLocal, fetchedAtMs, errorMessage }
    for (const fn of listeners) fn(payload)
  }

  function recomputeDisplay(now = Date.now()) {
    if (!state?.ship_local || fetchedAtMs == null) {
      displayShipLocal = state?.ship_local ?? null
      return
    }
    displayShipLocal = advanceShipLocal(state.ship_local, now - fetchedAtMs)
  }

  async function refresh() {
    status = state ? 'ready' : 'loading'
    errorMessage = null
    emit()
    try {
      const next = await fetchShipClockState()
      state = next
      fetchedAtMs = Date.now()
      status = 'ready'
      errorMessage = null
      recomputeDisplay(fetchedAtMs)
    } catch (err) {
      if (err instanceof ShipClockError && err.code === 'not_configured') {
        status = 'unavailable'
        state = { configured: false, at_utc: new Date().toISOString(), error: err.message }
        displayShipLocal = null
        fetchedAtMs = null
        errorMessage = 'Ship Clock is not configured yet.'
      } else if (err instanceof ShipClockError && err.code === 'unavailable') {
        status = 'unavailable'
        errorMessage = err.message
      } else {
        status = 'error'
        errorMessage = err instanceof Error ? err.message : 'Ship Clock unavailable.'
      }
    }
    emit()
  }

  function start() {
    void refresh()
    if (tickMs > 0 && !tickTimer) {
      tickTimer = setInterval(() => {
        if (status === 'ready') {
          recomputeDisplay()
          emit()
        }
      }, tickMs)
    }
    if (refreshMs > 0 && !refreshTimer) {
      refreshTimer = setInterval(() => {
        void refresh()
      }, refreshMs)
    }
  }

  function stop() {
    if (tickTimer) clearInterval(tickTimer)
    if (refreshTimer) clearInterval(refreshTimer)
    tickTimer = null
    refreshTimer = null
  }

  function subscribe(fn: ShipClockSyncListener) {
    listeners.add(fn)
    fn({ status, state, displayShipLocal, fetchedAtMs, errorMessage })
    return () => listeners.delete(fn)
  }

  return { start, stop, refresh, subscribe, getSnapshot: () => ({ status, state, displayShipLocal, fetchedAtMs, errorMessage }) }
}
