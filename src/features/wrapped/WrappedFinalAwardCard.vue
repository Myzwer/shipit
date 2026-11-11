<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import { copy } from '@/ui/copy'
import type { WrappedAwardCardModel } from '@/types/wrapped'
import type { SemanticIconKey } from '@/ui/icons'

const props = defineProps<{
  card: WrappedAwardCardModel
}>()

const expanded = ref(false)
const hasExpand = computed(
  () =>
    (props.card.expandableNames?.length ?? 0) > 0 ||
    (props.card.items?.length ?? 0) > 4,
)

const visibleItems = computed(() => {
  const items = props.card.items ?? []
  if (expanded.value || items.length <= 4) return items
  return items.slice(0, 4)
})

const iconName = computed(() => {
  const key = props.card.icon
  if (
    key === 'score.leaderboard' ||
    key === 'score.medal' ||
    key === 'score.bar' ||
    key === 'score.team' ||
    key === 'score.achievement' ||
    key === 'score.calendar' ||
    key === 'score.friends' ||
    key === 'theme.drink-it'
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
        card.tone === 'aqua' ? 'var(--theme-gradient-cool)' : 'var(--theme-gradient-warm)',
      color: 'var(--theme-ink)',
    }"
    data-testid="wrapped-award-card"
    :data-award-key="card.key"
    :data-award-status="card.available ? 'awarded' : 'no_winner'"
  >
    <div class="flex items-start gap-2">
      <AppIcon :name="iconName" style-variant="outline" class="mt-0.5 text-xl opacity-80" />
      <div class="min-w-0 flex-1">
        <p class="text-xs font-bold uppercase tracking-wide" style="color: var(--theme-muted)">
          {{ card.title }}
        </p>

        <p
          class="font-display mt-2 text-2xl font-bold leading-tight break-words"
          data-testid="wrapped-award-primary"
        >
          {{ card.available ? card.primary : card.primary || copy.wrapped.noQualifyingData }}
        </p>

        <p
          v-if="card.secondary"
          class="mt-2 text-sm font-semibold"
          data-testid="wrapped-award-stat"
        >
          {{ card.secondary }}
        </p>

        <ul
          v-if="visibleItems.length"
          class="mt-3 space-y-1.5"
          data-testid="wrapped-award-items"
        >
          <li
            v-for="(item, idx) in visibleItems"
            :key="`${item.label}-${idx}`"
            class="text-sm leading-snug"
          >
            <span class="font-semibold break-words">{{ item.label }}</span>
            <span
              v-if="item.detail"
              class="block text-xs"
              style="color: var(--theme-muted)"
            >
              {{ item.detail }}
            </span>
          </li>
        </ul>

        <button
          v-if="hasExpand"
          type="button"
          class="mt-2 text-xs font-semibold underline"
          style="color: var(--theme-primary)"
          @click="expanded = !expanded"
        >
          {{ expanded ? copy.wrapped.hideTies : copy.wrapped.showAllTies }}
        </button>

        <ul
          v-if="expanded && card.expandableNames?.length"
          class="mt-2 space-y-0.5 text-sm"
        >
          <li v-for="name in card.expandableNames" :key="name" class="break-words">
            {{ name }}
          </li>
        </ul>

        <p
          v-if="card.copy"
          class="mt-2 text-xs leading-snug"
          style="color: var(--theme-muted)"
        >
          {{ card.copy }}
        </p>
      </div>
    </div>
  </article>
</template>
