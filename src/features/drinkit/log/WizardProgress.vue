<script setup lang="ts">
export type WizardProgressStep = {
  id: string
  label: string
}

const props = defineProps<{
  steps: WizardProgressStep[]
  step: string
  completed: Set<string>
  locked?: boolean
  ariaLabel?: string
}>()

const emit = defineEmits<{
  select: [step: string]
}>()

function stepIndex(id: string) {
  return props.steps.findIndex((s) => s.id === id)
}
</script>

<template>
  <nav
    class="wizard-progress"
    :style="{ '--wizard-progress-cols': String(steps.length) }"
    :aria-label="ariaLabel ?? 'Log progress'"
    data-testid="wizard-progress"
  >
    <button
      v-for="s in steps"
      :key="s.id"
      type="button"
      :disabled="locked || (s.id !== step && !completed.has(s.id))"
      :data-testid="`wizard-step-${s.id}`"
      :data-active="s.id === step ? 'true' : 'false'"
      :data-done="stepIndex(s.id) < stepIndex(step) ? 'true' : 'false'"
      @click="emit('select', s.id)"
    >
      {{ s.label }}
    </button>
  </nav>
</template>
