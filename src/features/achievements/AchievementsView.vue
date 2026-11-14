<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '@/components/shared/AppIcon.vue'
import GameShell from '@/components/shared/GameShell.vue'
import AchievementCard from '@/features/achievements/AchievementCard.vue'
import AchievementCategoryFilter from '@/features/achievements/AchievementCategoryFilter.vue'
import BarGauntletTracker from '@/features/achievements/BarGauntletTracker.vue'
import {
  fetchAchievementsReadCursor,
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
import {
  cardsForJustUnlockedIds,
  isAwardNewerThanCursor,
  selectJustUnlockedCards,
} from '@/lib/achievements/justUnlocked'
import { useAchievementCelebrationStore } from '@/stores/achievementCelebration'
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
const celebration = useAchievementCelebrationStore()
const route = useRoute()

const view = ref<AchievementView>(route.query.view === 'all' ? 'all' : 'mine')
const filter = ref<AchievementsFilterKey>('all')
const status = ref<'loading' | 'ready' | 'error'>('loading')
/** Full masked catalog from a single `list_achievements('all')` fetch. */
const catalogCards = ref<AchievementCardModel[]>([])
const categories = ref<AchievementCategoryMeta[]>(achievementCategoriesOrdered(props.game))
const gauntlets = ref<BarGauntletSummary[]>([])
const finaleRevealed = ref(false)
/** Account-scoped snapshot used to derive My vs All without extra RPCs. */
let catalogLoadedForGame: GameId | null = null

/**
 * Visit-scoped award IDs for Just Unlocked.
 * Captured once after a successful load (before mark-seen), kept for the whole visit
 * even after the unread cursor advances / data refetches. Cleared on leave.
 */
const justUnlockedAwardIds = ref<string[] | null>(null)
let justUnlockedCapturedForVisit = false

const justUnlockedIdSet = computed(() => {
  const ids = justUnlockedAwardIds.value
  return ids?.length ? new Set(ids) : null
})

const justUnlockedCards = computed(() => {
  const ids = justUnlockedAwardIds.value
  if (!ids?.length) return []
  const cards = cardsForJustUnlockedIds(catalogCards.value, ids)
  if (filter.value === 'all') return cards
  return cards.filter(
    (c) => c.group_key === filter.value || categories.value.some(
      (cat) => (cat.key === filter.value || cat.group_key === filter.value) && cat.group_key === c.group_key,
    ),
  )
})

const justUnlockedCountLabel = computed(() => {
  const n = justUnlockedCards.value.length
  if (n === 1) return copy.achievements.justUnlockedCountSingular
  return formatCopy(copy.achievements.justUnlockedCount, { count: n })
})

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
      excludeAwardIds: justUnlockedIdSet.value ?? undefined,
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

const showEmpty = computed(
  () =>
    status.value === 'ready' &&
    sections.value.length === 0 &&
    !(view.value === 'mine' && justUnlockedCards.value.length > 0),
)

function isJustUnlockedCard(card: AchievementCardModel): boolean {
  return !!(card.award_id && justUnlockedIdSet.value?.has(card.award_id))
}

let loadGeneration = 0

function captureJustUnlockedForVisit(
  cards: AchievementCardModel[],
  cursor: Awaited<ReturnType<typeof fetchAchievementsReadCursor>> | undefined,
) {
  if (justUnlockedCapturedForVisit) return
  justUnlockedCapturedForVisit = true
  const handoffIds = celebration.takeHandoffAwardIds() ?? []

  // Cursor fetch failure must not be treated as "no cursor" (which would dump all awards).
  // Popup handoff IDs can still seed the showcase when present.
  if (cursor === undefined) {
    const fromHandoff = cardsForJustUnlockedIds(cards, handoffIds)
    justUnlockedAwardIds.value = fromHandoff
      .map((c) => c.award_id)
      .filter((id): id is string => !!id)
    return
  }

  const unreadCards = selectJustUnlockedCards(cards, cursor)
  const seen = new Set(unreadCards.map((c) => c.award_id).filter(Boolean) as string[])
  // Reinforce with popup award IDs when they resolve on the earned catalog (no secrets/revoked).
  for (const id of handoffIds) {
    if (seen.has(id)) continue
    const card = cards.find((c) => c.earned && !c.masked && c.award_id === id)
    if (card) {
      unreadCards.push(card)
      seen.add(id)
    }
  }
  justUnlockedAwardIds.value = unreadCards
    .map((c) => c.award_id)
    .filter((id): id is string => !!id)
}

function resetJustUnlockedVisit() {
  justUnlockedCapturedForVisit = false
  justUnlockedAwardIds.value = null
}

async function clearUnreadForLoadedCatalog(gameAtStart: GameId, generation: number) {
  const earned = catalogCards.value.filter((c) => c.earned && c.award_id && c.awarded_at_utc)
  if (earned.length === 0) {
    await unread.refresh(gameAtStart)
    return
  }
  // Newest by (awarded_at instant, award_id) — same order as get_achievements_unread.
  const newest = earned.reduce<(typeof earned)[0] | null>((best, c) => {
    if (!best) return c
    if (!best.awarded_at_utc || !best.award_id) return c
    if (!c.awarded_at_utc || !c.award_id) return best
    return isAwardNewerThanCursor(c.awarded_at_utc, c.award_id, {
      last_seen_award_id: best.award_id,
      last_seen_at_utc: best.awarded_at_utc,
    })
      ? c
      : best
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

async function load() {
  const generation = ++loadGeneration
  const gameAtStart = props.game
  status.value = 'loading'
  try {
    // Catalog + gauntlets + read cursor (cursor before mark-seen so we can snapshot unread).
    const [listRes, gauntletRes, cursor] = await Promise.all([
      listAchievements(gameAtStart, 'all'),
      gameAtStart === 'drinkit'
        ? listDrinkItBarGauntletSummaries().catch(() => ({
            ok: false,
            bars: [] as BarGauntletSummary[],
          }))
        : Promise.resolve({ ok: true, bars: [] as BarGauntletSummary[] }),
      fetchAchievementsReadCursor(gameAtStart).catch(() => undefined),
    ])
    if (generation !== loadGeneration) return
    catalogCards.value = listRes.achievements
    catalogLoadedForGame = gameAtStart
    categories.value = listRes.categories?.length
      ? listRes.categories
      : achievementCategoriesOrdered(gameAtStart)
    gauntlets.value = gauntletRes.bars
    finaleRevealed.value = !!listRes.finale_revealed
    // Capture unread identities before mark_achievements_seen advances the cursor.
    captureJustUnlockedForVisit(listRes.achievements, cursor)
    status.value = 'ready'

    await clearUnreadForLoadedCatalog(gameAtStart, generation)
  } catch {
    if (generation !== loadGeneration) return
    status.value = 'error'
  }
}

onMounted(() => {
  void load()
})

onUnmounted(() => {
  resetJustUnlockedVisit()
})

watch(
  () => props.game,
  (next, prev) => {
    if (next === prev) return
    catalogCards.value = []
    gauntlets.value = []
    catalogLoadedForGame = null
    resetJustUnlockedVisit()
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
        v-else-if="showEmpty"
        class="text-sm opacity-70"
        data-testid="achievements-empty"
      >
        {{ emptyCopy }}
      </p>

      <template v-else>
        <section
          v-if="view === 'mine' && justUnlockedCards.length > 0"
          class="just-unlocked-showcase mb-12"
          data-testid="achievements-just-unlocked"
        >
          <header class="just-unlocked-showcase__header" data-testid="achievements-just-unlocked-header">
            <div class="just-unlocked-showcase__header-main">
              <div class="just-unlocked-showcase__title-row">
                <AppIcon
                  name="status.sparkles"
                  style-variant="solid"
                  class="just-unlocked-showcase__icon"
                />
                <h2
                  class="just-unlocked-showcase__title"
                  data-testid="achievements-just-unlocked-heading"
                >
                  {{ copy.achievements.justUnlockedHeading }}
                </h2>
              </div>
              <p class="just-unlocked-showcase__support">
                {{ copy.achievements.justUnlockedSupport }}
              </p>
            </div>
            <p
              class="just-unlocked-showcase__count"
              data-testid="achievements-just-unlocked-count"
            >
              {{ justUnlockedCountLabel }}
            </p>
          </header>
          <div class="just-unlocked-showcase__body">
            <ul class="just-unlocked-showcase__list">
              <li
                v-for="card in justUnlockedCards"
                :key="card.award_id ?? card.definition_id"
              >
                <AchievementCard :card="card" show-new />
              </li>
            </ul>
          </div>
        </section>

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
                <AchievementCard
                  v-if="item.kind === 'card'"
                  :card="item.card"
                  :show-new="view === 'all' && isJustUnlockedCard(item.card)"
                />
                <BarGauntletTracker v-else :summary="item.summary" />
              </li>
            </template>
          </ul>

          <ul v-else class="space-y-3">
            <li v-for="(item, idx) in section.items" :key="`${section.key}-${idx}`">
              <AchievementCard
                v-if="item.kind === 'card'"
                :card="item.card"
                :show-new="view === 'all' && isJustUnlockedCard(item.card)"
              />
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

<style scoped>
.just-unlocked-showcase {
  overflow: hidden;
  border-radius: var(--theme-card-radius, 1.25rem);
  box-shadow: var(--theme-card-shadow, 0 6px 18px rgba(31, 41, 51, 0.1));
  background: #fff;
}

.just-unlocked-showcase__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1rem 0.9rem;
  background: var(--theme-primary);
  color: #fff;
  border-radius: var(--theme-card-radius, 1.25rem) var(--theme-card-radius, 1.25rem) 0 0;
}

.just-unlocked-showcase__header-main {
  min-width: 0;
  flex: 1;
}

.just-unlocked-showcase__title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.just-unlocked-showcase__icon {
  flex-shrink: 0;
  font-size: 1.05rem;
  line-height: 1;
  opacity: 0.95;
}

.just-unlocked-showcase__title {
  margin: 0;
  font-family: var(--font-display, 'Bricolage Grotesque', ui-sans-serif, system-ui, sans-serif);
  font-size: 1.12rem;
  font-weight: 700;
  line-height: 1.2;
  color: #fff;
}

.just-unlocked-showcase__support {
  margin: 0.35rem 0 0;
  font-size: 0.84rem;
  font-weight: 500;
  line-height: 1.35;
  color: #fff;
  opacity: 0.9;
}

.just-unlocked-showcase__count {
  margin: 0.1rem 0 0;
  flex-shrink: 0;
  border-radius: 999px;
  padding: 0.28rem 0.65rem;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: 0.02em;
  font-variant-numeric: tabular-nums;
  color: var(--theme-primary);
  background: #fff;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.06);
}

.just-unlocked-showcase__body {
  padding: 0.85rem 0.75rem 0.9rem;
  background: #fff;
}

.just-unlocked-showcase__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
</style>
