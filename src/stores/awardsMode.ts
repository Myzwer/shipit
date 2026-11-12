/**
 * Shared Awards Mode signal from authoritative Ship Clock.
 * Navigation and mid-form cutoff watch this — never the device clock.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createShipClockSync } from '@/lib/shipClock'
import type { ClockFetchStatus, ShipClockState } from '@/types/shipClock'

export const useAwardsModeStore = defineStore('awardsMode', () => {
  const status = ref<ClockFetchStatus>('idle')
  const state = ref<ShipClockState | null>(null)
  const displayShipLocal = ref<string | null>(null)
  const fetchedAtMs = ref<number | null>(null)
  const errorMessage = ref<string | null>(null)
  const started = ref(false)

  /** Faster than Home bounty poll so open sessions notice Friday 6 PM promptly. */
  const sync = createShipClockSync({ tickMs: 1000, refreshMs: 15_000 })
  let unsubscribe: (() => void) | null = null

  const isAwardsMode = computed(() => {
    const s = state.value
    if (!s?.configured) return false
    return Boolean(s.finalized) || s.lifecycle === 'final'
  })

  /** Pre-cruise welcome gate — server lifecycle only, never device time. */
  const isPreCruise = computed(() => state.value?.lifecycle === 'pre_cruise')

  const acceptingSubmissions = computed(() => {
    if (isAwardsMode.value) return false
    return sAccepting(state.value)
  })

  function sAccepting(s: ShipClockState | null) {
    return Boolean(s?.accepting_submissions)
  }

  function ensureStarted() {
    if (started.value) return
    started.value = true
    unsubscribe = sync.subscribe((snap) => {
      status.value = snap.status
      state.value = snap.state
      displayShipLocal.value = snap.displayShipLocal
      fetchedAtMs.value = snap.fetchedAtMs
      errorMessage.value = snap.errorMessage
    })
    sync.start()
  }

  function stop() {
    unsubscribe?.()
    unsubscribe = null
    sync.stop()
    started.value = false
  }

  async function refresh() {
    ensureStarted()
    await sync.refresh()
  }

  function homePathForGame(game: 'drinkit' | 'shipit') {
    if (isAwardsMode.value) {
      return game === 'drinkit' ? '/drinkit/wrapped' : '/shipit/wrapped'
    }
    return game === 'drinkit' ? '/drinkit' : '/shipit'
  }

  return {
    status,
    state,
    displayShipLocal,
    fetchedAtMs,
    errorMessage,
    isAwardsMode,
    isPreCruise,
    acceptingSubmissions,
    ensureStarted,
    stop,
    refresh,
    homePathForGame,
  }
})
