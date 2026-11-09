<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import GameShell from '@/components/shared/GameShell.vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import AchievementCard from '@/features/achievements/AchievementCard.vue'
import AchievementCategoryFilter from '@/features/achievements/AchievementCategoryFilter.vue'
import BarGauntletTracker from '@/features/achievements/BarGauntletTracker.vue'
import {
  listAchievements,
  listDrinkItBarGauntletSummaries,
  markAchievementsSeen,
} from '@/lib/achievements/api'
import {
  composeAllSections,
  composeMineSections,
  overallAchievementCounts,
  type AchievementsFilterKey,
} from '@/lib/achievements/composeAchievementsView'
import { achievementCategoriesOrdered } from '@/lib/achievements/categories'
import { useAchievementsUnreadStore } from '@/stores/achievementsUnread'
import type {
  AchievementCard as AchievementCardModel,
  AchievementCategoryMeta,
  AchievementView,
  BarGauntletSummary,
} from '@/types/achievements'
import type { GameId } from '@/types/game'
import { copy, formatCopy } from '@/ui/copy'

const props = defineProps<{
  game: GameId
}>()

const unread = useAchievementsUnreadStore()
const route = useRoute()

const view = ref<AchievementView>(route.query.view === 'all' ? 'all' : 'mine')
const filter = ref<AchievementsFilterKey>('all')
const status = ref<'loading' | 'ready' | 'error'>('loading')
const refreshing = ref(false)
/** Full masked catalog from a single `list_achievements('all')` fetch. */
const catalogCards = ref<AchievementCardModel[]>([])
const categories = ref<AchievementCategoryMeta[]>(achievementCategoriesOrdered())
const gauntlets = ref<BarGauntletSummary[]>([])
const finaleRevealed = ref(false)
/** Account-scoped snapshot used to derive My vs All without extra RPCs. */
let catalogLoadedForGame: GameId | null = null

const overall = computed(() => overallAchievementCounts(catalogCards.value))
const overallPct = computed(() => {
  if (!overall.value.total) return 0
  return Math.min(100, Math.round((overall.value.earned / overall.value.total) * 100))
})

const filterOptions = computed(() => [
  { key: 'all' as const, label: copy.achievements.filterAll },
  ...categories.value.map((c) => ({ key: c.key, label: c.name })),
])

const sections = computed(() => {
  if (view.value === 'mine') {
    return composeMineSections({
      cards: catalogCards.value,
      filter: filter.value,
      categories: categories.value,
    })
  }
  return composeAllSections({
    cards: catalogCards.value,
    gauntlets: props.game === 'drinkit' ? gauntlets.value : [],
    filter: filter.value,
    categories: categories.value,
    onAnomaly: (message, detail) => {
      console.warn('[achievements]', message, detail)
    },
  })
})

const emptyCopy = computed(() =>
  view.value === 'mine' ? copy.achievements.emptyMine : copy.achievements.emptyAll,
)

let loadGeneration = 0

async function clearUnreadForLoadedCatalog(gameAtStart: GameId, generation: number) {
  const earned = catalogCards.value.filter((c) => c.earned && c.award_id && c.awarded_at_utc)
  if (earned.length === 0) {
    await unread.refresh(gameAtStart)
    return
  }
  const newest = earned.reduce<(typeof earned)[0] | null>((best, c) => {
    if (!best) return c
    if (!best.awarded_at_utc) return c
    if (!c.awarded_at_utc) return best
    return c.awarded_at_utc > best.awarded_at_utc ? c : best
  }, null)
  if (newest?.award_id && newest.awarded_at_utc) {
    try {
      await markAchievementsSeen(gameAtStart, newest.award_id, newest.awarded_at_utc)
      if (generation !== loadGeneration) return
      await unread.refresh(gameAtStart)
      if (generation !== loadGeneration) return
      unread.setUnread(gameAtStart, false)
    } catch {
      if (generation !== loadGeneration) return
      await unread.refresh(gameAtStart)
    }
  } else {
    await unread.refresh(gameAtStart)
  }
}

async function load(opts?: { soft?: boolean }) {
  const generation = ++loadGeneration
  const gameAtStart = props.game
  if (opts?.soft) refreshing.value = true
  else status.value = 'loading'
  try {
    // One secure masked catalog + lightweight gauntlet summaries.
    // My / All are local presentation filters over the same result.
    const [listRes, gauntletRes] = await Promise.all([
      listAchievements(gameAtStart, 'all'),
      gameAtStart === 'drinkit'
        ? listDrinkItBarGauntletSummaries().catch(() => ({
            ok: false,
            bars: [] as BarGauntletSummary[],
          }))
        : Promise.resolve({ ok: true, bars: [] as BarGauntletSummary[] }),
    ])
    if (generation !== loadGeneration) return
    catalogCards.value = listRes.achievements
    catalogLoadedForGame = gameAtStart
    categories.value = listRes.categories?.length
      ? listRes.categories
      : achievementCategoriesOrdered()
    gauntlets.value = gauntletRes.bars
    finaleRevealed.value = !!listRes.finale_revealed
    status.value = 'ready'

    await clearUnreadForLoadedCatalog(gameAtStart, generation)
  } catch {
    if (generation !== loadGeneration) return
    status.value = 'error'
  } finally {
    if (generation === loadGeneration) refreshing.value = false
  }
}

