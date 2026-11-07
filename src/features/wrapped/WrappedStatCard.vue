<script setup lang="ts">
import AppIcon from '@/components/shared/AppIcon.vue'
import type { WrappedStatCard } from '@/types/wrapped'
import type { SemanticIconKey } from '@/ui/icons'

defineProps<{
  card: WrappedStatCard
}>()
</script>

<template>
  <article
    class="flex min-h-[9.5rem] flex-col rounded-2xl px-3 py-3 shadow-sm"
    :style="{
      background:
        card.tone === 'aqua' ? 'var(--theme-page-alt)' : 'var(--theme-card)',
      color: 'var(--theme-ink)',
    }"
    data-testid="wrapped-stat-card"
    :data-stat-key="card.key"
  >
    <template v-if="card.kind === 'named'">
      <span
        class="inline-flex w-fit rounded-md px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-white"
        style="background: var(--theme-accent)"
      >
        {{ card.chip }}
      </span>
      <p class="font-display mt-2 text-2xl font-bold leading-tight break-words">
        {{ card.value }}
      </p>
      <p class="mt-1 text-xs font-semibold" style="color: var(--theme-muted)">
        {{ card.label }}
      </p>
      <p class="mt-auto pt-2 text-xs leading-snug" style="color: var(--theme-muted)">
        {{ card.copy }}
      </p>
    </template>
    <template v-else>
      <AppIcon
        :name="card.icon as SemanticIconKey"
        style-variant="outline"
        class="text-lg opacity-80"
      />
      <p
        class="font-display mt-1 text-4xl font-bold leading-none tabular-nums"
        data-testid="wrapped-stat-value"
      >
        {{ card.value }}
      </p>
      <p class="mt-1 text-sm font-semibold">{{ card.label }}</p>
      <p class="mt-auto pt-2 text-xs leading-snug" style="color: var(--theme-muted)">
        {{ card.copy }}
      </p>
    </template>
  </article>
</template>
