<script setup lang="ts">
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAchievementCelebrationStore } from '@/stores/achievementCelebration'
import type { GameId } from '@/types/game'
import { copy, formatCopy } from '@/ui/copy'

const props = defineProps<{
  game: GameId
}>()

const router = useRouter()
const celebration = useAchievementCelebrationStore()
const { open, visibleCards, loading } = storeToRefs(celebration)

const title = computed(() => {
  const n = visibleCards.value.length
  if (n <= 1) return copy.achievements.unlockTitleSingular
  return formatCopy(copy.achievements.unlockTitlePlural, { count: n })
})

const cta = computed(() =>
  visibleCards.value.length <= 1
    ? copy.achievements.unlockSeeIt
    : copy.achievements.unlockSeeThem,
)

const myRoute = computed(() =>
  props.game === 'drinkit' ? 'drinkit-achievements' : 'shipit-achievements',
)

async function tryPresent() {
  if (celebration.pending?.game !== props.game) return
  await celebration.presentIfPending()
}

function onDismiss() {
  celebration.dismiss()
}

function onSeeThem() {
  celebration.dismiss()
  void router.push({ name: myRoute.value, query: { view: 'mine' } })
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') onDismiss()
}

onMounted(() => {
  void tryPresent()
  window.addEventListener('keydown', onKeydown)
})

watch(
  () => celebration.pending,
  () => {
    void tryPresent()
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && !loading"
      class="achievement-unlock-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="achievement-unlock-title"
      data-testid="achievement-unlock-popup"
    >
      <button
        type="button"
        class="achievement-unlock-backdrop"
        :aria-label="copy.achievements.unlockClose"
        data-testid="achievement-unlock-backdrop"
        @click="onDismiss"
      />
      <div class="achievement-unlock-card" data-testid="achievement-unlock-card">
        <button
          type="button"
          class="achievement-unlock-close"
          :aria-label="copy.achievements.unlockClose"
          data-testid="achievement-unlock-close"
          @click="onDismiss"
        >
          ×
        </button>
        <p
          id="achievement-unlock-title"
          class="font-display text-center text-2xl font-bold"
          style="color: var(--theme-ink)"
          data-testid="achievement-unlock-title"
        >
          {{ title }}
        </p>
        <ul class="mt-4 space-y-3" data-testid="achievement-unlock-list">
          <li
            v-for="card in visibleCards"
            :key="card.award_id ?? card.definition_id"
            class="achievement-unlock-item"
            data-testid="achievement-unlock-item"
          >
            <span
              class="achievement-unlock-icon"
              aria-hidden="true"
              data-testid="achievement-unlock-icon"
            >★</span>
            <div class="min-w-0 flex-1">
              <p class="font-display text-lg font-bold" style="color: var(--theme-ink)">
                {{ card.title }}
              </p>
              <p class="mt-0.5 text-sm" style="color: var(--theme-muted)">
                {{ card.description }}
              </p>
              <p
                class="mt-1 text-xs font-semibold uppercase tracking-wide"
                style="color: var(--theme-primary)"
              >
                {{ card.game === 'drinkit' ? 'Drink It!' : 'Ship It!' }}
              </p>
            </div>
          </li>
        </ul>
        <button
          type="button"
          class="achievement-unlock-cta mt-5 w-full rounded-full py-3 text-sm font-semibold text-white"
          style="background: var(--theme-primary)"
          data-testid="achievement-unlock-cta"
          @click="onSeeThem"
        >
          {{ cta }}
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.achievement-unlock-root {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1rem;
  padding-bottom: max(1rem, env(safe-area-inset-bottom));
}

.achievement-unlock-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  margin: 0;
  padding: 0;
  background: color-mix(in srgb, var(--theme-ink) 45%, transparent);
  cursor: pointer;
}

.achievement-unlock-card {
  position: relative;
  z-index: 1;
  width: min(100%, 22rem);
  max-height: min(80vh, 36rem);
  overflow: auto;
  border-radius: 1.25rem;
  padding: 1.25rem 1.25rem 1.5rem;
  background: var(--theme-surface, #fff);
  box-shadow: 0 16px 40px color-mix(in srgb, var(--theme-ink) 25%, transparent);
  animation: achievement-unlock-enter 280ms ease-out;
}

.achievement-unlock-close {
  position: absolute;
  top: 0.5rem;
  right: 0.75rem;
  border: 0;
  background: transparent;
  font-size: 1.5rem;
  line-height: 1;
  color: var(--theme-muted);
  cursor: pointer;
  padding: 0.25rem 0.4rem;
}

.achievement-unlock-item {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  text-align: left;
}

.achievement-unlock-icon {
  flex-shrink: 0;
  width: 2.25rem;
  height: 2.25rem;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-primary) 18%, transparent);
  color: var(--theme-primary);
  font-size: 1.1rem;
}

.achievement-unlock-cta {
  min-height: 2.75rem;
}

@keyframes achievement-unlock-enter {
  from {
    opacity: 0;
    transform: translateY(0.75rem) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .achievement-unlock-card {
    animation: none;
  }
}
</style>
