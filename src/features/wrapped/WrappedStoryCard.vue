<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import WrappedTextBlocks from '@/features/wrapped/WrappedTextBlocks.vue'
import type { WrappedDoubleSlide, WrappedSingleSlide } from '@/types/wrappedPlanC'
import type { SemanticIconKey } from '@/ui/icons'

const props = defineProps<{
  slide: WrappedSingleSlide | WrappedDoubleSlide
  sequenceLabel: string
}>()

const cardFill = computed(() =>
  props.slide.tone === 'warm'
    ? 'var(--theme-wrapped-card-warm)'
    : 'var(--theme-wrapped-card-cool)',
)

const iconName = computed(() => props.slide.icon as SemanticIconKey)

const singleSlide = computed(() =>
  props.slide.type === 'single' ? props.slide : null,
)

const doubleSlide = computed(() =>
  props.slide.type === 'double' ? props.slide : null,
)

/** Pure numeric / ratio heroes get the large display size; names use the text scale. */
function isNumericHero(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  return /^[\d,.\s/%]+$/.test(trimmed)
}

const singleHeroClass = computed(() => {
  if (!singleSlide.value) return 'is-text'
  if (isNumericHero(singleSlide.value.heroValue)) return 'is-numeric'
  // Modest scale-down for long drink/challenge names so they can wrap cleanly.
  return singleSlide.value.heroValue.trim().length > 28 ? 'is-text is-long' : 'is-text'
})

const hasSingleSupport = computed(() => {
  const slide = singleSlide.value
  if (!slide) return false
  return slide.paragraphs.length > 0 || Boolean(slide.footer)
})

/**
 * Three-region body layouts (shared across slides):
 * - full / double: TOP intro · MIDDLE reveal(s) · BOTTOM support/footer
 * - short / double-compact: TOP intro · MIDDLE reveal(s) — no empty footer row
 *
 * Only the three major regions drive vertical placement. Inner labels,
 * paragraphs, and paired reveals stay grouped (never space-between).
 */
const bodyLayout = computed(() => {
  if (props.slide.type === 'double') {
    return doubleSlide.value?.footer ? 'double' : 'double-compact'
  }
  return hasSingleSupport.value ? 'full' : 'short'
})
</script>

<template>
  <article
    class="story-card"
    :style="{ background: cardFill }"
    data-testid="wrapped-story-card"
    :data-slide-id="slide.id"
    :data-slide-type="slide.type"
    :data-body-layout="bodyLayout"
  >
    <header class="story-card__band">
      <p class="story-card__eyebrow">{{ sequenceLabel }} — {{ slide.eyebrow }}</p>
      <AppIcon :name="iconName" style-variant="outline" class="story-card__icon" />
    </header>

    <div
      class="story-card__body"
      :class="`is-${bodyLayout}`"
    >
      <div class="story-card__intro">
        <h3 class="story-card__headline">{{ slide.headline }}</h3>
        <WrappedTextBlocks
          v-if="slide.lead"
          :content="slide.lead"
          class="story-card__lead"
        />
      </div>

      <template v-if="singleSlide">
        <div class="story-card__feature">
          <p
            class="story-card__hero"
            :class="singleHeroClass"
            data-testid="wrapped-story-hero"
          >
            {{ singleSlide.heroValue }}
          </p>
          <p
            v-if="singleSlide.heroLabel"
            class="story-card__hero-label"
          >
            {{ singleSlide.heroLabel }}
          </p>
        </div>

        <div
          v-if="hasSingleSupport"
          class="story-card__support"
        >
          <WrappedTextBlocks
            v-for="(para, i) in singleSlide.paragraphs"
            :key="i"
            :content="para"
            class="story-card__para"
          />
          <WrappedTextBlocks
            v-if="singleSlide.footer"
            :content="singleSlide.footer"
            class="story-card__footer"
          />
        </div>
      </template>

      <template v-else-if="doubleSlide">
        <div class="story-card__reveals">
          <div
            v-for="(hero, i) in doubleSlide.heroes"
            :key="i"
            class="story-card__double"
            data-testid="wrapped-story-double-hero"
          >
            <p
              class="story-card__hero story-card__hero--double"
              :class="isNumericHero(hero.value) ? 'is-numeric' : 'is-text'"
            >
              {{ hero.value }}
            </p>
            <p v-if="hero.label" class="story-card__hero-label">{{ hero.label }}</p>
            <WrappedTextBlocks :content="hero.body" class="story-card__para" />
          </div>
        </div>
        <WrappedTextBlocks
          v-if="doubleSlide.footer"
          :content="doubleSlide.footer"
          class="story-card__footer story-card__footer--double"
        />
      </template>
    </div>
  </article>
