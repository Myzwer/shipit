<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  countdownPartsFromMs,
  padCountdownUnit,
} from '@/lib/precruise/countdownParts'
import { remainingUntilUtc } from '@/lib/bounty/formatCountdown'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { copy } from '@/ui/copy'

const props = withDefaults(
  defineProps<{
    /** Server UTC open instant. Defaults to shared cruise open. */
    opensAtUtc?: string | null
    /** Compact layout for rules-page header. */
    compact?: boolean
    /** Homepage strip: denser than rules compact, still readable. */
    home?: boolean
    /** Light text/icons for solid game Home headers. */
    onHeader?: boolean
    /** Override the default “Game Begins:” label (homepage welcome). */
    label?: string | null
    testId?: string
  }>(),
  {
    opensAtUtc: null,
    compact: false,
    home: false,
    onHeader: false,
    label: null,
    testId: 'cruise-countdown',
  },
)

const awards = useAwardsModeStore()
const nowMs = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null
let refreshTimer: ReturnType<typeof setInterval> | null = null

const targetUtc = computed(
  () =>
    props.opensAtUtc ||
    awards.state?.cruise_opens_at_utc ||
    awards.state?.shipit_opens_at_utc ||
    awards.state?.drinkit_opens_at_utc ||
    null,
)

const remainingMs = computed(() => {
  const target = targetUtc.value
  const serverAt = awards.state?.at_utc
  const fetchedAt = awards.fetchedAtMs
  if (!target || !serverAt || fetchedAt == null) return null
  return remainingUntilUtc(target, serverAt, fetchedAt, nowMs.value)
})

const parts = computed(() => {
  if (remainingMs.value == null) return null
  return countdownPartsFromMs(remainingMs.value)
})

const showOpeningSoon = computed(() => {
  if (!awards.isPreCruise) return false
  if (parts.value == null) return false
  return parts.value.expired
})

const labelText = computed(() => props.label?.trim() || copy.precruise.gameBegins)

const units = computed(() => {
  if (!parts.value || showOpeningSoon.value) return []
  return [
    { key: 'days', label: copy.precruise.days, value: parts.value.days },
    { key: 'hours', label: copy.precruise.hours, value: parts.value.hours },
    { key: 'minutes', label: copy.precruise.minutes, value: parts.value.minutes },
    { key: 'seconds', label: copy.precruise.seconds, value: parts.value.seconds },
  ]
})

onMounted(() => {
  awards.ensureStarted()
  void awards.refresh()
  tickTimer = setInterval(() => {
    nowMs.value = Date.now()
  }, 250)
})

onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer)
  if (refreshTimer) clearInterval(refreshTimer)
})

watch(
  showOpeningSoon,
  (soon) => {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
    if (soon) {
      void awards.refresh()
      refreshTimer = setInterval(() => {
        void awards.refresh()
      }, 5_000)
    }
  },
  { immediate: true },
)
</script>

<template>
  <div
    class="cruise-countdown"
    :class="{
      'cruise-countdown--compact': compact && !home,
      'cruise-countdown--hero': !compact && !home,
      'cruise-countdown--home': home,
      'cruise-countdown--on-header': onHeader,
    }"
    :data-testid="testId"
    role="timer"
    :aria-live="showOpeningSoon ? 'polite' : 'off'"
  >
    <p class="cruise-countdown__label">{{ labelText }}</p>

    <p
      v-if="showOpeningSoon"
      class="cruise-countdown__opening"
      data-testid="countdown-opening-soon"
    >
      {{ copy.precruise.openingSoon }}
    </p>

    <div
      v-else-if="units.length"
      class="cruise-countdown__grid"
      data-testid="countdown-units"
    >
      <div
        v-for="unit in units"
        :key="unit.key"
        class="cruise-countdown__unit"
        :data-testid="`countdown-${unit.key}`"
      >
        <span class="cruise-countdown__value">{{
          unit.key === 'days' ? unit.value : padCountdownUnit(unit.value)
        }}</span>
        <span class="cruise-countdown__unit-label">{{ unit.label }}</span>
      </div>
    </div>

    <p
      v-else
      class="cruise-countdown__loading"
      data-testid="countdown-loading"
    >
      {{ copy.precruise.countdownLoading }}
    </p>
  </div>
</template>

<style scoped>
.cruise-countdown {
  text-align: center;
  color: #1f2933;
}

.cruise-countdown__label {
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: 0.01em;
  line-height: 1.25;
  max-width: 20rem;
  margin-inline: auto;
}

.cruise-countdown--hero .cruise-countdown__label {
  font-size: 1.15rem;
  margin-bottom: 0.65rem;
}

.cruise-countdown--compact .cruise-countdown__label {
  font-size: 0.95rem;
  margin-bottom: 0.4rem;
}

.cruise-countdown--home .cruise-countdown__label {
  font-size: 0.92rem;
  font-weight: 600;
  margin-bottom: 0.35rem;
  max-width: 18.5rem;
}

.cruise-countdown__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.35rem 0.5rem;
  max-width: 22rem;
  margin-inline: auto;
}

.cruise-countdown--hero .cruise-countdown__grid {
  gap: 0.5rem 0.65rem;
  max-width: 24rem;
}

.cruise-countdown--home .cruise-countdown__grid {
  gap: 0.15rem 0.75rem;
  max-width: 17.5rem;
}

.cruise-countdown__unit {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}

.cruise-countdown__value {
  font-family: var(--font-display);
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
}

.cruise-countdown--hero .cruise-countdown__value {
  font-size: clamp(1.85rem, 9vw, 2.75rem);
}

.cruise-countdown--compact .cruise-countdown__value {
  font-size: clamp(1.35rem, 7vw, 1.85rem);
}

.cruise-countdown--home .cruise-countdown__value {
  font-size: clamp(1.45rem, 6.5vw, 1.85rem);
}

.cruise-countdown__unit-label {
  margin-top: 0.2rem;
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
  color: #4b5563;
}

.cruise-countdown--hero .cruise-countdown__unit-label,
.cruise-countdown--compact .cruise-countdown__unit-label {
  margin-top: 0.3rem;
  font-size: 0.7rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.cruise-countdown__opening {
  font-family: var(--font-display);
  font-weight: 800;
  letter-spacing: 0.03em;
}

.cruise-countdown--hero .cruise-countdown__opening {
  font-size: clamp(1.5rem, 7vw, 2.1rem);
}

.cruise-countdown--compact .cruise-countdown__opening,
.cruise-countdown--home .cruise-countdown__opening {
  font-size: 1.15rem;
}

.cruise-countdown__loading {
  font-size: 0.9rem;
  font-weight: 600;
  color: #4b5563;
}

.cruise-countdown--on-header {
  color: #ffffff;
}

.cruise-countdown--on-header .cruise-countdown__label {
  color: #ffffff;
}

.cruise-countdown--on-header .cruise-countdown__unit-label,
.cruise-countdown--on-header .cruise-countdown__loading {
  color: rgba(255, 255, 255, 0.82);
}

.cruise-countdown--on-header .cruise-countdown__opening,
.cruise-countdown--on-header .cruise-countdown__value {
  color: #ffffff;
}
</style>
