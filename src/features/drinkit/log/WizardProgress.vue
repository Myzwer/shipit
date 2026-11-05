<script setup lang="ts">
import { copy } from '@/ui/copy'
import type { WizardStep } from '@/types/drinkLog'

defineProps<{
  step: WizardStep
  completed: Set<WizardStep>
  locked?: boolean
}>()

const emit = defineEmits<{
  select: [step: WizardStep]
}>()

const steps: WizardStep[] = ['bar', 'drink', 'friends', 'photo', 'review']
</script>

<template>
  <nav
    class="flex items-center justify-between gap-1 px-2 py-3"
    aria-label="Log progress"
    data-testid="wizard-progress"
  >
    <button
      v-for="s in steps"
      :key="s"
      type="button"
      class="min-w-0 flex-1 rounded-lg px-1 py-2 text-center text-[11px] font-semibold uppercase tracking-wide transition"
      :class="
        s === step
          ? 'text-white'
          : completed.has(s)
            ? 'opacity-90'
            : 'opacity-45'
      "
      :style="
        s === step
          ? { background: 'var(--theme-primary)', color: '#fff' }
          : { color: 'var(--theme-ink)' }
      "
      :disabled="locked || (s !== step && !completed.has(s))"
      :data-testid="`wizard-step-${s}`"
      :data-active="s === step ? 'true' : 'false'"
      @click="emit('select', s)"
    >
      {{ copy.wizard.steps[s] }}
    </button>
  </nav>
</template>
