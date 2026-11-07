<script setup lang="ts">
import AppIcon from '@/components/shared/AppIcon.vue'
import type { MockLeaderboardRow } from '@/types/game'

defineProps<{
  rows: MockLeaderboardRow[]
  showMembers?: boolean
  /** Join members with this separator. Ship It! mockup uses " - ". */
  memberSeparator?: string
}>()
</script>

<template>
  <ol class="space-y-3 px-1 pb-2" data-testid="leaderboard-list">
    <li
      v-for="row in rows"
      :key="row.id"
      class="ui-card flex items-start gap-3 px-4 py-3.5"
      data-testid="leaderboard-row"
    >
      <span
        class="font-display w-7 shrink-0 pt-0.5 text-xl font-bold tabular-nums"
        style="color: var(--theme-ink)"
      >
        {{ row.rank }}
      </span>

      <div class="min-w-0 flex-1">
        <p class="truncate text-[1.05rem] font-bold leading-snug" style="color: var(--theme-ink)">
          {{ row.name }}
        </p>
        <p
          v-if="showMembers && row.members?.length"
          class="mt-0.5 text-sm leading-snug break-words"
          style="color: var(--theme-ink)"
          data-testid="leaderboard-members"
        >
          {{ row.members.join(memberSeparator ?? ' · ') }}
        </p>
      </div>

      <div class="flex shrink-0 flex-col items-end gap-1 pt-0.5 text-right">
        <div
          class="flex items-center gap-1.5 text-base font-bold tabular-nums"
          style="color: var(--theme-ink)"
        >
          <AppIcon name="score.leaderboard" style-variant="solid" class="text-sm opacity-80" />
          <span>{{ row.points }}</span>
        </div>
        <p class="text-sm" style="color: var(--theme-muted)" data-testid="leaderboard-metric">
          {{ row.metricLabel }}
        </p>
      </div>
    </li>
  </ol>
</template>
