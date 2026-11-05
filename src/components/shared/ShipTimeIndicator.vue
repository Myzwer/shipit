<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { createShipClockSync } from '@/lib/shipClock'
import { formatShipTimeOfDay } from '@/lib/shipClockFormat'
import { copy } from '@/ui/copy'
import type { ClockFetchStatus, ShipClockState } from '@/types/shipClock'

const status = ref<ClockFetchStatus>('idle')
const displayLocal = ref<string | null>(null)
const state = ref<ShipClockState | null>(null)
const errorMessage = ref<string | null>(null)

const sync = createShipClockSync({ tickMs: 1000, refreshMs: 30_000 })
let unsubscribe: (() => void) | null = null

onMounted(() => {
  unsubscribe = sync.subscribe((snap) => {
    status.value = snap.status
    displayLocal.value = snap.displayShipLocal
    state.value = snap.state
    errorMessage.value = snap.errorMessage
  })
  sync.start()
})

onUnmounted(() => {
  unsubscribe?.()
  sync.stop()
})
</script>

<template>
  <p
    class="px-4 py-1.5 text-center text-xs font-medium tracking-wide"
    style="color: var(--theme-muted)"
    :data-clock-status="status"
  >
    <template v-if="status === 'ready' && displayLocal">
      <span class="uppercase opacity-70">{{ copy.shipTime.label }}</span>
      <span class="mx-1.5 opacity-40">·</span>
      <span class="tabular-nums" style="color: var(--theme-ink)">{{
        formatShipTimeOfDay(displayLocal)
      }}</span>
      <span v-if="state?.cruise_day" class="ml-1.5 opacity-70"
        >Day {{ state.cruise_day }}</span
      >
    </template>
    <template v-else-if="status === 'loading'">
      {{ copy.shipTime.label }}…
    </template>
    <template v-else-if="status === 'unavailable' || status === 'error'">
      {{ errorMessage || copy.shipTime.unavailable }}
    </template>
  </p>
</template>
