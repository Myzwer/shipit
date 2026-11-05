/**
 * Home bounty sync: presentation ticking + authoritative server refresh.
 *
 * Refresh strategy (Phase 2D-B2):
 * - Single-flight: at most one network fetch in progress.
 * - Coalesce: focus/visibility/interval/boundary while in-flight queue one follow-up
 *   so a slot boundary is never dropped because an older request is still running.
 * - Generation: stop() invalidates in-flight apply; queued work after stop is ignored.
 * - Device timezone never selects offers.
 */
import { fetchHomeBountySnapshot, HomeBountyError } from '@/lib/bounty/fetchHomeBounties'
import { mapHomeBountyCards, nextRefreshBoundaryUtc } from '@/lib/bounty/mapHomeCards'
import { remainingUntilUtc } from '@/lib/bounty/formatCountdown'
import type {
  BarBountyPayload,
  CocktailBountyPayload,
  DailyChallengePayload,
  HomeBoardPhase,
  HomeBountyCardView,
  HomeBountyFetchStatus,
  IngredientBountyPayload,
} from '@/types/bountyHome'
import type { ShipClockState } from '@/types/shipClock'

export interface HomeBountySyncSnapshot {
  status: HomeBountyFetchStatus
  phase: HomeBoardPhase
  cards: HomeBountyCardView[]
  cocktail: CocktailBountyPayload | null
  ingredient: IngredientBountyPayload | null
  bar: BarBountyPayload | null
  daily: DailyChallengePayload | null
  clock: ShipClockState | null
  cruiseDay: number | null
  fetchedAtMs: number | null
  errorMessage: string | null
  /** Monotonic generation — useful for tests. */
  generation: number
  /** True while a network refresh is in flight. */
  inFlight: boolean
}

export type HomeBountySyncListener = (snap: HomeBountySyncSnapshot) => void

