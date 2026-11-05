<script setup lang="ts">
import { copy } from '@/ui/copy'
import type { DrinkitBarDrinkRow } from '@/types/drinkLog'

defineProps<{
  drinks: DrinkitBarDrinkRow[]
  search: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  showUnlisted: boolean
  unlistedName: string
  unlistedType: 'cocktail' | 'beer' | 'wine' | 'other'
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:unlistedName': [value: string]
  'update:unlistedType': [value: 'cocktail' | 'beer' | 'wine' | 'other']
  selectNamed: [drink: DrinkitBarDrinkRow]
  selectGeneric: [mode: 'generic_beer' | 'generic_wine' | 'generic_other']
  openUnlisted: []
  confirmUnlisted: []
  cancelUnlisted: []
}>()
</script>

<template>
  <section data-testid="wizard-drink-step" class="px-4 pb-28">
    <template v-if="!showUnlisted">
      <h2 class="font-display text-xl font-bold" style="color: var(--theme-ink)">
        {{ copy.wizard.drinkPrompt }}
      </h2>

      <label class="mt-4 block">
        <span class="sr-only">{{ copy.wizard.searchDrinks }}</span>
        <input
          :value="search"
          type="search"
          class="w-full rounded-2xl border-0 px-4 py-3 text-base outline-none"
          style="background: var(--theme-card); color: var(--theme-ink)"
          :placeholder="copy.wizard.searchDrinks"
          data-testid="drink-search"
          @input="emit('update:search', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <p v-if="status === 'loading'" class="mt-6 text-sm" style="color: var(--theme-muted)">
        Loading…
      </p>

      <p
        v-else-if="status === 'ready' && !drinks.length && !search.trim()"
        class="mt-6 text-sm"
        style="color: var(--theme-muted)"
        data-testid="drinks-bar-empty"
      >
        {{ copy.wizard.drinksBarEmpty }}
      </p>

      <p
        v-else-if="status === 'ready' && !drinks.length && search.trim()"
        class="mt-6 text-sm"
        style="color: var(--theme-muted)"
        data-testid="drinks-search-empty"
      >
        {{ copy.wizard.drinksSearchEmpty }}
      </p>

      <ul v-else class="mt-4 space-y-2" data-testid="drink-list">
        <li v-for="drink in drinks" :key="drink.offering_id">
          <button
            type="button"
            class="w-full rounded-2xl px-4 py-4 text-left font-semibold"
            style="background: var(--theme-card); color: var(--theme-ink)"
            :data-testid="`drink-row-${drink.offering_id}`"
            @click="emit('selectNamed', drink)"
          >
            {{ drink.display_name }}
          </button>
        </li>
      </ul>

      <div class="mt-6 space-y-2" data-testid="drink-generics">
        <button
          type="button"
          class="w-full rounded-2xl px-4 py-4 text-left font-semibold"
          style="background: var(--theme-card); color: var(--theme-ink)"
          data-testid="drink-generic-beer"
          @click="emit('selectGeneric', 'generic_beer')"
        >
          {{ copy.wizard.beer }}
        </button>
        <button
          type="button"
          class="w-full rounded-2xl px-4 py-4 text-left font-semibold"
          style="background: var(--theme-card); color: var(--theme-ink)"
          data-testid="drink-generic-wine"
          @click="emit('selectGeneric', 'generic_wine')"
        >
          {{ copy.wizard.wine }}
        </button>
        <button
          type="button"
          class="w-full rounded-2xl px-4 py-4 text-left font-semibold"
          style="background: var(--theme-card); color: var(--theme-ink)"
          data-testid="drink-generic-other"
          @click="emit('selectGeneric', 'generic_other')"
        >
          {{ copy.wizard.otherAlcoholic }}
        </button>
      </div>

      <button
        type="button"
        class="mt-4 w-full py-3 text-center text-sm font-semibold underline"
        style="color: var(--theme-primary)"
        data-testid="drink-not-listed"
        @click="emit('openUnlisted')"
      >
        {{ copy.wizard.drinkNotListed }}
      </button>
    </template>

    <template v-else>
      <h2 class="font-display text-xl font-bold" style="color: var(--theme-ink)" data-testid="unlisted-form">
        {{ copy.wizard.unlistedHeading }}
      </h2>
      <p class="mt-2 text-sm" style="color: var(--theme-muted)">{{ copy.wizard.unlistedIntro }}</p>
      <p class="mt-2 text-xs" style="color: var(--theme-muted)">{{ copy.wizard.unlistedPhase3cNote }}</p>

      <label class="mt-4 block text-sm font-semibold" style="color: var(--theme-ink)">
        {{ copy.wizard.unlistedNameLabel }}
        <input
          :value="unlistedName"
          type="text"
          class="mt-1 w-full rounded-2xl px-4 py-3 font-normal outline-none"
          style="background: var(--theme-card)"
          :placeholder="copy.wizard.unlistedNamePlaceholder"
          data-testid="unlisted-name"
          @input="emit('update:unlistedName', ($event.target as HTMLInputElement).value)"
        />
      </label>

      <fieldset class="mt-4">
        <legend class="text-sm font-semibold" style="color: var(--theme-ink)">
          {{ copy.wizard.unlistedTypeLabel }}
        </legend>
        <div class="mt-2 grid grid-cols-2 gap-2">
          <button
            v-for="opt in [
              { id: 'cocktail', label: copy.wizard.unlistedTypeCocktail },
              { id: 'beer', label: copy.wizard.beer },
              { id: 'wine', label: copy.wizard.wine },
              { id: 'other', label: copy.wizard.otherAlcoholic },
            ] as const"
            :key="opt.id"
            type="button"
            class="rounded-2xl px-3 py-3 text-sm font-semibold"
            :style="
              unlistedType === opt.id
                ? { background: 'var(--theme-primary)', color: '#fff' }
                : { background: 'var(--theme-card)', color: 'var(--theme-ink)' }
            "
            :data-testid="`unlisted-type-${opt.id}`"
            @click="emit('update:unlistedType', opt.id)"
          >
            {{ opt.label }}
          </button>
        </div>
      </fieldset>

      <div class="mt-6 flex gap-2">
        <button
          type="button"
          class="flex-1 rounded-full py-3 text-sm font-semibold"
          style="background: var(--theme-card); color: var(--theme-ink)"
          data-testid="unlisted-cancel"
          @click="emit('cancelUnlisted')"
        >
          {{ copy.wizard.back }}
        </button>
        <button
          type="button"
          class="flex-1 rounded-full py-3 text-sm font-semibold text-white disabled:opacity-50"
          style="background: var(--theme-primary)"
          data-testid="unlisted-continue"
          :disabled="!unlistedName.trim()"
          @click="emit('confirmUnlisted')"
        >
          {{ copy.wizard.continue }}
        </button>
      </div>
    </template>
  </section>
</template>
