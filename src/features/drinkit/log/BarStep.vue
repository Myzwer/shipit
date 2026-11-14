<script setup lang="ts">
import AppIcon from '@/components/shared/AppIcon.vue'
import { copy, formatCopy } from '@/ui/copy'
import type { BarSortMode, DrinkitBarRow } from '@/types/drinkLog'

defineProps<{
  bars: DrinkitBarRow[]
  sort: BarSortMode
  status: 'idle' | 'loading' | 'ready' | 'error'
}>()

const emit = defineEmits<{
  sort: [mode: BarSortMode]
  select: [bar: DrinkitBarRow]
  retry: []
}>()
</script>

<template>
  <section data-testid="wizard-bar-step" class="px-4 pb-32 pt-3">
    <h2 class="wizard-prompt">
      {{ copy.wizard.barPrompt }}
    </h2>

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
          :data-testid="`bar-row-${bar.canonical_key}`"
          @click="emit('select', bar)"
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
          </span>
          <AppIcon name="action.next" class="wizard-choice-arrow" />
        </button>
      </li>
    </ul>
  </section>
</template>
