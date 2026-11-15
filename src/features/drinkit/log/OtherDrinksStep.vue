<script setup lang="ts">
import AppIcon from '@/components/shared/AppIcon.vue'
import { otherDrinksGrouped, type OtherDrinksOption } from '@/lib/drinkLog/otherDrinks'
import { copy } from '@/ui/copy'

const groups = otherDrinksGrouped()

defineEmits<{
  select: [option: OtherDrinksOption]
  back: []
}>()
</script>

<template>
  <section data-testid="wizard-other-drinks-step" class="px-4 pb-32 pt-3">
    <h2 class="wizard-prompt">{{ copy.wizard.otherDrinksPrompt }}</h2>
    <p class="mt-2 text-sm" style="color: var(--theme-muted)">
      {{ copy.wizard.otherDrinksIntro }}
    </p>

    <div class="mt-4 space-y-5">
      <div v-for="group in groups" :key="group.section" :data-testid="`other-drinks-section-${group.section}`">
        <h3
          class="mb-2 text-xs font-semibold uppercase tracking-wide"
          style="color: var(--theme-muted)"
        >
          {{ group.sectionLabel }}
        </h3>
        <ul class="space-y-2.5">
          <li v-for="option in group.options" :key="option.id">
            <button
              type="button"
              class="wizard-choice"
              :data-testid="`other-drink-${option.id}`"
              @click="$emit('select', option)"
            >
              <AppIcon name="theme.drink-it" class="wizard-choice-icon text-[1.05rem]" />
              <span class="wizard-choice-title ui-display-name">{{ option.label }}</span>
              <AppIcon name="action.next" class="wizard-choice-arrow" />
            </button>
          </li>
        </ul>
      </div>
    </div>

    <button
      type="button"
      class="mt-6 w-full rounded-full bg-white py-3 text-sm font-semibold shadow-sm"
      style="color: var(--theme-ink)"
      data-testid="other-drinks-back"
      @click="$emit('back')"
    >
      {{ copy.wizard.back }}
    </button>
  </section>
</template>
