<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import GameShell from '@/components/shared/GameShell.vue'
import { listAchievements, markAchievementsSeen } from '@/lib/achievements/api'
import { useAchievementsUnreadStore } from '@/stores/achievementsUnread'
import type { AchievementCard, AchievementGroup, AchievementView } from '@/types/achievements'
import type { GameId } from '@/types/game'
import { copy, formatCopy } from '@/ui/copy'

const props = defineProps<{
  game: GameId
}>()

const unread = useAchievementsUnreadStore()
const route = useRoute()

const view = ref<AchievementView>(
  route.query.view === 'all' ? 'all' : 'mine',
)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const cards = ref<AchievementCard[]>([])
const finaleRevealed = ref(false)

const groups: AchievementGroup[] = ['milestones', 'firsts', 'other']

const groupLabel = (g: AchievementGroup) => {
  if (g === 'milestones') return copy.achievements.milestones
  if (g === 'firsts') return copy.achievements.firsts
  return copy.achievements.other
}

const grouped = computed(() => {
  if (view.value === 'mine') return null
  return groups
    .map((g) => ({
      key: g,
      label: groupLabel(g),
      items: cards.value.filter((c) => c.group_key === g),
    }))
    .filter((g) => g.items.length > 0)
})

const emptyCopy = computed(() =>
  view.value === 'mine' ? copy.achievements.emptyMine : copy.achievements.emptyAll,
)

async function load() {
  status.value = 'loading'
  try {
    const res = await listAchievements(props.game, view.value)
    cards.value = res.achievements
    finaleRevealed.value = !!res.finale_revealed
    status.value = 'ready'

    if (view.value === 'mine' && cards.value.length > 0) {
      const newest = cards.value.reduce<(typeof cards.value)[0] | null>((best, c) => {
        if (!c.award_id || !c.awarded_at_utc) return best
        if (!best) return c
        if (!best.awarded_at_utc) return c
        return c.awarded_at_utc > best.awarded_at_utc ? c : best
      }, null)
      if (newest?.award_id && newest.awarded_at_utc) {
        try {
          await markAchievementsSeen(props.game, newest.award_id, newest.awarded_at_utc)
        } catch {
          /* cursor optional on load failure path */
        }
      }
    }
    // Refresh after mark so a parallel nav poll cannot resurrect a stale unread bit.
    await unread.refresh(props.game)
    if (view.value === 'mine') unread.setUnread(props.game, false)
  } catch {
    status.value = 'error'
  }
}

onMounted(() => {
  void load()
})

watch(
  () => [props.game, view.value] as const,
  () => {
    void load()
  },
)

function stateLabel(card: AchievementCard) {
  if (card.earned) return copy.achievements.earned
  if (card.exclusive_claimed && card.exclusive_owner_name) {
    return formatCopy(copy.achievements.claimedBy, { name: card.exclusive_owner_name })
  }
  return copy.achievements.unearned
}
</script>

<template>
  <GameShell :game="game" :title="copy.achievements.heading">
    <div class="px-4 pb-28 pt-4" data-testid="achievements-view" :data-game="game">
      <div
        class="mb-4 flex rounded-full p-1"
        style="background: var(--theme-card)"
        role="tablist"
        :aria-label="copy.achievements.heading"
      >
        <button
          type="button"
          role="tab"
          class="flex-1 rounded-full px-3 py-2 text-sm font-semibold transition"
          :class="view === 'mine' ? 'text-white' : 'opacity-70'"
          :style="view === 'mine' ? { background: 'var(--theme-nav)' } : undefined"
          :aria-selected="view === 'mine'"
          data-testid="achievements-tab-mine"
          @click="view = 'mine'"
        >
          {{ copy.achievements.myAchievements }}
        </button>
        <button
          type="button"
          role="tab"
          class="flex-1 rounded-full px-3 py-2 text-sm font-semibold transition"
          :class="view === 'all' ? 'text-white' : 'opacity-70'"
          :style="view === 'all' ? { background: 'var(--theme-nav)' } : undefined"
          :aria-selected="view === 'all'"
          data-testid="achievements-tab-all"
          @click="view = 'all'"
        >
          {{ copy.achievements.allAchievements }}
        </button>
      </div>

      <p v-if="status === 'loading'" class="text-sm opacity-70" data-testid="achievements-loading">
        {{ copy.achievements.loading }}
      </p>

      <div v-else-if="status === 'error'" class="space-y-3" data-testid="achievements-error">
        <p class="font-semibold" style="color: var(--theme-ink)">
          {{ copy.achievements.loadFailedTitle }}
        </p>
        <p class="text-sm opacity-70">{{ copy.achievements.loadFailedDetail }}</p>
        <button
          type="button"
          class="rounded-xl px-4 py-2 text-sm font-semibold text-white"
          style="background: var(--theme-nav)"
          data-testid="achievements-retry"
          @click="load"
        >
          {{ copy.achievements.retry }}
        </button>
      </div>

      <p
        v-else-if="cards.length === 0"
        class="text-sm opacity-70"
        data-testid="achievements-empty"
      >
        {{ emptyCopy }}
      </p>

      <template v-else-if="view === 'mine'">
        <ul class="space-y-3" data-testid="achievements-mine-list">
          <li
            v-for="card in cards"
            :key="card.definition_id"
            class="rounded-2xl px-4 py-3"
            style="background: var(--theme-card); color: var(--theme-ink)"
            data-testid="achievement-card"
            :data-stable-key="card.stable_key"
            :data-earned="card.earned"
          >
            <p class="text-xs font-semibold uppercase tracking-wide opacity-60">
              {{ stateLabel(card) }}
            </p>
            <p class="mt-1 text-lg font-semibold">{{ card.title }}</p>
            <p class="mt-1 text-sm opacity-80">{{ card.description }}</p>
          </li>
        </ul>
      </template>

      <template v-else>
        <section
          v-for="group in grouped"
          :key="group.key"
          class="mb-6"
          :data-testid="`achievements-group-${group.key}`"
        >
          <h2 class="mb-2 text-sm font-semibold uppercase tracking-wide opacity-70">
            {{ group.label }}
          </h2>
          <ul class="space-y-3">
            <li
              v-for="card in group.items"
              :key="card.definition_id"
              class="rounded-2xl px-4 py-3"
              style="background: var(--theme-card); color: var(--theme-ink)"
              data-testid="achievement-card"
              :data-stable-key="card.stable_key"
              :data-earned="card.earned"
              :data-masked="card.masked"
            >
              <p class="text-xs font-semibold uppercase tracking-wide opacity-60">
                {{ stateLabel(card) }}
              </p>
              <p class="mt-1 text-lg font-semibold">{{ card.title }}</p>
              <p class="mt-1 text-sm opacity-80">{{ card.description }}</p>
              <p
                v-if="card.progress && !card.earned"
                class="mt-2 text-sm font-semibold"
                data-testid="achievement-progress"
              >
                {{
                  formatCopy(copy.achievements.progress, {
                    current: card.progress.current,
                    target: card.progress.target,
                  })
                }}
              </p>
            </li>
          </ul>
        </section>
      </template>

      <p
        v-if="finaleRevealed && status === 'ready'"
        class="mt-4 text-xs opacity-50"
        data-testid="achievements-finale-note"
      >
        Finale reveal active
      </p>
    </div>
  </GameShell>
</template>
