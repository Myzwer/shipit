<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { cardDepth } from '@/lib/carousel/cardDepth'
import { wrapLoopIndex } from '@/lib/carousel/carouselScroll'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SlideItem = any

const props = withDefaults(
  defineProps<{
    items: SlideItem[]
    getKey: (item: SlideItem, index: number) => string
    /** Avoid native aria-label attr collision; pass as :label. */
    label: string
    testId?: string
    slideTestId?: (item: SlideItem, index: number) => string | undefined
    /** Infinite wrap with clones. Default true matches Cocktail Bounty. */
    loop?: boolean
    /** Card width in container query units. Bounty default 70. */
    cardWidthCqi?: number
    /** Negative-margin overlap in cqi. Bounty default 11. */
    overlapCqi?: number
    /** Min slide height. Bounty uses 20.6rem; Wrapped story cards need taller. */
    minHeight?: string
    stageBackground?: string
    stagePadding?: string
    showControls?: boolean
    slideClass?: string | ((item: SlideItem, index: number) => string)
  }>(),
  {
    loop: true,
    cardWidthCqi: 70,
    overlapCqi: 11,
    minHeight: '20.6rem',
    stageBackground: 'var(--theme-gradient-warm)',
    stagePadding: '1.7rem 0 3.6rem',
    showControls: false,
    testId: 'peek-carousel',
  },
)

const emit = defineEmits<{
  'active-change': [index: number]
  'slide-activate': [item: SlideItem, index: number]
}>()

const track = ref<HTMLElement | null>(null)
const activeIndex = ref(0)
const isJumping = ref(false)

const canLoop = computed(() => props.loop && props.items.length >= 2)

const loopedItems = computed(() => {
  if (!canLoop.value) {
    return props.items.map((item, index) => ({
      item,
      key: `solo-${props.getKey(item, index)}`,
      realIndex: index,
      clone: false,
    }))
  }
  const first = props.items[0]!
  const last = props.items[props.items.length - 1]!
  return [
    {
      item: last,
      key: `clone-last-${props.getKey(last, props.items.length - 1)}`,
      realIndex: props.items.length - 1,
      clone: true,
    },
    ...props.items.map((item, index) => ({
      item,
      key: `real-${props.getKey(item, index)}`,
      realIndex: index,
      clone: false,
    })),
    {
      item: first,
      key: `clone-first-${props.getKey(first, 0)}`,
      realIndex: 0,
      clone: true,
    },
  ]
})

function slideWidth() {
  const el = track.value
  if (!el || !el.children.length) return 0
  const first = el.children[0] as HTMLElement
  const styles = getComputedStyle(first)
  const marginRight = Number.parseFloat(styles.marginRight || '0') || 0
  return first.getBoundingClientRect().width + marginRight
}

function cardSide(realIndex: number): 'front' | 'before' | 'after' | 'far' {
  const count = props.items.length
  if (!count) return 'far'
  if (realIndex === activeIndex.value) return 'front'
  if (!canLoop.value) {
    if (realIndex === activeIndex.value - 1) return 'before'
    if (realIndex === activeIndex.value + 1) return 'after'
    return 'far'
  }
  const prev = (activeIndex.value - 1 + count) % count
  const next = (activeIndex.value + 1) % count
  if (realIndex === prev) return 'before'
  if (realIndex === next) return 'after'
  return 'far'
}

function resolveSlideClass(item: SlideItem, index: number): string {
  if (typeof props.slideClass === 'function') return props.slideClass(item, index)
  return props.slideClass ?? ''
}

function scrollTrackTo(loopIndex: number, behavior: ScrollBehavior = 'auto') {
  const el = track.value
  const width = slideWidth()
  if (!el || !width) return
  el.scrollTo({ left: loopIndex * width, behavior })
}

function updateActiveFromScroll() {
  const el = track.value
  const width = slideWidth()
  if (!el || !width || !props.items.length) return

  const loopIndex = Math.round(el.scrollLeft / width)
  const count = props.items.length
  if (!canLoop.value) {
    const next = Math.min(count - 1, Math.max(0, loopIndex))
    if (next !== activeIndex.value) {
      activeIndex.value = next
      emit('active-change', next)
    }
    return
  }
  let next: number
  if (loopIndex <= 0) next = count - 1
  else if (loopIndex >= count + 1) next = 0
  else next = loopIndex - 1
  if (next !== activeIndex.value) {
    activeIndex.value = next
    emit('active-change', next)
  }
}

let jumpLeft: number | null = null
let resizePending = false

