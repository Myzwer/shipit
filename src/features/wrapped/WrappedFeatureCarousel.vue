<script setup lang="ts">
import { ref } from 'vue'
import PeekCarousel from '@/components/shared/PeekCarousel.vue'
import WrappedIntroCard from '@/features/wrapped/WrappedIntroCard.vue'
import WrappedPhotoCard from '@/features/wrapped/WrappedPhotoCard.vue'
import WrappedStoryCard from '@/features/wrapped/WrappedStoryCard.vue'
import type { GameId } from '@/types/game'
import type { WrappedFeatureSlide } from '@/types/wrappedPlanC'

defineProps<{
  slides: WrappedFeatureSlide[]
  game: GameId
}>()

const emit = defineEmits<{
  'open-photo': [payload: { url: string; photoId: string }]
}>()

const carousel = ref<{
  goNext: () => void
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void
  activeIndex: { value: number }
} | null>(null)

function sequenceLabel(index: number, total: number): string {
  const n = String(index + 1).padStart(2, '0')
  const t = String(total).padStart(2, '0')
  return `${n} / ${t}`
}

function advanceFromIntro() {
  carousel.value?.goNext()
}

defineExpose({
  scrollToIndex: (index: number, behavior?: ScrollBehavior) =>
    carousel.value?.scrollToIndex(index, behavior),
  goNext: () => carousel.value?.goNext(),
})
</script>

<template>
  <PeekCarousel
    v-if="slides.length"
    ref="carousel"
    :items="slides"
    :get-key="(slide) => slide.id"
    label="Featured Wrapped stories"
    test-id="wrapped-feature-carousel"
    :slide-test-id="(slide) => `wrapped-slide-${slide.id}`"
    :loop="false"
    :show-controls="true"
    :card-width-cqi="78"
    :overlap-cqi="10"
    min-height="26.75rem"
    stage-background="var(--theme-primary)"
    stage-padding="1.1rem 0 2.15rem"
    slide-class="wrapped-feature-slide"
  >
    <template #slide="{ item: slide, index }">
      <WrappedIntroCard
        v-if="slide.type === 'intro'"
        :slide="slide"
        @advance="advanceFromIntro"
      />
      <WrappedPhotoCard
        v-else-if="slide.type === 'photo'"
        :slide="slide"
        :game="game"
        :sequence-label="sequenceLabel(index, slides.length)"
        @open="emit('open-photo', $event)"
      />
      <WrappedStoryCard
        v-else
        :slide="slide"
        :sequence-label="sequenceLabel(index, slides.length)"
      />
    </template>
  </PeekCarousel>
  <div
    v-else
    class="wrapped-feature-empty"
    data-testid="wrapped-feature-empty"
  >
    <!-- Page still shows leaderboard + All Stats when no feature slides qualify. -->
  </div>
</template>

<style scoped>
:deep(.wrapped-feature-slide) {
  display: flex;
  flex-direction: column;
  padding: 0;
  background: transparent;
  border-radius: 1.65rem;
}

:deep(.wrapped-feature-slide > *) {
  flex: 1 1 auto;
  min-height: 0;
  height: 100%;
}

/* Extra air between card bottom, controls, and the section below. */
:deep(.peek-controls) {
  margin-top: 1.85rem;
}

:deep(.peek-counter) {
  font-size: 0.95rem;
}

.wrapped-feature-empty {
  min-height: 0.5rem;
  background: var(--theme-primary);
}
</style>
