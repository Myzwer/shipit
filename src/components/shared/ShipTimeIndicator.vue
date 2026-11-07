<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { formatShipTimeOfDay } from '@/lib/shipClockFormat'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { copy } from '@/ui/copy'

const awardsMode = useAwardsModeStore()
const { status, displayShipLocal, state, errorMessage } = storeToRefs(awardsMode)

onMounted(() => {
  awardsMode.ensureStarted()
})
</script>

<template>
  <p
    class="px-4 py-2 text-center text-[0.7rem] font-semibold tracking-[0.08em]"
    style="color: var(--theme-muted); background: color-mix(in srgb, var(--theme-page) 70%, transparent)"
    :data-clock-status="status"
    :data-awards-mode="awardsMode.isAwardsMode ? 'true' : 'false'"
    data-testid="ship-time-indicator"
  >
    <template v-if="status === 'ready' && displayShipLocal">
      <span class="uppercase opacity-70">{{ copy.shipTime.label }}</span>
      <span class="mx-1.5 opacity-40">·</span>
      <span class="tabular-nums" style="color: var(--theme-ink)">{{
        formatShipTimeOfDay(displayShipLocal)
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
