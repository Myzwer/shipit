<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<template>
  <header
    class="sticky top-0 z-20 flex min-h-[3.35rem] items-center justify-center px-4 text-center text-white"
    style="
      background: var(--theme-header);
      padding-top: max(0.85rem, env(safe-area-inset-top));
      padding-bottom: 0.85rem;
    "
    data-testid="section-header"
  >
    <h1 class="font-display text-[0.95rem] font-bold tracking-[0.16em] uppercase sm:text-base">
      {{ title }}
    </h1>
    <div
      class="absolute right-3 flex items-center gap-2"
      style="top: calc(50% + env(safe-area-inset-top, 0px) / 2); transform: translateY(-50%)"
    >
      <slot name="actions" />
    </div>
  </header>
</template>
