<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import LeaderboardList from '@/components/shared/LeaderboardList.vue'
import {
  buildLeaderboardRows,
  hasAchievementCounts,
  leaderboardChampions,
  leaderboardModeOptions,
} from '@/lib/wrapped/buildLeaderboardModes'
import type { GameId, MockLeaderboardRow } from '@/types/game'
import type { WrappedLeaderboardRow } from '@/types/wrapped'
import type { WrappedLeaderboardMode } from '@/types/wrappedPlanC'
import type { SemanticIconKey } from '@/ui/icons'

const props = defineProps<{
  game: GameId
  rows: WrappedLeaderboardRow[]
  achievementsById?: Record<string, number>
}>()

const mode = ref<WrappedLeaderboardMode>(props.game === 'drinkit' ? 'points' : 'points')
const showAll = ref(false)

const options = computed(() => {
  const all = leaderboardModeOptions(props.game)
  if (props.game === 'drinkit' && !hasAchievementCounts(props.rows, props.achievementsById)) {
    return all.filter((o) => o.id !== 'achievements')
  }
  return all
})

const ranked = computed(() =>
  buildLeaderboardRows(props.game, props.rows, mode.value, props.achievementsById),
)

const champions = computed(() => leaderboardChampions(ranked.value))

/** Rows beneath the champion highlight (exclude everyone sharing rank 1). */
const standingsRows = computed<MockLeaderboardRow[]>(() => {
  const top = champions.value[0]?.rank
  if (top === undefined) return ranked.value
  return ranked.value.filter((row) => row.rank !== top)
})

const visibleRows = computed<MockLeaderboardRow[]>(() => {
  // Champion + next three (mockup). Expand for full standings.
  if (showAll.value || standingsRows.value.length <= 3) return standingsRows.value
  return standingsRows.value.slice(0, 3)
})

const championValue = computed(() => champions.value[0]?.points ?? 0)
const championNames = computed(() =>
  champions.value.map((c) => c.name).join(' & ') || '—',
)

const championLabel = computed(() =>
  props.game === 'shipit' ? 'The Grand Champions' : 'The Grand Champion',
)

const metricUnderName = computed(
  () => props.game === 'drinkit' || mode.value === 'points',
)

/** Achievements mode uses the award/ribbon icon; Bounties/Points keep the coin. */
const scoreIcon = computed<SemanticIconKey>(() =>
  props.game === 'drinkit' && mode.value === 'achievements'
    ? 'score.achievement'
    : 'score.points',
)

watch(
  () => props.game,
  (game) => {
    mode.value = 'points'
    showAll.value = false
    if (game === 'shipit') mode.value = 'points'
  },
)
</script>

<template>
  <section class="lb" data-testid="wrapped-leaderboard">
    <div class="lb__head">
      <h2 class="lb__title">Leaderboard</h2>
      <div class="lb__toggle" role="tablist" aria-label="Leaderboard ranking">
        <button
          v-for="opt in options"
          :key="opt.id"
          type="button"
          class="lb__toggle-btn"
          :class="{ 'is-active': mode === opt.id }"
          role="tab"
          :aria-selected="mode === opt.id"
          :data-testid="`wrapped-lb-mode-${opt.id}`"
          @click="mode = opt.id"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <div class="lb__champ" data-testid="wrapped-lb-champion">
      <div class="lb__champ-copy">
        <AppIcon name="score.leaderboard" style-variant="solid" class="lb__trophy" />
        <p class="lb__champ-label">{{ championLabel }}</p>
        <p class="lb__champ-name">{{ championNames }}</p>
        <p class="lb__champ-kicker">All Hail.</p>
      </div>
      <div class="lb__champ-score">
        <AppIcon :name="scoreIcon" style-variant="outline" class="lb__champ-icon" />
        <span>{{ championValue.toLocaleString() }}</span>
      </div>
    </div>

    <div class="lb__list">
      <LeaderboardList
        :rows="visibleRows"
        :show-members="game === 'shipit'"
        :metric-under-name="metricUnderName"
        :score-icon="scoreIcon"
        member-separator=" - "
      />
      <button
        v-if="standingsRows.length > 3"
        type="button"
        class="lb__more"
        data-testid="wrapped-lb-show-all"
        @click="showAll = !showAll"
      >
        {{ showAll ? 'Hide Full Standings' : 'Show Full Standings' }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.lb {
  /* One continuous cool aqua band: heading, toggle, champion, standings. */
  background: var(--theme-gradient-cool);
  color: var(--theme-ink);
  padding-bottom: 1.15rem;
}

.lb__head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  width: 100%;
  padding: 1.15rem 1rem 0.95rem;
  background: transparent;
  color: var(--theme-ink);
}

.lb__title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: 0.02em;
  color: var(--theme-ink);
}

.lb__toggle {
  display: inline-flex;
  gap: 0.2rem;
  padding: 0.15rem;
  border-radius: 999px;
  background: transparent;
}

.lb__toggle-btn {
  min-width: 7.5rem;
  min-height: 2.5rem;
  border: 0;
  border-radius: 999px;
  padding: 0.45rem 0.95rem;
  background: transparent;
  color: var(--theme-ink);
  font-size: 0.82rem;
  font-weight: 700;
  opacity: 0.72;
}

.lb__toggle-btn.is-active {
  background: var(--theme-primary);
  color: #fff;
  opacity: 1;
  box-shadow: none;
}

.lb__champ {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  margin: 0 1rem;
  padding: 1rem 1.05rem;
  border-radius: 1rem;
  background: var(--theme-header, #a32660);
  color: #fff;
  box-shadow: 0 6px 14px rgba(20, 40, 50, 0.16);
}

.lb__champ-copy {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.12rem;
}

.lb__trophy {
  font-size: 1.35rem;
  margin-bottom: 0.15rem;
}

.lb__champ-label {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  opacity: 0.92;
}

.lb__champ-name {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.45rem;
  font-weight: 800;
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.lb__champ-kicker {
  margin: 0.1rem 0 0;
  font-size: 0.78rem;
  font-weight: 600;
  opacity: 0.9;
}

.lb__champ-score {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  max-width: 48%;
  font-family: var(--font-display);
  font-size: clamp(1.15rem, 5.5vw, 1.55rem);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}

.lb__champ-icon {
  font-size: 0.95rem;
  flex-shrink: 0;
}

.lb__list {
  width: 100%;
  margin-top: 0.7rem;
  padding: 0 1rem;
  background: transparent;
}

/* Match champion inset; LeaderboardList ships with px-1 for Home. */
.lb__list :deep([data-testid='leaderboard-list']) {
  padding-left: 0;
  padding-right: 0;
}

.lb__list :deep(.ui-card) {
  background: var(--theme-gradient-warm);
  border-radius: 1rem;
  box-shadow: 0 6px 14px rgba(20, 40, 50, 0.1);
}

.lb__more {
  display: block;
  width: 100%;
  margin-top: 0.65rem;
  border: 0;
  border-radius: 999px;
  background: var(--theme-primary);
  padding: 0.7rem 1rem;
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
}
</style>
