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
    class="px-4 py-1.5 text-center text-xs font-medium tracking-wide"
    style="color: var(--theme-muted)"
    :data-clock-status="status"
    :data-awards-mode="awardsMode.isAwardsMode ? 'true' : 'false'"
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
