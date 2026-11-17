<script setup lang="ts">
import AppIcon from '@/components/shared/AppIcon.vue'
import { copy, formatCopy } from '@/ui/copy'
import type { BarSortMode, DrinkitBarRow } from '@/types/drinkLog'

const props = defineProps<{
  bars: DrinkitBarRow[]
  sort: BarSortMode
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** 2C.13A Ingredient Claim only — never set for ordinary Log a Drink. */
  ingredientGuide?: boolean
  ingredientAvailabilityReady?: boolean
  ingredientAvailabilityNotice?: boolean
  isBarEligible?: (barCanonicalKey: string) => boolean
}>()

const emit = defineEmits<{
  sort: [mode: BarSortMode]
  select: [bar: DrinkitBarRow]
  retry: []
}>()

function barIsSelectable(bar: DrinkitBarRow): boolean {
  if (!props.ingredientGuide || !props.ingredientAvailabilityReady) return true
  if (!props.isBarEligible) return true
  return props.isBarEligible(bar.canonical_key)
}

function onSelect(bar: DrinkitBarRow) {
  if (!barIsSelectable(bar)) return
  emit('select', bar)
}
</script>

<template>
  <section data-testid="wizard-bar-step" class="px-4 pb-32 pt-3">
    <h2 class="wizard-prompt">
      {{ copy.wizard.barPrompt }}
    </h2>

    <p
      v-if="ingredientGuide"
      class="mt-2 text-sm leading-snug"
      style="color: var(--theme-muted)"
      data-testid="ingredient-bar-guide"
    >
      {{ copy.wizard.ingredientBarGuide }}
    </p>

    <p
      v-if="ingredientAvailabilityNotice"
      class="mt-2 text-sm leading-snug"
      style="color: var(--theme-muted)"
      data-testid="ingredient-bar-availability-notice"
    >
      {{ copy.wizard.ingredientBarAvailabilityUnavailable }}
    </p>

    <div class="wizard-sort">
      <span>{{ copy.wizard.sortBy }}</span>
      <button
        type="button"
        :aria-pressed="sort === 'alpha'"
        data-testid="bar-sort-alpha"
        @click="emit('sort', 'alpha')"
      >
        {{ copy.wizard.sortAlpha }}
      </button>
      <button
        type="button"
        :aria-pressed="sort === 'deck'"
        data-testid="bar-sort-deck"
        @click="emit('sort', 'deck')"
      >
        {{ copy.wizard.sortDeck }}
      </button>
    </div>

    <p v-if="status === 'loading'" class="mt-6 text-sm" style="color: var(--theme-muted)">
      Loading…
    </p>

    <div v-else-if="status === 'error' || !bars.length" class="mt-6 text-center" data-testid="bars-empty">
      <p style="color: var(--theme-ink)">{{ copy.wizard.barsEmpty }}</p>
      <button
        type="button"
        class="ui-primary-btn mt-3"
        data-testid="bars-retry"
        @click="emit('retry')"
      >
        {{ copy.wizard.barsRetry }}
      </button>
    </div>

    <ul v-else class="mt-3 space-y-2.5" data-testid="bar-list">
      <li v-for="bar in bars" :key="bar.canonical_key">
        <button
          type="button"
          class="wizard-choice"
          :class="{ 'is-unavailable': !barIsSelectable(bar) }"
          :disabled="!barIsSelectable(bar)"
          :aria-disabled="!barIsSelectable(bar) ? 'true' : undefined"
          :data-testid="`bar-row-${bar.canonical_key}`"
          :data-ingredient-eligible="
            ingredientGuide && ingredientAvailabilityReady
              ? barIsSelectable(bar)
                ? 'true'
                : 'false'
              : undefined
          "
          @click="onSelect(bar)"
        >
          <AppIcon name="theme.drink-it" class="wizard-choice-icon text-[1.05rem]" />
          <span class="wizard-choice-copy">
            <span class="wizard-choice-title ui-display-name">{{ bar.name }}</span>
            <span class="wizard-choice-meta">
              {{
                bar.is_virtual
                  ? copy.wizard.mobileOrderMeta
                  : formatCopy(copy.wizard.deckLabel, { deckNumber: bar.deck })
              }}
            </span>
            <span
              v-if="!barIsSelectable(bar)"
              class="wizard-choice-cue"
              data-testid="ingredient-bar-not-listed"
            >
              {{ copy.wizard.ingredientBarNotListed }}
            </span>
          </span>
          <AppIcon
            v-if="barIsSelectable(bar)"
            name="action.next"
            class="wizard-choice-arrow"
          />
        </button>
      </li>
    </ul>
  </section>
</template>
