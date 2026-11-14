<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import { copy } from '@/ui/copy'
import type { WrappedIntroSlide } from '@/types/wrappedPlanC'
import type { SemanticIconKey } from '@/ui/icons'

const props = defineProps<{
  slide: WrappedIntroSlide
}>()

const emit = defineEmits<{
  advance: []
}>()

const headlineLines = copy.wrapped.introHeadlineLines
const shipIcon = computed(() => props.slide.icon as SemanticIconKey)
</script>

<template>
  <article
    class="intro-card"
    data-testid="wrapped-intro-card"
    :data-slide-id="slide.id"
  >
    <div class="intro-card__top">
      <AppIcon
        :name="shipIcon"
        style-variant="outline"
        class="intro-card__ship"
        aria-hidden="true"
      />
      <h3 class="intro-card__headline" data-testid="wrapped-intro-headline">
        <span
          v-for="(line, i) in headlineLines"
          :key="i"
          class="intro-card__line"
        >{{ line }}</span>
      </h3>
    </div>

    <div class="intro-card__bottom">
      <p class="intro-card__body">{{ slide.body }}</p>
      <button
        type="button"
        class="intro-card__advance"
        data-testid="wrapped-intro-advance"
        :aria-label="copy.wrapped.introAdvanceLabel"
        @click="emit('advance')"
      >
        <AppIcon name="action.next" style-variant="solid" class="intro-card__arrow" />
      </button>
    </div>
  </article>
</template>

<style scoped>
.intro-card {
  display: flex;
  height: 100%;
  min-height: 100%;
  flex: 1 1 auto;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  border-radius: 1.35rem 1.35rem 2.1rem 2.1rem;
  /* Drink It! aqua / Ship It! soft blue — theme tokens, not magenta header. */
  background: var(--theme-wrapped-intro);
  color: var(--theme-ink);
  box-shadow: 0 14px 26px rgba(80, 50, 20, 0.16);
  text-align: center;
}

.intro-card__top {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.15rem;
  padding: 1.75rem 1.15rem 0.75rem;
}

.intro-card__ship {
  font-size: clamp(2.15rem, 9cqi, 2.65rem);
  line-height: 1;
  color: var(--theme-ink);
  opacity: 0.92;
}

.intro-card__headline {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.05em;
  max-width: 16rem;
  font-family: var(--font-display);
  font-size: clamp(2.05rem, 9.2cqi, 2.55rem);
  font-weight: 300;
  line-height: 1.08;
  letter-spacing: -0.01em;
  color: var(--theme-ink);
}

.intro-card__line {
  display: block;
}

.intro-card__bottom {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.95rem;
  padding: 0.5rem 1.25rem 1.55rem;
}

.intro-card__body {
  margin: 0;
  max-width: 15.5rem;
  font-size: 1.02rem;
  font-weight: 400;
  line-height: 1.4;
  color: var(--theme-ink);
}

.intro-card__advance {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0.35rem;
  border: 0;
  background: transparent;
  color: var(--theme-ink);
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.intro-card__advance:focus-visible {
  outline: 2px solid var(--theme-ink);
  outline-offset: 4px;
  border-radius: 0.35rem;
}

.intro-card__arrow {
  font-size: clamp(1.85rem, 7.5cqi, 2.35rem);
  line-height: 1;
}
</style>
