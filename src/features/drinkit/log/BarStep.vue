<script setup lang="ts">
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
  <section data-testid="wizard-bar-step" class="px-4 pb-28">
    <h2 class="font-display text-xl font-bold" style="color: var(--theme-ink)">
      {{ copy.wizard.barPrompt }}
    </h2>

    <div class="mt-4 flex items-center gap-2 text-sm" style="color: var(--theme-muted)">
      <span>{{ copy.wizard.sortBy }}</span>
      <button
        type="button"
        class="rounded-full px-3 py-1 font-semibold"
        :style="
          sort === 'alpha'
            ? { background: 'var(--theme-primary)', color: '#fff' }
            : { background: 'var(--theme-card)', color: 'var(--theme-ink)' }
        "
        data-testid="bar-sort-alpha"
        @click="emit('sort', 'alpha')"
      >
        {{ copy.wizard.sortAlpha }}
      </button>
      <button
        type="button"
        class="rounded-full px-3 py-1 font-semibold"
        :style="
          sort === 'deck'
            ? { background: 'var(--theme-primary)', color: '#fff' }
            : { background: 'var(--theme-card)', color: 'var(--theme-ink)' }
        "
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
        class="mt-3 rounded-full px-4 py-2 text-sm font-semibold text-white"
        style="background: var(--theme-primary)"
        data-testid="bars-retry"
        @click="emit('retry')"
      >
        {{ copy.wizard.barsRetry }}
      </button>
    </div>

    <ul v-else class="mt-4 space-y-2" data-testid="bar-list">
      <li v-for="bar in bars" :key="bar.canonical_key">
        <button
          type="button"
          class="flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left transition"
          style="background: var(--theme-card); color: var(--theme-ink)"
          :data-testid="`bar-row-${bar.canonical_key}`"
          @click="emit('select', bar)"
        >
          <span class="font-semibold">{{ bar.name }}</span>
          <span class="text-sm" style="color: var(--theme-muted)">
            {{ formatCopy(copy.wizard.deckLabel, { deckNumber: bar.deck }) }}
          </span>
        </button>
      </li>
    </ul>
  </section>
</template>