function teleportSettledClone() {
  if (!canLoop.value) return
  const el = track.value
  const width = slideWidth()
  if (!el || !width || isJumping.value) return
  const target = wrapLoopIndex(Math.round(el.scrollLeft / width), props.items.length)
  if (target == null) return
  const left = target * width
  isJumping.value = true
  jumpLeft = left
  el.classList.add('is-jumping')
  el.style.scrollSnapType = 'none'
  el.scrollLeft = left
  el.style.scrollSnapType = ''
  if (Math.abs(el.scrollLeft - left) <= 1) {
    isJumping.value = false
    jumpLeft = null
  }
  requestAnimationFrame(() => {
    el.classList.remove('is-jumping')
  })
}

function applyDepth() {
  const el = track.value
  const width = slideWidth()
  if (!el || !width) return
  const center = el.scrollLeft / width
  Array.from(el.children).forEach((node, index) => {
    const card = node as HTMLElement
    const depth = cardDepth(Math.abs(center - index))
    card.style.opacity = String(depth.opacity)
    card.style.transform = `translateY(${depth.shift}px)`
    card.style.zIndex = String(depth.zIndex)
    card.style.boxShadow = depth.shadow ? '0 14px 26px rgba(80, 50, 20, 0.18)' : 'none'
  })
}

function lockCardHeight() {
  const el = track.value
  if (!el) return
  const cards = Array.from(el.children) as HTMLElement[]
  if (!cards.length) return
  cards.forEach((card) => {
    card.style.height = 'auto'
  })
  const max = Math.max(...cards.map((card) => card.offsetHeight))
  if (!max) return
  cards.forEach((card) => {
    card.style.height = `${max}px`
  })
}

function onScroll() {
  track.value?.classList.add('is-scrolling')
  applyDepth()
  const el = track.value
  if (isJumping.value) {
    if (el && jumpLeft != null && Math.abs(el.scrollLeft - jumpLeft) <= 1) {
      isJumping.value = false
      jumpLeft = null
    }
    return
  }
  updateActiveFromScroll()
}

function settleLayout() {
  lockCardHeight()
  applyDepth()
}

function onScrollEnd() {
  track.value?.classList.remove('is-scrolling')
  const el = track.value
  if (isJumping.value) {
    const pending = el && jumpLeft != null && Math.abs(el.scrollLeft - jumpLeft) > 1
    if (pending) return
    isJumping.value = false
    jumpLeft = null
  }
  teleportSettledClone()
  if (isJumping.value) return
  updateActiveFromScroll()
  applyDepth()
  if (resizePending) {
    resizePending = false
    settleLayout()
  }
}

function scrollToIndex(index: number, behavior: ScrollBehavior = 'smooth') {
  const count = props.items.length
  if (!count) return
  const clamped = Math.min(count - 1, Math.max(0, index))
  const loopIndex = canLoop.value ? clamped + 1 : clamped
  scrollTrackTo(loopIndex, behavior)
  activeIndex.value = clamped
  emit('active-change', clamped)
}

function goPrev() {
  if (!props.items.length) return
  if (canLoop.value) {
    scrollToIndex((activeIndex.value - 1 + props.items.length) % props.items.length)
    return
  }
  if (activeIndex.value > 0) scrollToIndex(activeIndex.value - 1)
}

function goNext() {
  if (!props.items.length) return
  if (canLoop.value) {
    scrollToIndex((activeIndex.value + 1) % props.items.length)
    return
  }
  if (activeIndex.value < props.items.length - 1) scrollToIndex(activeIndex.value + 1)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    goPrev()
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    goNext()
  }
}

let resizeObserver: ResizeObserver | undefined
let observedWidth = 0

onMounted(async () => {
  await nextTick()
  scrollTrackTo(canLoop.value ? 1 : 0)
  settleLayout()
  track.value?.addEventListener('scroll', onScroll, { passive: true })
  track.value?.addEventListener('scrollend', onScrollEnd)
  if (track.value && typeof ResizeObserver !== 'undefined') {
    observedWidth = track.value.clientWidth
    resizeObserver = new ResizeObserver(() => {
      const width = track.value?.clientWidth ?? 0
      if (width === observedWidth) return
      observedWidth = width
      if (track.value?.classList.contains('is-scrolling') || isJumping.value) {
        resizePending = true
        return
      }
      settleLayout()
    })
    resizeObserver.observe(track.value)
  }
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  track.value?.removeEventListener('scroll', onScroll)
  track.value?.removeEventListener('scrollend', onScrollEnd)
})

