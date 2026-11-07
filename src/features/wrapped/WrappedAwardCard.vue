<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import { copy } from '@/ui/copy'
import type { WrappedGroupAward } from '@/types/wrapped'
import type { SemanticIconKey } from '@/ui/icons'

const props = defineProps<{
  award: WrappedGroupAward
  tone: 'aqua' | 'cream'
}>()

const winnerNames = computed(() =>
  props.award.winners.map((w) => w.owner_name),
)

const iconName = computed(() => {
  const key = props.award.icon_key
  if (
    key === 'score.leaderboard' ||
    key === 'score.medal' ||
    key === 'score.bar' ||
    key === 'score.team' ||
    key === 'score.achievement'
  ) {
    return key as SemanticIconKey
  }
  return 'score.medal' as SemanticIconKey
})
</script>

<template>
  <article
    class="rounded-2xl px-4 py-4 shadow-sm"
    :style="{
      background:
        tone === 'aqua' ? 'var(--theme-page-alt)' : 'var(--theme-card)',
      color: 'var(--theme-ink)',
    }"
    data-testid="wrapped-award-card"
    :data-award-key="award.stable_key"
    :data-award-status="award.status"
  >
    <div class="flex items-start gap-2">
      <AppIcon :name="iconName" style-variant="outline" class="mt-0.5 text-xl opacity-80" />
      <div class="min-w-0 flex-1">
        <p class="text-xs font-bold uppercase tracking-wide" style="color: var(--theme-muted)">
          {{ award.title }}
          <span v-if="award.test_only" class="ml-1 normal-case tracking-normal opacity-70">
            (test)
          </span>
        </p>

        <template v-if="award.status === 'no_winner' || winnerNames.length === 0">
          <p
            class="font-display mt-2 text-2xl font-bold"
            data-testid="wrapped-award-no-winner"
          >
            {{ copy.wrapped.noWinner }}
          </p>
        </template>
        <template v-else>
          <ul class="mt-2 space-y-1" data-testid="wrapped-award-winners">
            <li
              v-for="name in winnerNames"
              :key="name"
              class="font-display text-2xl font-bold leading-tight break-words"
            >
              {{ name }}
            </li>
          </ul>
          <p
            v-if="award.qualifying_label != null"
            class="mt-2 text-sm font-semibold"
            data-testid="wrapped-award-stat"
          >
            {{ award.qualifying_label }}
          </p>
        </template>

        <p class="mt-2 text-xs leading-snug" style="color: var(--theme-muted)">
          {{ award.quip }}
        </p>
      </div>
    </div>
  </article>
</template>
