<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import { copy } from '@/ui/copy'
import type { MockBountyCard } from '@/types/game'

const props = defineProps<{
  cards: MockBountyCard[]
}>()

const track = ref<HTMLElement | null>(null)
const activeIndex = ref(0)
const isJumping = ref(false)

/** Clone ends so the carousel feels circular (UX §3.1). */
const loopedCards = computed(() => {
  if (props.cards.length < 2) return props.cards.map((card, index) => ({ card, key: `solo-${index}`, realIndex: index }))
  const first = props.cards[0]
  const last = props.cards[props.cards.length - 1]
  return [
    { card: last, key: 'clone-last', realIndex: props.cards.length - 1 },
    ...props.cards.map((card, index) => ({ card, key: `real-${index}`, realIndex: index })),
    { card: first, key: 'clone-first', realIndex: 0 },
  ]
})

function slideWidth() {
  const el = track.value
  if (!el || !el.children.length) return 0
  const first = el.children[0] as HTMLElement
  const styles = getComputedStyle(el)
  const gap = Number.parseFloat(styles.columnGap || styles.gap || '0') || 0
  return first.getBoundingClientRect().width + gap
}

function scrollToLoopIndex(loopIndex: number, behavior: 'auto' | 'smooth' = 'auto') {
  const el = track.value
  const width = slideWidth()
  if (!el || !width) return
  el.scrollTo({ left: loopIndex * width, behavior })
}

function syncFromScroll() {
  const el = track.value
  const width = slideWidth()
  if (!el || !width || !props.cards.length) return

  const loopIndex = Math.round(el.scrollLeft / width)
  const count = props.cards.length

  if (count >= 2) {
    if (loopIndex <= 0) {
      activeIndex.value = count - 1
      if (!isJumping.value) {
        isJumping.value = true
        scrollToLoopIndex(count, 'auto')
        requestAnimationFrame(() => {
          isJumping.value = false
        })
      }
      return
    }
    if (loopIndex >= count + 1) {
      activeIndex.value = 0
      if (!isJumping.value) {
        isJumping.value = true
        scrollToLoopIndex(1, 'auto')
        requestAnimationFrame(() => {
          isJumping.value = false
        })
      }
      return
    }
    activeIndex.value = loopIndex - 1
    return
  }

  activeIndex.value = Math.min(count - 1, Math.max(0, loopIndex))
}

function onScroll() {
  if (isJumping.value) return
  syncFromScroll()
}

onMounted(async () => {
  await nextTick()
  // Start on the first real card (index 1 when clones exist) so neighbors peek both sides.
  scrollToLoopIndex(props.cards.length >= 2 ? 1 : 0, 'auto')
  track.value?.addEventListener('scroll', onScroll, { passive: true })
  track.value?.addEventListener('scrollend', syncFromScroll)
})

onUnmounted(() => {
  track.value?.removeEventListener('scroll', onScroll)
  track.value?.removeEventListener('scrollend', syncFromScroll)
})
</script>

<template>
  <div class="relative">
    <div
      ref="track"
      class="bounty-track flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pt-2 scrollbar-none"
      aria-roledescription="carousel"
      :aria-label="copy.home.drinkDailyBounties"
    >
      <article
        v-for="item in loopedCards"
        :key="item.key"
        class="bounty-card shrink-0 snap-center rounded-3xl p-5 shadow-md"
        style="background: var(--theme-surface); color: var(--theme-ink)"
        :aria-hidden="item.key.startsWith('clone-') ? true : undefined"
      >
        <div class="flex items-start justify-between gap-3">
          <p class="text-sm" style="color: var(--theme-muted)">{{ item.card.tierOrEyebrow }}</p>
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold text-white"
            style="background: var(--theme-accent)"
          >
            {{ item.card.pointsLabel }}
          </span>
        </div>

        <h3 class="font-display mt-3 text-2xl font-bold leading-tight">
          {{ item.card.title }}
        </h3>
        <p class="mt-2 text-sm leading-relaxed" style="color: var(--theme-muted)">
          {{ item.card.detail }}
        </p>

        <div class="mt-5">
          <p class="text-xs uppercase tracking-wide" style="color: var(--theme-muted)">
            {{ item.card.timerLabel }}
          </p>
          <p class="font-display mt-1 text-2xl font-semibold tabular-nums">
            {{ item.card.timerValue }}
          </p>
        </div>

        <button
          type="button"
          class="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white"
          style="background: var(--theme-primary)"
          disabled
          :aria-disabled="true"
          title="Phase 0 shell — claim flow arrives later"
          tabindex="-1"
        >
          {{ copy.bounty.claimIt }}
          <AppIcon name="action.next" />
        </button>

        <p class="mt-3 text-center text-xs" style="color: var(--theme-muted)">
          {{ item.card.footer }}
        </p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.scrollbar-none {
  scrollbar-width: none;
}
.scrollbar-none::-webkit-scrollbar {
  display: none;
}

/* Center the active card and reveal neighboring peeks (UX §3.1). */
.bounty-track {
  --bounty-card-width: 78%;
  scroll-padding-inline: calc((100% - var(--bounty-card-width)) / 2);
  padding-inline: calc((100% - var(--bounty-card-width)) / 2);
}

.bounty-card {
  width: var(--bounty-card-width);
}
</style>
