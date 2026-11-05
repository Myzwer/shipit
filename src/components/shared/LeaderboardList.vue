<script setup lang="ts">
import AppIcon from '@/components/shared/AppIcon.vue'
import type { MockLeaderboardRow } from '@/types/game'

defineProps<{
  rows: MockLeaderboardRow[]
  showMembers?: boolean
}>()
</script>

<template>
  <ol class="space-y-3 px-1 pb-2">
    <li
      v-for="row in rows"
      :key="row.id"
      class="flex items-start gap-3 rounded-2xl px-4 py-3 shadow-sm"
      style="background: var(--theme-card)"
    >
      <span class="font-display w-6 pt-0.5 text-lg font-bold" style="color: var(--theme-ink)">
        {{ row.rank }}
      </span>
      <div class="min-w-0 flex-1">
        <p class="truncate text-base font-semibold" style="color: var(--theme-ink)">
          {{ row.name }}
        </p>
        <p
          v-if="showMembers && row.members?.length"
          class="mt-0.5 text-sm leading-snug"
          style="color: var(--theme-muted)"
        >
          {{ row.members.join(' · ') }}
        </p>
        <p class="mt-0.5 text-sm" style="color: var(--theme-muted)">
          {{ row.metricLabel }}
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5 pt-0.5 font-semibold" style="color: var(--theme-ink)">
        <AppIcon name="score.leaderboard" style-variant="solid" class="text-sm opacity-80" />
        <span>{{ row.points }}</span>
      </div>
    </li>
  </ol>
</template>
