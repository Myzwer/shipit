<script setup lang="ts">
import AppIcon from '@/components/shared/AppIcon.vue'
import type { MockLeaderboardRow } from '@/types/game'
import type { SemanticIconKey } from '@/ui/icons'

withDefaults(
  defineProps<{
    rows: MockLeaderboardRow[]
    showMembers?: boolean
    /** Join members with this separator. Ship It! mockup uses " - ". */
    memberSeparator?: string
    /** Drink It! Home puts the bounty count under the name and the score on the right. */
    metricUnderName?: boolean
    /** Icon beside the score; defaults to the points coin. */
    scoreIcon?: SemanticIconKey
  }>(),
  {
    scoreIcon: 'score.points',
  },
)
</script>

<template>
  <ol
    class="px-1 pb-1"
    :class="metricUnderName || showMembers ? 'space-y-2' : 'space-y-3'"
    data-testid="leaderboard-list"
  >
    <li
      v-for="row in rows"
      :key="row.id"
      class="ui-card flex gap-3"
      :class="
        metricUnderName || showMembers
          ? 'items-center px-3.5 py-2.5'
          : 'items-start px-4 py-3.5'
      "
      data-testid="leaderboard-row"
    >
      <span
        class="shrink-0 tabular-nums"
        :class="
          metricUnderName || showMembers
            ? 'w-7 text-center text-[1.15rem] font-medium leading-none'
            : 'font-display w-6 text-xl font-bold'
        "
        style="color: var(--theme-ink)"
      >
        {{ row.rank }}
      </span>

      <div class="min-w-0 flex-1">
        <p
          class="leading-tight break-words"
          :class="
            metricUnderName || showMembers
              ? 'text-[1.02rem] font-semibold'
              : 'truncate text-[1.05rem] font-bold leading-snug'
          "
          style="color: var(--theme-ink)"
          :title="row.name"
        >
          {{ row.name }}
        </p>
        <p
          v-if="metricUnderName"
          class="mt-0.5 truncate text-[0.7rem] font-normal leading-snug"
          style="color: var(--theme-muted)"
          data-testid="leaderboard-metric"
        >
          {{ row.metricLabel }}
        </p>
        <p
          v-if="showMembers && row.members?.length"
          class="mt-0.5 text-[0.78rem] leading-snug break-words"
          style="color: var(--theme-ink)"
          data-testid="leaderboard-members"
        >
          {{ row.members.join(memberSeparator ?? ' · ') }}
        </p>
      </div>

      <div
        class="flex shrink-0 flex-col items-end text-right"
        :class="metricUnderName || showMembers ? '' : 'gap-1 pt-0.5'"
      >
        <div
          class="flex items-center tabular-nums"
          :class="
            metricUnderName || showMembers
              ? 'gap-1 text-[1.05rem] font-semibold'
              : 'gap-1.5 text-base font-bold'
          "
          style="color: var(--theme-ink)"
        >
          <AppIcon
            :name="scoreIcon"
            style-variant="outline"
            :class="metricUnderName || showMembers ? 'text-[0.8rem]' : 'text-sm opacity-80'"
          />
          <span>{{ row.points }}</span>
        </div>
        <p
          v-if="!metricUnderName"
          class="text-[0.7rem] font-normal leading-snug"
          style="color: var(--theme-muted)"
          data-testid="leaderboard-metric"
        >
          {{ row.metricLabel }}
        </p>
      </div>
    </li>
  </ol>
</template>
