<script setup lang="ts">
import AppIcon from '@/components/shared/AppIcon.vue'
import { copy } from '@/ui/copy'
import type { DrinkitBarDrinkRow } from '@/types/drinkLog'

defineProps<{
  drinks: DrinkitBarDrinkRow[]
  search: string
  status: 'idle' | 'loading' | 'ready' | 'error'
  showUnlisted: boolean
  unlistedName: string
  unlistedType: 'cocktail' | 'beer' | 'wine' | 'other'
  activeIngredientName: string | null
  unlistedContainsIngredient: boolean | null
  showFeaturedConfirm: boolean
  featuredDrinkName: string | null
  unlistedConfirmFeatured: boolean
  /** Mobile Order virtual source — cross-catalog search, not a venue menu. */
  isMobileOrder?: boolean
}>()

const emit = defineEmits<{
  'update:search': [value: string]
  'update:unlistedName': [value: string]
  'update:unlistedType': [value: 'cocktail' | 'beer' | 'wine' | 'other']
  'update:unlistedContainsIngredient': [value: boolean | null]
  'update:unlistedConfirmFeatured': [value: boolean]
  selectNamed: [drink: DrinkitBarDrinkRow]
  selectGeneric: [mode: 'generic_beer' | 'generic_wine' | 'generic_other']
  openUnlisted: []
  openOtherDrinks: []
  confirmUnlisted: []
  cancelUnlisted: []
}>()
</script>