watch(
  () => props.items.map((item, i) => props.getKey(item, i)).join('|'),
  async () => {
    await nextTick()
    const target = canLoop.value
      ? Math.min(activeIndex.value, Math.max(0, props.items.length - 1)) + 1
      : Math.min(activeIndex.value, Math.max(0, props.items.length - 1))
    scrollTrackTo(Number.isFinite(target) ? target : 0)
    if (activeIndex.value >= props.items.length) {
      activeIndex.value = Math.max(0, props.items.length - 1)
      emit('active-change', activeIndex.value)
    }
    settleLayout()
  },
)

defineExpose({
  scrollToIndex,
  goPrev,
  goNext,
  activeIndex,
})
</script>

<template>
  <div
    class="peek-stage"
    :style="{
      background: stageBackground,
      padding: stagePadding,
      '--peek-card-width': `${cardWidthCqi}cqi`,
      '--peek-overlap': `${overlapCqi}cqi`,
      '--peek-min-height': minHeight,
    }"
  >
    <div
      ref="track"
      class="peek-track flex snap-x snap-mandatory scrollbar-none"
      :class="{ 'is-jumping': isJumping }"
      tabindex="0"
      aria-roledescription="carousel"
      :aria-label="label"
      :data-testid="testId"
      @keydown="onKeydown"
    >
      <div
        v-for="entry in loopedItems"
        :key="entry.key"
        class="peek-slide shrink-0 snap-center"
        :class="[`is-${cardSide(entry.realIndex)}`, resolveSlideClass(entry.item, entry.realIndex)]"
        :aria-hidden="entry.clone ? true : undefined"
        :aria-label="
          entry.clone
            ? undefined
            : `${entry.realIndex + 1} of ${items.length}`
        "
        :data-testid="
          entry.clone
            ? undefined
            : slideTestId?.(entry.item, entry.realIndex)
        "
      >
        <slot
          name="slide"
          :item="entry.item"
          :index="entry.realIndex"
          :side="cardSide(entry.realIndex)"
          :is-front="cardSide(entry.realIndex) === 'front'"
        />
      </div>
    </div>

    <div
      v-if="showControls && items.length > 0"
      class="peek-controls"
      data-testid="peek-carousel-controls"
    >
      <button
        type="button"
        class="peek-control-btn"
        aria-label="Previous card"
        data-testid="peek-carousel-prev"
        :disabled="!canLoop && activeIndex <= 0"
        @click="goPrev"
      >
        ‹
      </button>
      <p class="peek-counter" data-testid="peek-carousel-counter">
        {{ activeIndex + 1 }} / {{ items.length }}
      </p>
      <button
        type="button"
        class="peek-control-btn"
        aria-label="Next card"
        data-testid="peek-carousel-next"
        :disabled="!canLoop && activeIndex >= items.length - 1"
        @click="goNext"
      >
        ›
      </button>
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

.peek-stage {
  container-type: inline-size;
}

.peek-track {
  gap: 0;
  overflow-x: auto;
  overflow-y: hidden;
  overflow-anchor: none;
  overscroll-behavior-x: contain;
  padding-bottom: 10px;
  margin-bottom: -10px;
  scroll-padding-inline: calc((100cqi - var(--peek-card-width)) / 2);
  padding-inline: calc((100cqi - var(--peek-card-width)) / 2);
  align-items: stretch;
}

.peek-slide {
  position: relative;
  z-index: 1;
  display: flex;
  width: var(--peek-card-width);
  min-height: var(--peek-min-height);
  /* Negative margin creates neighbor peek; must not apply on the last slide or
     max scrollLeft falls short of a true center snap by exactly the overlap. */
  margin-right: calc(var(--peek-overlap) * -1);
  transition:
    opacity 280ms ease,
    transform 280ms ease;
}

.peek-slide:last-child {
  margin-right: 0;
}

.peek-track.is-scrolling .peek-slide,
.peek-track.is-jumping .peek-slide {
  transition: none;
}

.peek-slide.is-before,
.peek-slide.is-after,
.peek-slide.is-far {
  z-index: 1;
  opacity: 0.35;
  transform: translateY(10px);
}

.peek-slide.is-front {
  z-index: 4;
  opacity: 1;
  transform: none;
  box-shadow: 0 14px 26px rgba(80, 50, 20, 0.18);
}

@media (prefers-reduced-motion: reduce) {
  .peek-slide {
    transition: none;
  }
}

.peek-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  margin-top: 0.85rem;
}

.peek-control-btn {
  display: inline-flex;
  width: 2.25rem;
  height: 2.25rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: color-mix(in srgb, #fff 18%, transparent);
  color: #fff;
  font-size: 1.35rem;
  font-weight: 700;
  line-height: 1;
}

.peek-control-btn:disabled {
  opacity: 0.35;
}

.peek-counter {
  margin: 0;
  min-width: 4.5rem;
  text-align: center;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.04em;
}
</style>
