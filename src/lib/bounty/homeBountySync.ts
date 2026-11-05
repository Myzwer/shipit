/**
 * Home bounty sync: presentation ticking + authoritative server refresh.
 * Device timezone never selects offers. Stale responses cannot overwrite newer state.
 */
import { fetchHomeBountySnapshot, HomeBountyError } from '@/lib/bounty/fetchHomeBounties'
import { mapHomeBountyCards, nextRefreshBoundaryUtc } from '@/lib/bounty/mapHomeCards'
import { remainingUntilUtc } from '@/lib/bounty/formatCountdown'
import type {
  CocktailBountyPayload,
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
  clock: ShipClockState | null
  fetchedAtMs: number | null
  errorMessage: string | null
  /** Monotonic generation — useful for tests. */
  generation: number
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
  let clock: ShipClockState | null = null
  let fetchedAtMs: number | null = null
  let errorMessage: string | null = null
  let generation = 0
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
      clock,
      fetchedAtMs,
      errorMessage,
      generation,
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
    const boundary = nextRefreshBoundaryUtc({ cocktail, ingredient, clock, phase })
    if (!boundary) return
    const remaining = remainingUntilUtc(boundary, clock.at_utc, fetchedAtMs, nowFn())
    // Refresh slightly after the boundary so the server has crossed it.
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

  async function refresh(_reason: string = 'manual') {
    const myGen = ++generation

    if (status === 'idle' || status === 'loading') {
      status = 'loading'
      emit()
    }

    try {
      const snap = await fetchSnapshot()
      if (myGen !== generation) {
        // Newer refresh supersedes this response — do not apply.
        return
      }

      const adjusted = snap.clock ? clockAdjusted(snap.clock) : false

      cocktail = snap.cocktail
      ingredient = snap.ingredient
      clock = snap.clock
      fetchedAtMs = snap.fetchedAtMs
      status = 'ready'
      errorMessage = null
      lastOffsetMinutes = snap.clock?.offset_minutes ?? lastOffsetMinutes
      lastConfigId = snap.clock?.config_id ?? lastConfigId
      emit()
      scheduleBoundaryRefresh()
      // Offset/config change already reflected in this snapshot; flag retained for tests/diagnostics.
      void adjusted
    } catch (err) {
      if (myGen !== generation) return

      // Do not present a prior offer as definitely current after a failed refresh.
      cocktail = null
      ingredient = null
      if (err instanceof HomeBountyError && err.code === 'not_configured') {
        status = 'unavailable'
        clock = { configured: false, at_utc: new Date().toISOString(), error: err.message }
        errorMessage = 'Ship Clock is not configured yet.'
      } else if (err instanceof HomeBountyError && err.code === 'unavailable') {
        status = 'unavailable'
        errorMessage = err.message
      } else {
        status = 'error'
        errorMessage =
          err instanceof Error ? err.message : 'Could not load current bounty information.'
      }
      fetchedAtMs = null
      clearBoundaryTimer()
      emit()
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
    if (tickTimer) clearInterval(tickTimer)
    if (refreshTimer) clearInterval(refreshTimer)
    clearBoundaryTimer()
    tickTimer = null
    refreshTimer = null
    // Invalidate any in-flight apply.
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
      clock,
      fetchedAtMs,
      errorMessage,
      generation,
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
        clock,
        fetchedAtMs,
        errorMessage,
        generation,
      }
    },
  }
}
