<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import { copy } from '@/ui/copy'
import type { MockBountyCard } from '@/types/game'

const props = defineProps<{
  cards: MockBountyCard[]
}>()

const track = ref<HTMLElement | null>(null)
const activeIndex = ref(0)

function syncActiveFromScroll() {
  const el = track.value
  if (!el || !props.cards.length) return
  const width = el.clientWidth
  if (!width) return
  activeIndex.value = Math.round(el.scrollLeft / width) % props.cards.length
}

function onScroll() {
  syncActiveFromScroll()
}

onMounted(() => {
  track.value?.addEventListener('scroll', onScroll, { passive: true })
})

onUnmounted(() => {
  track.value?.removeEventListener('scroll', onScroll)
})
</script>

<template>
  <div class="relative">
    <div
      ref="track"
      class="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 pt-1 scrollbar-none"
      style="scroll-padding-inline: 1rem"
    >
      <article
        v-for="card in cards"
        :key="card.id"
        class="w-[82%] shrink-0 snap-center rounded-3xl p-5 shadow-md"
        style="background: var(--theme-surface); color: var(--theme-ink)"
      >
        <div class="flex items-start justify-between gap-3">
          <p class="text-sm" style="color: var(--theme-muted)">{{ card.tierOrEyebrow }}</p>
          <span
            class="rounded-full px-3 py-1 text-xs font-semibold text-white"
            style="background: var(--theme-accent)"
          >
            {{ card.pointsLabel }}
          </span>
        </div>

        <h3 class="font-display mt-3 text-2xl font-bold leading-tight">
          {{ card.title }}
        </h3>
        <p class="mt-2 text-sm leading-relaxed" style="color: var(--theme-muted)">
          {{ card.detail }}
        </p>

        <div class="mt-5">
          <p class="text-xs uppercase tracking-wide" style="color: var(--theme-muted)">
            {{ card.timerLabel }}
          </p>
          <p class="font-display mt-1 text-2xl font-semibold tabular-nums">
            {{ card.timerValue }}
          </p>
        </div>

        <button
          type="button"
          class="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white"
          style="background: var(--theme-primary)"
          disabled
          :aria-disabled="true"
          title="Phase 0 shell — claim flow arrives later"
        >
          {{ copy.bounty.claimIt }}
          <AppIcon name="action.next" />
        </button>

        <p class="mt-3 text-center text-xs" style="color: var(--theme-muted)">
          {{ card.footer }}
        </p>
      </article>
    </div>

    <div class="mt-2 flex justify-center gap-1.5" aria-hidden="true">
      <span
        v-for="(card, index) in cards"
        :key="card.id"
        class="h-1.5 w-1.5 rounded-full transition"
        :style="{
          background:
            index === activeIndex ? 'var(--theme-primary)' : 'color-mix(in oklab, var(--theme-primary) 30%, white)',
        }"
      />
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
</style>