onMounted(() => {
  void load()
})

watch(
  () => props.game,
  (next, prev) => {
    if (next === prev) return
    catalogCards.value = []
    gauntlets.value = []
    catalogLoadedForGame = null
    void load()
  },
)

function setView(next: AchievementView) {
  if (view.value === next) return
  view.value = next
  // Local filter only — no RPC. Soft-refresh if catalog was never loaded.
  if (catalogLoadedForGame !== props.game || status.value !== 'ready') {
    void load()
  }
}
</script>

<template>
  <GameShell
    :game="game"
    :title="copy.achievements.heading"
    :show-ship-time="false"
  >
    <template #header-actions>
      <button
        type="button"
        class="inline-flex h-11 w-11 items-center justify-center rounded-full text-white transition hover:bg-white/10 disabled:opacity-60"
        :aria-label="copy.achievements.refresh"
        data-testid="achievements-refresh"
        :disabled="refreshing || status === 'loading'"
        @click="load({ soft: true })"
      >
        <AppIcon
          name="action.retry"
          class="text-xl"
          :class="refreshing ? 'animate-spin' : ''"
        />
      </button>
    </template>

    <div class="pb-28 pt-4" data-testid="achievements-view" :data-game="game">
      <div class="mb-3" data-testid="achievements-overall">
        <p class="text-sm font-semibold" style="color: var(--theme-ink)">
          {{
            formatCopy(copy.achievements.overallProgress, {
              earned: overall.earned,
              total: overall.total,
            })
          }}
        </p>
        <div
          class="mt-2 h-2.5 overflow-hidden rounded-full"
          style="background: rgba(163, 38, 96, 0.18)"
        >
          <div
            class="h-full rounded-full transition-all"
            style="background: var(--theme-accent)"
            :style="{ width: `${overallPct}%` }"
            data-testid="achievements-overall-bar"
          />
        </div>
      </div>

      <div
        class="mb-3 flex rounded-full p-1"
        style="background: var(--theme-gradient-cool)"
        role="tablist"
        :aria-label="copy.achievements.heading"
      >
        <button
          type="button"
          role="tab"
          class="flex-1 rounded-full px-3 py-2.5 text-sm font-semibold transition"
          :class="view === 'mine' ? 'text-white' : ''"
          :style="
            view === 'mine'
              ? { background: 'var(--theme-primary)', color: '#fff' }
              : { color: 'var(--theme-ink)', opacity: 0.75 }
          "
          :aria-selected="view === 'mine'"
          data-testid="achievements-tab-mine"
          @click="setView('mine')"
        >
          {{ copy.achievements.myAchievements }}
        </button>
        <button
          type="button"
          role="tab"
          class="flex-1 rounded-full px-3 py-2.5 text-sm font-semibold transition"
          :class="view === 'all' ? 'text-white' : ''"
          :style="
            view === 'all'
              ? { background: 'var(--theme-primary)', color: '#fff' }
              : { color: 'var(--theme-ink)', opacity: 0.75 }
          "
          :aria-selected="view === 'all'"
          data-testid="achievements-tab-all"
          @click="setView('all')"
        >
          {{ copy.achievements.allAchievements }}
        </button>
      </div>

      <AchievementCategoryFilter v-model="filter" :options="filterOptions" />

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
          @click="load()"
        >
          {{ copy.achievements.retry }}
        </button>
      </div>

      <p
        v-else-if="sections.length === 0"
        class="text-sm opacity-70"
        data-testid="achievements-empty"
      >
        {{ emptyCopy }}
      </p>

      <template v-else>
        <section
          v-for="section in sections"
          :key="section.key"
          class="mb-6"
          :data-testid="`achievements-group-${section.key}`"
        >
          <div class="mb-2 flex items-baseline justify-between gap-3">
            <h2 class="text-base font-bold" style="color: var(--theme-ink)">
              {{ section.label }}
            </h2>
            <p
              class="text-sm font-semibold tabular-nums opacity-80"
              style="color: var(--theme-ink)"
              data-testid="achievements-category-count"
            >
              {{ section.earned }}/{{ section.total }}
            </p>
          </div>

          <ul
            v-if="section.children?.length"
            class="space-y-3"
            data-testid="achievements-bar-gauntlets-list"
          >
            <template v-for="child in section.children" :key="child.key">
              <li
                v-for="(item, idx) in child.items"
                :key="`${child.key}-${idx}`"
                :data-testid="`achievements-bar-${child.key}`"
              >
                <AchievementCard v-if="item.kind === 'card'" :card="item.card" />
                <BarGauntletTracker v-else :summary="item.summary" />
              </li>
            </template>
          </ul>

          <ul v-else class="space-y-3">
            <li v-for="(item, idx) in section.items" :key="`${section.key}-${idx}`">
              <AchievementCard v-if="item.kind === 'card'" :card="item.card" />
              <BarGauntletTracker v-else :summary="item.summary" />
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
