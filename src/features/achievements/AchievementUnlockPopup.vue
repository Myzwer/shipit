<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import AppIcon from '@/components/shared/AppIcon.vue'
import { resolveAchievementIconKey } from '@/lib/achievements/icons'
import { useAchievementCelebrationStore } from '@/stores/achievementCelebration'
import type { GameId } from '@/types/game'
import { copy, formatCopy } from '@/ui/copy'
import type { SemanticIconKey } from '@/ui/icons'

const props = defineProps<{
  game: GameId
}>()

const router = useRouter()
const celebration = useAchievementCelebrationStore()
const { open, visibleCards, loading } = storeToRefs(celebration)

const cardEl = ref<HTMLElement | null>(null)
const ctaEl = ref<HTMLButtonElement | null>(null)
const previouslyFocused = ref<HTMLElement | null>(null)
/** Bumped only when the dialog opens so entrance/flourish play once per presentation. */
const celebrationEpoch = ref(0)
const prefersReducedMotion = ref(false)

const RAY_COUNT = 6

const isBatch = computed(() => visibleCards.value.length > 1)

const title = computed(() => {
  const n = visibleCards.value.length
  if (n <= 1) return copy.achievements.unlockTitleSingular
  return formatCopy(copy.achievements.unlockTitlePlural, { count: n })
})

const cta = computed(() =>
  visibleCards.value.length <= 1
    ? copy.achievements.unlockSeeIt
    : copy.achievements.unlockSeeAll,
)

const singleCard = computed(() =>
  visibleCards.value.length === 1 ? visibleCards.value[0] : null,
)

const singleIcon = computed<SemanticIconKey>(() => {
  const card = singleCard.value
  if (!card) return 'score.achievement'
  const resolved = resolveAchievementIconKey(card.icon_key, { masked: card.masked })
  return resolved.ok ? resolved.icon_key : 'score.achievement'
})

const themeClass = computed(() =>
  props.game === 'drinkit' ? 'theme-drink' : 'theme-ship',
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
  celebration.dismissForShowcase()
  void router.push({ name: myRoute.value, query: { view: 'mine' } })
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    onDismiss()
    return
  }
  if (e.key !== 'Tab' || !cardEl.value) return
  const focusable = cardEl.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

async function focusDialog() {
  await nextTick()
  ctaEl.value?.focus()
}