<template>
  <section data-testid="wizard-drink-step" class="px-4 pb-32 pt-3">
    <template v-if="!showUnlisted">
      <h2 class="wizard-prompt">
        {{ isMobileOrder ? copy.wizard.mobileOrderDrinkPrompt : copy.wizard.drinkPrompt }}
      </h2>

      <label class="wizard-search">
        <span class="sr-only">{{ copy.wizard.searchDrinks }}</span>
        <AppIcon name="action.search" class="text-sm" />
        <input
          :value="search"
          type="search"
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
        {{ isMobileOrder ? copy.wizard.drinksMobileOrderEmpty : copy.wizard.drinksBarEmpty }}
      </p>

      <p
        v-else-if="status === 'ready' && !drinks.length && search.trim()"
        class="mt-6 text-sm"
        style="color: var(--theme-muted)"
        data-testid="drinks-search-empty"
      >
        {{ copy.wizard.drinksSearchEmpty }}
      </p>

      <ul v-else class="mt-3 space-y-2.5" data-testid="drink-list">
        <li v-for="drink in drinks" :key="drink.drink_concept_id || drink.offering_id">
          <button
            type="button"
            class="wizard-choice"
            :data-testid="`drink-row-${drink.canonical_key || drink.offering_id}`"
            @click="emit('selectNamed', drink)"
          >
            <AppIcon name="theme.drink-it" class="wizard-choice-icon text-[1.05rem]" />
            <span class="wizard-choice-title ui-display-name">{{ drink.display_name }}</span>
            <AppIcon name="action.next" class="wizard-choice-arrow" />
          </button>
        </li>
      </ul>

      <!-- Mobile Order: keep generic rows + unlisted honor path. -->
      <template v-if="isMobileOrder">
        <div class="mt-2.5 space-y-2.5" data-testid="drink-generics">
          <button
            type="button"
            class="wizard-choice"
            data-testid="drink-generic-beer"
            @click="emit('selectGeneric', 'generic_beer')"
          >
            <AppIcon name="theme.drink-it" class="wizard-choice-icon text-[1.05rem]" />
            <span class="wizard-choice-title">{{ copy.wizard.beer }}</span>
            <AppIcon name="action.next" class="wizard-choice-arrow" />
          </button>
          <button
            type="button"
            class="wizard-choice"
            data-testid="drink-generic-wine"
            @click="emit('selectGeneric', 'generic_wine')"
          >
            <AppIcon name="theme.drink-it" class="wizard-choice-icon text-[1.05rem]" />
            <span class="wizard-choice-title">{{ copy.wizard.wine }}</span>
            <AppIcon name="action.next" class="wizard-choice-arrow" />
          </button>
          <button
            type="button"
            class="wizard-choice"
            data-testid="drink-generic-other"
            @click="emit('selectGeneric', 'generic_other')"
          >
            <AppIcon name="theme.drink-it" class="wizard-choice-icon text-[1.05rem]" />
            <span class="wizard-choice-title">{{ copy.wizard.otherAlcoholic }}</span>
            <AppIcon name="action.next" class="wizard-choice-arrow" />
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

      <!-- Physical bars: permanent Other Drinks route (catalog-independent). -->
      <button
        v-else
        type="button"
        class="wizard-choice wizard-choice--primary mt-2.5"
        data-testid="other-drinks-entry"
        @click="emit('openOtherDrinks')"
      >
        <AppIcon name="theme.drink-it" class="wizard-choice-icon text-[1.05rem]" />
        <span class="wizard-choice-title">{{ copy.wizard.otherDrinks }}</span>
        <AppIcon name="action.next" class="wizard-choice-arrow" />
      </button>
    </template>

    <template v-else>
      <h2 class="wizard-prompt" data-testid="unlisted-form">
        {{ copy.wizard.unlistedHeading }}
      </h2>
      <p class="mt-2 text-sm" style="color: var(--theme-muted)">
        {{ isMobileOrder ? copy.wizard.unlistedMobileOrderIntro : copy.wizard.unlistedIntro }}
      </p>
      <p class="mt-2 text-xs" style="color: var(--theme-muted)">{{ copy.wizard.unlistedPhase3cNote }}</p>

      <label class="mt-4 block text-sm font-semibold" style="color: var(--theme-ink)">
        {{ copy.wizard.unlistedNameLabel }}
        <input
          :value="unlistedName"
          type="text"
          class="mt-1 w-full rounded-2xl bg-white px-4 py-3 font-normal shadow-sm outline-none"
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
                : { background: '#fff', color: 'var(--theme-ink)' }
            "
            :data-testid="`unlisted-type-${opt.id}`"
            @click="emit('update:unlistedType', opt.id)"
          >
            {{ opt.label }}
          </button>
        </div>
      </fieldset>

      <div
        v-if="unlistedType === 'cocktail' && activeIngredientName"
        class="mt-4 rounded-2xl bg-white px-4 py-3 shadow-sm"
        data-testid="unlisted-ingredient-confirm"
      >
        <p class="text-sm font-semibold" style="color: var(--theme-ink)">
          {{
            copy.wizard.unlistedIngredientQuestion.replace('{ingredientName}', activeIngredientName)
          }}
        </p>
        <p class="mt-1 text-xs" style="color: var(--theme-muted)">
          {{ copy.wizard.confirmIngredientHelper }}
        </p>
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-full py-2 text-sm font-semibold"
            :style="
              unlistedContainsIngredient === true
                ? { background: 'var(--theme-primary)', color: '#fff' }
                : { background: 'transparent', color: 'var(--theme-ink)', outline: '1px solid var(--theme-muted)' }
            "
            data-testid="unlisted-ingredient-yes"
            @click="emit('update:unlistedContainsIngredient', true)"
          >
            {{ copy.wizard.confirmIngredientYes }}
          </button>
          <button
            type="button"
            class="flex-1 rounded-full py-2 text-sm font-semibold"
            :style="
              unlistedContainsIngredient === false
                ? { background: 'var(--theme-primary)', color: '#fff' }
                : { background: 'transparent', color: 'var(--theme-ink)', outline: '1px solid var(--theme-muted)' }
            "
            data-testid="unlisted-ingredient-no"
            @click="emit('update:unlistedContainsIngredient', false)"
          >
            {{ copy.wizard.confirmIngredientNo }}
          </button>
        </div>
      </div>

      <div
        v-if="unlistedType === 'cocktail' && showFeaturedConfirm && featuredDrinkName"
        class="mt-4 rounded-2xl bg-white px-4 py-3 shadow-sm"
        data-testid="unlisted-featured-confirm"
      >
        <p class="text-sm font-semibold" style="color: var(--theme-ink)">
          {{
            copy.wizard.unlistedFeaturedQuestion.replace('{drinkName}', featuredDrinkName)
          }}
        </p>
        <p class="mt-1 text-xs" style="color: var(--theme-muted)">
          {{ copy.wizard.unlistedFeaturedHelper }}
        </p>
        <div class="mt-3 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-full py-2 text-sm font-semibold"
            :style="
              unlistedConfirmFeatured
                ? { background: 'var(--theme-primary)', color: '#fff' }
                : { background: 'transparent', color: 'var(--theme-ink)', outline: '1px solid var(--theme-muted)' }
            "
            data-testid="unlisted-featured-yes"
            @click="emit('update:unlistedConfirmFeatured', true)"
          >
            {{ copy.wizard.confirmIngredientYes }}
          </button>
          <button
            type="button"
            class="flex-1 rounded-full py-2 text-sm font-semibold"
            :style="
              !unlistedConfirmFeatured
                ? { background: 'var(--theme-primary)', color: '#fff' }
                : { background: 'transparent', color: 'var(--theme-ink)', outline: '1px solid var(--theme-muted)' }
            "
            data-testid="unlisted-featured-no"
            @click="emit('update:unlistedConfirmFeatured', false)"
          >
            {{ copy.wizard.confirmIngredientNo }}
          </button>
        </div>
      </div>

      <div class="mt-6 flex gap-2">
        <button
          type="button"
          class="flex-1 rounded-full bg-white py-3 text-sm font-semibold shadow-sm"
          style="color: var(--theme-ink)"
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
