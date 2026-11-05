<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <header
    class="sticky top-0 z-20 flex items-center justify-center px-4 py-3 text-center text-white"
    style="background: var(--theme-header); padding-top: max(0.75rem, env(safe-area-inset-top))"
  >
    <h1 class="font-display text-lg font-bold tracking-[0.08em] uppercase">
      {{ title }}
    </h1>
    <div class="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
      <slot name="actions" />
    </div>
  </header>
</template>