function syncReducedMotion() {
  prefersReducedMotion.value =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

let reducedMotionMq: MediaQueryList | null = null
function onReducedMotionChange() {
  syncReducedMotion()
}

onMounted(() => {
  syncReducedMotion()
  reducedMotionMq = window.matchMedia('(prefers-reduced-motion: reduce)')
  reducedMotionMq.addEventListener('change', onReducedMotionChange)
  void tryPresent()
  window.addEventListener('keydown', onKeydown)
})

watch(
  () => [celebration.pending, celebration.lastError] as const,
  () => {
    void tryPresent()
  },
)

watch(open, (isOpen) => {
  if (isOpen) {
    celebrationEpoch.value += 1
    previouslyFocused.value =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Focus immediately — do not wait for entrance motion.
    void focusDialog()
  } else if (previouslyFocused.value) {
    previouslyFocused.value.focus()
    previouslyFocused.value = null
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  reducedMotionMq?.removeEventListener('change', onReducedMotionChange)
  reducedMotionMq = null
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && !loading"
      class="achievement-unlock-root"
      :class="[themeClass, prefersReducedMotion ? 'is-reduced-motion' : 'is-celebrating']"
      role="dialog"
      aria-modal="true"
      aria-labelledby="achievement-unlock-title"
      data-testid="achievement-unlock-popup"
      :data-mode="isBatch ? 'batch' : 'single'"
      :data-reduced-motion="prefersReducedMotion ? '1' : '0'"
      :data-celebration-epoch="celebrationEpoch"
    >
      <button
        type="button"
        class="achievement-unlock-backdrop"
        :aria-label="copy.achievements.unlockClose"
        data-testid="achievement-unlock-backdrop"
        @click="onDismiss"
      />
      <div
        ref="cardEl"
        class="achievement-unlock-card"
        data-testid="achievement-unlock-card"
      >
        <button
          type="button"
          class="achievement-unlock-close"
          :aria-label="copy.achievements.unlockClose"
          data-testid="achievement-unlock-close"
          @click="onDismiss"
        >
          <AppIcon name="action.close" style-variant="solid" class="text-base" />
        </button>

        <div
          class="achievement-unlock-hero"
          data-testid="achievement-unlock-hero"
          aria-hidden="true"
        >
          <div class="achievement-unlock-hero-fx" data-testid="achievement-unlock-hero-fx">
            <span class="achievement-unlock-halo" />
            <span
              v-for="i in RAY_COUNT"
              :key="i"
              class="achievement-unlock-ray-wrap"
              :style="{ transform: `rotate(${(i - 1) * 60}deg)` }"
            >
              <span class="achievement-unlock-ray" />
            </span>
            <span class="achievement-unlock-spark achievement-unlock-spark--a" />
            <span class="achievement-unlock-spark achievement-unlock-spark--b" />
            <span class="achievement-unlock-spark achievement-unlock-spark--c" />
          </div>
          <AppIcon
            v-if="isBatch"
            name="status.selected"
            style-variant="solid"
            class="achievement-unlock-hero-icon"
            data-testid="achievement-unlock-batch-icon"
          />
          <AppIcon
            v-else
            :name="singleIcon"
            style-variant="solid"
            class="achievement-unlock-hero-icon"
            data-testid="achievement-unlock-icon"
            :data-icon-key="singleCard?.icon_key || ''"
          />
        </div>

        <p
          id="achievement-unlock-title"
          class="achievement-unlock-heading"
          data-testid="achievement-unlock-title"
        >
          {{ title }}
        </p>

        <template v-if="!isBatch && singleCard">
          <p
            class="achievement-unlock-name ui-display-name"
            data-testid="achievement-unlock-item"
            :data-award-id="singleCard.award_id ?? ''"
          >
            {{ singleCard.title }}
          </p>
          <p
            class="achievement-unlock-desc"
            data-testid="achievement-unlock-desc"
          >
            {{ singleCard.description }}
          </p>
        </template>

        <ul
          v-else
          class="achievement-unlock-list"
          data-testid="achievement-unlock-list"
        >
          <li
            v-for="card in visibleCards"
            :key="card.award_id ?? card.definition_id"
            class="achievement-unlock-list-item ui-display-name"
            data-testid="achievement-unlock-item"
            :data-award-id="card.award_id ?? ''"
          >
            {{ card.title }}
          </li>
        </ul>

        <button
          ref="ctaEl"
          type="button"
          class="achievement-unlock-cta"
          data-testid="achievement-unlock-cta"
          @click="onSeeThem"
        >
          <span>{{ cta }}</span>
          <AppIcon name="action.next" style-variant="solid" class="text-sm" />
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
  pointer-events: auto;
}

.achievement-unlock-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  margin: 0;
  padding: 0;
  background: color-mix(in srgb, var(--theme-ink, #1f2933) 48%, transparent);
  cursor: pointer;
}

.achievement-unlock-card {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(100%, 18.5rem);
  max-height: min(78vh, 32rem);
  border-radius: 1.35rem;
  padding: 1.35rem 1.2rem 1.15rem;
  background: var(--theme-surface, #d7f3f1);
  color: var(--theme-ink, #1f2933);
  box-shadow: 0 14px 36px color-mix(in srgb, var(--theme-ink, #1f2933) 28%, transparent);
  text-align: center;
  /* Allow the hero flourish to bloom slightly past the card edge without clipping. */
  overflow: visible;
}

.theme-ship .achievement-unlock-card {
  /* Soft Ship It! blue celebration surface (not cream warm card). */
  background: var(--theme-page-alt, #d7ebf7);
}

.achievement-unlock-close {
  position: absolute;
  top: 0.45rem;
  right: 0.45rem;
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--theme-muted, #5b6770);
  cursor: pointer;
  padding: 0;
  z-index: 2;
}

.achievement-unlock-close:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: 2px;
}

.achievement-unlock-hero {
  position: relative;
  display: grid;
  place-items: center;
  width: 4.25rem;
  height: 4.25rem;
  margin-bottom: 0.65rem;
  flex-shrink: 0;
  overflow: visible;
}

.achievement-unlock-hero-fx {
  position: absolute;
  inset: -1.4rem;
  pointer-events: none;
  overflow: visible;
}

.achievement-unlock-halo {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 3.35rem;
  height: 3.35rem;
  margin: -1.675rem 0 0 -1.675rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--theme-primary, #076c80) 34%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--theme-ink, #1f2933) 12%, transparent);
  opacity: 0;
  transform: scale(0.55);
}

/* Static rotate on the wrap; animate scaleY on the ray so keyframes stay reliable. */
.achievement-unlock-ray-wrap {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.22rem;
  height: 1.4rem;
  margin-left: -0.11rem;
  margin-top: -1.4rem;
  transform-origin: 50% 100%;
  pointer-events: none;
}

.achievement-unlock-ray {
  display: block;
  width: 100%;
  height: 100%;
  border-radius: 999px;
  /* Ink-forward so the burst reads on mint/soft-blue surfaces. */
  background: color-mix(in srgb, var(--theme-ink, #1f2933) 72%, var(--theme-primary, #076c80) 28%);
  transform-origin: 50% 100%;
  transform: scaleY(0.25);
  opacity: 0;
}

.achievement-unlock-spark {
  position: absolute;
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 0.05rem;
  background: color-mix(in srgb, var(--theme-ink, #1f2933) 58%, var(--theme-primary, #076c80) 42%);
  box-shadow: 0 0 0.4rem color-mix(in srgb, var(--theme-primary, #076c80) 40%, transparent);
  opacity: 0;
  transform: scale(0.4) rotate(20deg);
}

.achievement-unlock-spark--a {
  left: 12%;
  top: 18%;
}

.achievement-unlock-spark--b {
  right: 10%;
  top: 28%;
}

.achievement-unlock-spark--c {
  left: 22%;
  bottom: 14%;
}

.achievement-unlock-hero-icon {
  position: relative;
  z-index: 1;
  font-size: 2.65rem;
  line-height: 1;
  color: var(--theme-ink, #1f2933);
  transform-origin: 50% 55%;
}

.achievement-unlock-heading {
  margin: 0;
  font-family: var(--font-body, 'Figtree', ui-sans-serif, system-ui, sans-serif);
  font-size: 1.02rem;
  font-weight: 600;
  line-height: 1.25;
  color: var(--theme-ink, #1f2933);
}

.achievement-unlock-name {
  margin: 0.55rem 0 0;
  font-family: var(--font-display, 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif);
  font-size: 1.28rem;
  font-weight: 700;
  line-height: 1.2;
  color: var(--theme-ink, #1f2933);
}

.achievement-unlock-desc {
  margin: 0.4rem 0 0;
  font-size: 0.92rem;
  font-weight: 400;
  line-height: 1.35;
  color: var(--theme-ink, #1f2933);
  opacity: 0.88;
}

.achievement-unlock-list {
  margin: 0.7rem 0 0;
  padding: 0;
  width: 100%;
  list-style: none;
  overflow-y: auto;
  overscroll-behavior: contain;
  max-height: min(38vh, 14rem);
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  text-align: center;
}

.achievement-unlock-list-item {
  margin: 0;
  font-family: var(--font-display, 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif);
  font-size: 0.98rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--theme-ink, #1f2933);
}

.achievement-unlock-cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  margin-top: 1rem;
  width: 100%;
  min-height: 2.75rem;
  border: 0;
  border-radius: 9999px;
  padding: 0.7rem 1.25rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: #fff;
  background: var(--theme-primary, #076c80);
  cursor: pointer;
  flex-shrink: 0;
}

.achievement-unlock-cta:focus-visible {
  outline: 2px solid var(--theme-ink, #1f2933);
  outline-offset: 3px;
}

.achievement-unlock-cta:hover {
  background: var(--theme-primary-hover, #06596a);
}

/* ——— Celebration motion (once per open via :key / remount) ——— */

.is-celebrating .achievement-unlock-backdrop {
  animation: achievement-backdrop-in 180ms ease-out both;
}

.is-celebrating .achievement-unlock-card {
  /* ~300ms card entrance: 96% → slight overshoot → rest, rise ~10px */
  animation: achievement-card-in 300ms cubic-bezier(0.22, 1.35, 0.36, 1) both;
}

.is-celebrating .achievement-unlock-hero-icon {
  animation: achievement-icon-pop 560ms cubic-bezier(0.2, 1.4, 0.32, 1) 70ms both;
}

.is-celebrating[data-mode='batch'] .achievement-unlock-hero-icon {
  /* Slightly stronger ta-da for multi unlocks */
  animation-name: achievement-icon-pop-batch;
  animation-duration: 620ms;
}

.is-celebrating .achievement-unlock-halo {
  animation: achievement-halo 580ms ease-out 40ms both;
}

.is-celebrating .achievement-unlock-ray {
  animation: achievement-ray 600ms cubic-bezier(0.18, 0.9, 0.32, 1) 50ms both;
}

.is-celebrating[data-mode='batch'] .achievement-unlock-ray {
  animation-duration: 640ms;
}

.is-celebrating .achievement-unlock-spark--a {
  animation: achievement-spark 540ms ease-out 90ms both;
}

.is-celebrating .achievement-unlock-spark--b {
  animation: achievement-spark 560ms ease-out 120ms both;
}

.is-celebrating .achievement-unlock-spark--c {
  animation: achievement-spark 520ms ease-out 150ms both;
}

@keyframes achievement-backdrop-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes achievement-card-in {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.96);
  }
  72% {
    opacity: 1;
    transform: translateY(-1px) scale(1.015);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes achievement-icon-pop {
  0% {
    opacity: 0.55;
    transform: scale(0.72);
  }
  55% {
    opacity: 1;
    transform: scale(1.14);
  }
  78% {
    transform: scale(0.97);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes achievement-icon-pop-batch {
  0% {
    opacity: 0.5;
    transform: scale(0.68) rotate(-4deg);
  }
  52% {
    opacity: 1;
    transform: scale(1.2) rotate(3deg);
  }
  76% {
    transform: scale(0.96) rotate(-1deg);
  }
  100% {
    opacity: 1;
    transform: scale(1) rotate(0deg);
  }
}

@keyframes achievement-halo {
  0% {
    opacity: 0;
    transform: scale(0.45);
  }
  32% {
    opacity: 0.72;
  }
  100% {
    opacity: 0;
    transform: scale(1.6);
  }
}

@keyframes achievement-ray {
  0% {
    opacity: 0;
    transform: scaleY(0.2);
  }
  26% {
    opacity: 1;
    transform: scaleY(1);
  }
  100% {
    opacity: 0;
    transform: scaleY(1.14);
  }
}

@keyframes achievement-spark {
  0% {
    opacity: 0;
    transform: scale(0.35) rotate(18deg);
  }
  35% {
    opacity: 0.95;
    transform: scale(1) rotate(28deg);
  }
  100% {
    opacity: 0;
    transform: scale(0.55) rotate(40deg) translateY(-0.35rem);
  }
}

/* Reduced motion: instant presence or a tiny non-motion fade; no scale/burst. */
.is-reduced-motion .achievement-unlock-backdrop {
  animation: achievement-backdrop-in 120ms ease-out both;
}

.is-reduced-motion .achievement-unlock-card,
.is-reduced-motion .achievement-unlock-hero-icon,
.is-reduced-motion .achievement-unlock-halo,
.is-reduced-motion .achievement-unlock-ray,
.is-reduced-motion .achievement-unlock-spark {
  animation: none !important;
}

.is-reduced-motion .achievement-unlock-halo,
.is-reduced-motion .achievement-unlock-ray-wrap,
.is-reduced-motion .achievement-unlock-spark {
  opacity: 0;
  visibility: hidden;
}

@media (prefers-reduced-motion: reduce) {
  .achievement-unlock-root:not(.is-reduced-motion) .achievement-unlock-backdrop {
    animation: achievement-backdrop-in 120ms ease-out both;
  }

  .achievement-unlock-root:not(.is-reduced-motion) .achievement-unlock-card,
  .achievement-unlock-root:not(.is-reduced-motion) .achievement-unlock-hero-icon,
  .achievement-unlock-root:not(.is-reduced-motion) .achievement-unlock-halo,
  .achievement-unlock-root:not(.is-reduced-motion) .achievement-unlock-ray,
  .achievement-unlock-root:not(.is-reduced-motion) .achievement-unlock-spark {
    animation: none !important;
  }

  .achievement-unlock-root:not(.is-reduced-motion) .achievement-unlock-halo,
  .achievement-unlock-root:not(.is-reduced-motion) .achievement-unlock-ray-wrap,
  .achievement-unlock-root:not(.is-reduced-motion) .achievement-unlock-spark {
    opacity: 0;
    visibility: hidden;
  }
}
</style>
