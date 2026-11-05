<script setup lang="ts">
import { copy } from '@/ui/copy'

defineProps<{
  caption: string
}>()

const emit = defineEmits<{
  'update:caption': [value: string]
  continue: []
}>()
</script>

<template>
  <section data-testid="wizard-photo-step" class="px-4 pb-28">
    <h2 class="font-display text-xl font-bold" style="color: var(--theme-ink)">
      {{ copy.wizard.photoHeading }}
    </h2>
    <p class="mt-2 text-sm" style="color: var(--theme-muted)">{{ copy.wizard.photoOptional }}</p>

    <div
      class="mt-6 rounded-2xl px-4 py-6 text-center"
      style="background: var(--theme-card); color: var(--theme-ink)"
      data-testid="photo-unavailable"
    >
      <p class="font-semibold">{{ copy.wizard.photoUnavailableTitle }}</p>
      <p class="mt-2 text-sm" style="color: var(--theme-muted)">
        {{ copy.wizard.photoUnavailableBody }}
      </p>
    </div>

    <label class="mt-6 block text-sm font-semibold" style="color: var(--theme-ink)">
      {{ copy.wizard.captionLabel }}
      <textarea
        :value="caption"
        rows="3"
        class="mt-1 w-full resize-none rounded-2xl px-4 py-3 font-normal outline-none"
        style="background: var(--theme-card)"
        :placeholder="copy.wizard.captionPlaceholder"
        data-testid="caption-input"
        @input="emit('update:caption', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>

    <button
      type="button"
      class="mt-6 w-full rounded-full py-3 text-sm font-semibold text-white"
      style="background: var(--theme-primary)"
      data-testid="photo-continue"
      @click="emit('continue')"
    >
      {{ copy.wizard.photoContinue }}
    </button>
  </section>
</template>