</template>

<style scoped>
.story-card {
  display: flex;
  width: 100%;
  /* Fill the PeekCarousel locked slide height; body stacks naturally inside. */
  height: 100%;
  min-height: 100%;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  border-radius: 1.35rem 1.35rem 2.1rem 2.1rem;
  color: var(--theme-ink);
  box-shadow: 0 14px 26px rgba(80, 50, 20, 0.16);
}

.story-card__band {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  /* ~10–15px taller than the prior 2.7rem band */
  min-height: 3.45rem;
  padding: 0.72rem 1.05rem 0.68rem;
  background: var(--theme-header, #a32660);
  color: #fff;
}

.story-card__eyebrow {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 500;
  font-style: italic;
  letter-spacing: 0.01em;
  line-height: 1.25;
}

.story-card__icon {
  flex-shrink: 0;
  font-size: 1.31rem;
  opacity: 0.95;
}

/* Three anchored regions: TOP auto · MIDDLE 1fr · BOTTOM auto */
.story-card__body {
  display: grid;
  flex: 1 1 auto;
  min-height: 0;
  width: 100%;
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: auto minmax(0, 1fr) auto;
  align-items: stretch;
  justify-items: center;
  padding: 0.95rem 1.1rem 1.1rem;
  text-align: center;
}

/* No footer region — only TOP + MIDDLE */
.story-card__body.is-short,
.story-card__body.is-double-compact {
  grid-template-rows: auto minmax(0, 1fr);
}

.story-card__intro {
  grid-row: 1;
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
}

.story-card__headline {
  margin: 0;
  max-width: 17rem;
  font-family: var(--font-display);
  font-size: clamp(1.35rem, 4.6cqi, 1.5rem);
  font-weight: 800;
  line-height: 1.22;
}

.story-card__lead {
  margin-top: 0.45rem !important;
  max-width: 17rem;
  font-size: 1.02rem;
  line-height: 1.4;
}

.story-card__feature,
.story-card__reveals {
  grid-row: 2;
  display: flex;
  width: 100%;
  min-height: 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.story-card__reveals {
  gap: 1.05rem;
}

.story-card__support {
  grid-row: 3;
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
  gap: 0.55rem;
}

.story-card__footer--double {
  grid-row: 3;
  width: 100%;
}

.story-card__double {
  display: flex;
  width: 100%;
  flex-direction: column;
  align-items: center;
}
.story-card__hero {
  margin: 0;
  max-width: 100%;
  font-family: var(--font-display);
  font-weight: 800;
  line-height: 1.02;
  overflow-wrap: anywhere;
}

/* Numeric heroes stay the focal point */
.story-card__hero.is-numeric {
  font-size: clamp(3.75rem, 21cqi, 6rem);
  letter-spacing: -0.02em;
}

/* Names / drinks / categories: large but secondary to numeric heroes */
.story-card__hero.is-text {
  font-size: clamp(1.7rem, 8cqi, 2.55rem);
  line-height: 1.12;
  max-width: 17rem;
}

.story-card__hero.is-text.is-long {
  font-size: clamp(1.45rem, 6.8cqi, 2.1rem);
  line-height: 1.15;
}

.story-card__hero--double.is-numeric {
  font-size: clamp(2.6rem, 12cqi, 4.25rem);
}

.story-card__hero--double.is-text {
  font-size: clamp(1.55rem, 7.2cqi, 2.25rem);
}

.story-card__hero-label {
  margin: 0.3rem 0 0;
  font-size: 1.08rem;
  font-weight: 700;
  line-height: 1.25;
}

.story-card__para {
  margin: 0 !important;
  max-width: 17rem;
  font-size: 1.02rem;
  line-height: 1.45;
}

.story-card__double .story-card__para {
  margin-top: 0.35rem !important;
}

.story-card__support .story-card__para + .story-card__para {
  margin-top: 0 !important;
}

.story-card__footer {
  margin: 0 !important;
  max-width: 17rem;
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.4;
}
</style>
