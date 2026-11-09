<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import { resolveAchievementIconKey } from '@/lib/achievements/icons'
import { formatShipEarnedBadge } from '@/lib/shipClockFormat'
import type { AchievementCard } from '@/types/achievements'
import { copy, formatCopy } from '@/ui/copy'
import type { SemanticIconKey } from '@/ui/icons'

const props = defineProps<{
  card: AchievementCard
}>()

const isEarned = computed(() => props.card.earned)
const isSecretLocked = computed(() => props.card.secret && !props.card.earned)
const isClaimedOther = computed(
  () =>
    !props.card.earned &&
    props.card.exclusive_claimed &&
    !!props.card.exclusive_owner_name,
)
const isExclusiveAvailable = computed(
  () => props.card.exclusive && !props.card.earned && !props.card.exclusive_claimed,
)

const iconResolution = computed(() =>
  resolveAchievementIconKey(props.card.icon_key, {
    masked: isSecretLocked.value,
  }),
)

const iconName = computed<SemanticIconKey | null>(() =>
  iconResolution.value.ok ? iconResolution.value.icon_key : null,
)

const earnedBadge = computed(() => {
  const shipLocal = props.card.awarded_at_ship_local
  if (!shipLocal) return null
  return formatShipEarnedBadge(shipLocal)
})

const progress = computed(() => {
  if (props.card.earned || isSecretLocked.value) return null
  const p = props.card.progress
  if (!p || p.target <= 0) return null
  // One-event achievements shouldn't invent a partial bar when current is 0/1 with no increment.
  if (p.target === 1 && p.current === 0) return null
  return p
})

const progressPct = computed(() => {
  if (!progress.value) return 0
  return Math.min(100, Math.round((progress.value.current / progress.value.target) * 100))
})
</script>

<template>
  <article
    class="achievement-card overflow-hidden rounded-2xl"
    :class="{
      'achievement-card--earned': isEarned,
      'achievement-card--locked': !isEarned && !isClaimedOther,
      'achievement-card--claimed-other': isClaimedOther,
    }"
    data-testid="achievement-card"
    :data-stable-key="card.stable_key"
    :data-earned="card.earned"
    :data-masked="card.masked"
    :data-exclusive="card.exclusive"
    :data-secret="card.secret"
  >
    <div class="flex min-h-[4.75rem]">
      <div
        class="achievement-card__rail flex w-[4.25rem] shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <AppIcon
          v-if="isEarned && iconName"
          :name="iconName"
          style-variant="solid"
          class="text-2xl text-white"
        />
        <AppIcon
          v-else
          name="status.locked"
          style-variant="solid"
          class="text-2xl"
          :class="isClaimedOther ? 'opacity-50' : ''"
          style="color: var(--theme-ink)"
        />
      </div>

      <div class="achievement-card__body relative flex min-w-0 flex-1 flex-col gap-1 px-3 py-2.5">
        <div class="flex items-start justify-between gap-2">
          <h3
            class="min-w-0 flex-1 text-[0.98rem] font-bold leading-snug"
            style="color: var(--theme-ink)"
          >
            {{ card.title }}
          </h3>

          <div class="shrink-0 pt-0.5">
            <p
              v-if="isEarned && earnedBadge"
              class="inline-flex max-w-[9.5rem] items-start gap-1 text-[0.62rem] font-bold uppercase leading-tight tracking-wide"
              style="color: var(--theme-primary)"
              data-testid="achievement-earned-badge"
            >
              <AppIcon name="status.completed" style-variant="solid" class="mt-0.5 text-[0.7rem]" />
              <span>{{ earnedBadge }}</span>
            </p>
            <p
              v-else-if="isEarned"
              class="inline-flex items-center gap-1 text-[0.62rem] font-bold uppercase tracking-wide"
              style="color: var(--theme-primary)"
              data-testid="achievement-earned-badge"
            >
              <AppIcon name="status.completed" style-variant="solid" class="text-[0.7rem]" />
              <span>{{ copy.achievements.earned }}</span>
            </p>
            <span
              v-else-if="isExclusiveAvailable"
              class="achievement-card__pill rounded-full px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-white"
              data-testid="achievement-available-badge"
            >
              {{ copy.achievements.available }}
            </span>
            <span
              v-else-if="isClaimedOther"
              class="achievement-card__pill rounded-full px-2 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide text-white"
              data-testid="achievement-claimed-badge"
            >
              {{
                formatCopy(copy.achievements.claimedBy, {
                  name: card.exclusive_owner_name || '',
                })
              }}
            </span>
            <div
              v-else-if="progress"
              class="flex min-w-[3.25rem] flex-col items-end gap-0.5"
              data-testid="achievement-progress"
            >
              <span
                class="text-[0.7rem] font-bold tabular-nums"
                style="color: var(--theme-ink)"
              >
                {{
                  formatCopy(copy.achievements.progress, {
                    current: progress.current,
                    target: progress.target,
                  })
                }}
              </span>
              <div
                class="h-1.5 w-12 overflow-hidden rounded-full"
                style="background: rgba(7, 108, 128, 0.18)"
              >
                <div
                  class="h-full rounded-full"
                  style="background: var(--theme-primary)"
                  :style="{ width: `${progressPct}%` }"
                />
              </div>
            </div>
          </div>
        </div>

        <p class="text-sm leading-snug opacity-80" style="color: var(--theme-ink)">
          {{
            isSecretLocked
              ? copy.achievements.secretLabel
              : card.description
          }}
        </p>
      </div>
    </div>
  </article>
</template>

<style scoped>
.achievement-card {
  box-shadow: var(--theme-card-shadow, var(--shadow-card));
  background: var(--theme-gradient-cool);
  color: var(--theme-ink);
}

.achievement-card__rail {
  background: transparent;
  color: var(--theme-ink);
}

.achievement-card--earned .achievement-card__rail {
  background: var(--theme-accent);
}

.achievement-card--claimed-other {
  opacity: 0.55;
  filter: grayscale(0.35);
}

.achievement-card__pill {
  background: var(--theme-accent);
}
</style>
