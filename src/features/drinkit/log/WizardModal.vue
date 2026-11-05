<script setup lang="ts">
defineProps<{
  title: string
  body: string
  primaryLabel: string
  secondaryLabel?: string
  testId?: string
}>()

const emit = defineEmits<{
  primary: []
  secondary: []
}>()
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-4 pb-8 sm:items-center"
    role="dialog"
    aria-modal="true"
    :data-testid="testId ?? 'wizard-modal'"
  >
    <div
      class="w-full max-w-sm rounded-3xl px-5 py-5 shadow-xl"
      style="background: var(--theme-card); color: var(--theme-ink)"
    >
      <h2 class="font-display text-lg font-bold">{{ title }}</h2>
      <p class="mt-2 text-sm" style="color: var(--theme-muted)">{{ body }}</p>
      <div class="mt-5 flex flex-col gap-2">
        <button
          type="button"
          class="rounded-full py-3 text-sm font-semibold text-white"
          style="background: var(--theme-primary)"
          data-testid="modal-primary"
          @click="emit('primary')"
        >
          {{ primaryLabel }}
        </button>
        <button
          v-if="secondaryLabel"
          type="button"
          class="rounded-full py-3 text-sm font-semibold"
          style="background: transparent; color: var(--theme-ink)"
          data-testid="modal-secondary"
          @click="emit('secondary')"
        >
          {{ secondaryLabel }}
        </button>
      </div>
    </div>
  </div>
</template>