export function createHomeBountySync(options?: {
  /** Visual tick interval; 0 disables. */
  tickMs?: number
  /** Background refresh interval; keep modest for cruise Wi-Fi. */
  refreshMs?: number
  /** Injected fetch for unit tests. */
  fetchSnapshot?: typeof fetchHomeBountySnapshot
  /** Injected now for deterministic tests. */
  now?: () => number
}) {
  const tickMs = options?.tickMs ?? 1000
  const refreshMs = options?.refreshMs ?? 60_000
  const fetchSnapshot = options?.fetchSnapshot ?? fetchHomeBountySnapshot
  const nowFn = options?.now ?? Date.now

  let status: HomeBountyFetchStatus = 'idle'
  let cocktail: CocktailBountyPayload | null = null
  let ingredient: IngredientBountyPayload | null = null
  let bar: BarBountyPayload | null = null
  let daily: DailyChallengePayload | null = null
  let clock: ShipClockState | null = null
  let cruiseDay: number | null = null
  let fetchedAtMs: number | null = null
  let errorMessage: string | null = null
  let generation = 0
  let inFlight = false
  let queuedReason: string | null = null
  let stopped = false
  let tickTimer: ReturnType<typeof setInterval> | null = null
  let refreshTimer: ReturnType<typeof setInterval> | null = null
  let boundaryTimer: ReturnType<typeof setTimeout> | null = null
  let lastOffsetMinutes: number | null = null
  let lastConfigId: string | null = null
  const listeners = new Set<HomeBountySyncListener>()

  function buildCards(nowMs = nowFn()) {
    return mapHomeBountyCards({
      cocktail,
      ingredient,
      bar,
      daily,
      clock,
      fetchStatus: status === 'idle' ? 'loading' : status,
      fetchedAtMs,
      nowMs,
    })
  }

  function emit() {
    const { phase, cards } = buildCards()
    const payload: HomeBountySyncSnapshot = {
      status,
      phase,
      cards,
      cocktail,
      ingredient,
      bar,
      daily,
      clock,
      cruiseDay,
      fetchedAtMs,
      errorMessage,
      generation,
      inFlight,
    }
    for (const fn of listeners) fn(payload)
  }

  function clearBoundaryTimer() {
    if (boundaryTimer) {
      clearTimeout(boundaryTimer)
      boundaryTimer = null
    }
  }

  function scheduleBoundaryRefresh() {
    clearBoundaryTimer()
    if (!clock?.at_utc || fetchedAtMs == null) return
    const { phase } = buildCards()
    const boundary = nextRefreshBoundaryUtc({
      cocktail,
      ingredient,
      bar,
      daily,
      clock,
      phase,
    })
    if (!boundary) return
    const remaining = remainingUntilUtc(boundary, clock.at_utc, fetchedAtMs, nowFn())
    const delay = Math.max(250, Math.min(remaining + 400, 60 * 60_000))
    boundaryTimer = setTimeout(() => {
      void refresh('boundary')
    }, delay)
  }

  function clockAdjusted(next: ShipClockState): boolean {
    if (lastOffsetMinutes != null && next.offset_minutes != null) {
      if (next.offset_minutes !== lastOffsetMinutes) return true
    }
    if (lastConfigId && next.config_id && lastConfigId !== next.config_id) return true
    return false
  }

  async function refresh(reason: string = 'manual') {
    if (stopped) return

    if (inFlight) {
      // Coalesce: keep the latest reason so a boundary after focus is not lost.
      queuedReason = reason
      return
    }

    inFlight = true
    const myGen = ++generation
    queuedReason = null

    if (status === 'idle' || status === 'loading') {
      status = 'loading'
      emit()
    } else {
      emit() // surface inFlight
    }

    try {
      const snap = await fetchSnapshot()
      if (stopped || myGen !== generation) return

      void (snap.clock ? clockAdjusted(snap.clock) : false)

      cocktail = snap.cocktail
      ingredient = snap.ingredient
      bar = snap.bar
      daily = snap.daily
      clock = snap.clock
      cruiseDay = snap.cruiseDay
      fetchedAtMs = snap.fetchedAtMs
      status = 'ready'
      errorMessage = null
      lastOffsetMinutes = snap.clock?.offset_minutes ?? lastOffsetMinutes
      lastConfigId = snap.clock?.config_id ?? lastConfigId
      emit()
      scheduleBoundaryRefresh()
    } catch (err) {
      if (stopped || myGen !== generation) return

      cocktail = null
      ingredient = null
      bar = null
      daily = null
      cruiseDay = null
      if (err instanceof HomeBountyError && err.code === 'not_configured') {
        status = 'unavailable'
        clock = { configured: false, at_utc: new Date().toISOString(), error: err.message }
        errorMessage = 'Ship Clock is not configured yet.'
      } else if (err instanceof HomeBountyError && err.code === 'unavailable') {
        status = 'unavailable'
        errorMessage = err.message
      } else if (err instanceof HomeBountyError && err.code === 'inconsistent') {
        status = 'error'
        errorMessage = err.message
        // One immediate retry is handled by queueing below if requested.
      } else {
        status = 'error'
        errorMessage =
          err instanceof Error ? err.message : 'Could not load current bounty information.'
      }
      fetchedAtMs = null
      clearBoundaryTimer()
      emit()
    } finally {
      inFlight = false
      if (!stopped) emit()
      if (!stopped && queuedReason) {
        const next = queuedReason
        queuedReason = null
        void refresh(next)
      }
    }
  }

  function onVisibility() {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void refresh('foreground')
    }
  }

  function onFocus() {
    void refresh('focus')
  }

  function start() {
    stopped = false
    void refresh('start')
    if (tickMs > 0 && !tickTimer) {
      tickTimer = setInterval(() => {
        if (status === 'ready') emit()
      }, tickMs)
    }
    if (refreshMs > 0 && !refreshTimer) {
      refreshTimer = setInterval(() => {
        void refresh('interval')
      }, refreshMs)
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibility)
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('focus', onFocus)
    }
  }

  function stop() {
    stopped = true
    queuedReason = null
    if (tickTimer) clearInterval(tickTimer)
    if (refreshTimer) clearInterval(refreshTimer)
    clearBoundaryTimer()
    tickTimer = null
    refreshTimer = null
    generation += 1
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibility)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('focus', onFocus)
    }
  }

  function subscribe(fn: HomeBountySyncListener) {
    listeners.add(fn)
    const { phase, cards } = buildCards()
    fn({
      status,
      phase,
      cards,
      cocktail,
      ingredient,
      bar,
      daily,
      clock,
      cruiseDay,
      fetchedAtMs,
      errorMessage,
      generation,
      inFlight,
    })
    return () => listeners.delete(fn)
  }

  return {
    start,
    stop,
    refresh: () => refresh('manual'),
    subscribe,
    getSnapshot: (): HomeBountySyncSnapshot => {
      const { phase, cards } = buildCards()
      return {
        status,
        phase,
        cards,
        cocktail,
        ingredient,
        bar,
        daily,
        clock,
        cruiseDay,
        fetchedAtMs,
        errorMessage,
        generation,
        inFlight,
      }
    },
  }
}
