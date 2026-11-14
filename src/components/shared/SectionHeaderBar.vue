<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string
    /** Drink It! Home uses the mockup's shorter magenta bar. */
    compact?: boolean
    /** Other screens keep the bar pinned. Drink It! Home scrolls it with the page. */
    pinned?: boolean
  }>(),
  { pinned: true },
)
</script>

<template>
  <header
    class="flex items-center justify-center px-4 text-center text-white"
    :class="[
      pinned ? 'sticky top-0 z-20' : 'relative',
      compact ? 'min-h-[4.25rem]' : 'min-h-[3.35rem]',
    ]"
    :style="
      compact
        ? {
            background: 'var(--theme-header)',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            minHeight: 'calc(4.25rem + env(safe-area-inset-top, 0px))',
          }
        : {
            background: 'var(--theme-header)',
            paddingTop: 'max(0.85rem, env(safe-area-inset-top))',
            paddingBottom: '0.85rem',
          }
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
