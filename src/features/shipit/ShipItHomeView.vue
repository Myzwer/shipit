<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AccountSection from '@/components/shared/AccountSection.vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import GameShell from '@/components/shared/GameShell.vue'
import LeaderboardList from '@/components/shared/LeaderboardList.vue'
import GameRulesPanel from '@/features/shared/GameRulesPanel.vue'
import { fetchShipItHome } from '@/lib/shipit/api'
import { copy, formatCopy } from '@/ui/copy'
import type { MockLeaderboardRow } from '@/types/game'
import type { ShipItCategoryProgress, ShipItHomePayload } from '@/types/shipit'

const router = useRouter()
const loading = ref(true)
const error = ref<string | null>(null)
const payload = ref<ShipItHomePayload | null>(null)

const teamName = computed(() => payload.value?.team.name ?? '—')
const lifecycleStatus = computed(() => payload.value?.lifecycle.status ?? 'unconfigured')

const progressRows = computed(() => {
  const cats = payload.value?.categories ?? []
  const overall = payload.value?.overall
  const rows: Array<ShipItCategoryProgress & { id: string; linkFilter: string }> = cats.map(
    (c) => ({
      ...c,
      id: c.category,
      linkFilter: c.category,
    }),
  )
  if (overall) {
    rows.push({
      id: 'all',
      category: 'classic_ship_landmarks',
      label: copy.home.allChallenges,
      completed: overall.completed,
      total: overall.total,
      points: overall.points,
      linkFilter: 'all',
    })
  }
  return rows
})

const leaderboardRows = computed<MockLeaderboardRow[]>(() =>
  (payload.value?.leaderboard ?? []).map((row) => ({
    id: row.team_id,
    rank: row.rank,
    name: row.team_name,
    members: row.members,
    metricLabel: formatCopy(copy.home.challengesMetric, {
      completedCount: row.completed,
    }),
    points: row.points,
  })),
)

const statusBanner = computed(() => {
  switch (lifecycleStatus.value) {
    case 'unconfigured':
      return copy.home.shipUnconfigured
    case 'pre_cruise':
      return copy.home.shipPreCruise
    case 'finale':
    case 'post_cruise':
      return copy.home.shipFinale
    default:
      return null
  }
})

const showEmptyHint = computed(() => {
  const overall = payload.value?.overall
  return (
    lifecycleStatus.value === 'active' &&
    overall != null &&
    overall.completed === 0
  )
})

function progressPercent(row: { completed: number; total: number }) {
  if (!row.total) return 0
  return Math.round((row.completed / row.total) * 100)
}

async function load() {
  loading.value = true
  error.value = null
  try {
    payload.value = await fetchShipItHome()
  } catch (err) {
    error.value = err instanceof Error ? err.message : copy.home.shipUnavailableDetail
    payload.value = null
  } finally {
    loading.value = false
  }
}

function openChallenges(filter: string) {
  void router.push({
    name: 'shipit-challenges',
    query: filter === 'all' ? undefined : { category: filter },
  })
}

function onVisibility() {
  if (document.visibilityState === 'visible') void load()
}

onMounted(() => {
  void load()
  document.addEventListener('visibilitychange', onVisibility)
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <GameShell
    game="shipit"
    tone="home"
    :show-ship-time="false"
    :title="copy.nav.home"
  >
    <p
      v-if="loading"
      class="px-4 pt-3 text-center text-sm"
      style="color: var(--theme-muted)"
      data-testid="shipit-home-loading"
    >
      {{ copy.home.shipLoading }}
    </p>

    <div
      v-else-if="error"
      class="mx-4 mt-3 rounded-2xl px-4 py-3 text-center text-sm"
      style="background: var(--theme-gradient-warm); color: var(--theme-ink)"
      data-testid="shipit-home-error"
    >
      <p class="font-semibold">{{ copy.home.shipUnavailableTitle }}</p>
      <p class="mt-1" style="color: var(--theme-muted)">{{ error }}</p>
      <button
        type="button"
        class="mt-3 inline-flex rounded-full px-4 py-2 text-sm font-semibold text-white"
        style="background: var(--theme-primary)"
        data-testid="shipit-home-retry"
        @click="load"
      >
        {{ copy.home.retryLoad }}
      </button>
    </div>

    <template v-else-if="payload">
      <p
        v-if="statusBanner"
        class="px-4 pt-3 text-center text-sm font-medium"
        style="color: var(--theme-ink)"
        data-testid="shipit-home-lifecycle"
        :data-lifecycle="lifecycleStatus"
      >
        {{ statusBanner }}
      </p>
      <p
        v-else-if="showEmptyHint"
        class="px-4 pt-3 text-center text-sm"
        style="color: var(--theme-muted)"
        data-testid="shipit-home-empty"
      >
        {{ copy.home.noTeamProgress }}
      </p>

      <section
        class="ship-progress px-4 pt-5"
        :aria-label="formatCopy(copy.home.shipProgress, { teamName })"
        data-testid="shipit-progress"
      >
        <h2 class="ship-progress-title">
          {{ formatCopy(copy.home.shipProgress, { teamName }) }}
        </h2>

        <ul class="mt-3.5 space-y-3">
          <li v-for="row in progressRows" :key="row.id">
            <button
              type="button"
              class="w-full text-left transition hover:opacity-90"
              :data-testid="`shipit-progress-${row.linkFilter}`"
              @click="openChallenges(row.linkFilter)"
            >
              <p class="ship-progress-label">
                {{ row.label }} — {{ row.completed }}/{{ row.total }}
              </p>
              <div class="ship-progress-track mt-1">
                <div
                  class="ship-progress-fill"
                  :style="{ width: `${progressPercent(row)}%` }"
                />
              </div>
              <p class="ship-progress-points mt-0.5">
                <AppIcon name="score.points" style-variant="outline" class="text-[0.72rem]" />
                <span>{{ row.points }}</span>
              </p>
            </button>
          </li>
        </ul>
      </section>

      <section class="mt-6" style="background: var(--theme-gradient-cool)" data-testid="shipit-leaderboard">
        <div class="ui-section-band">
          <h2 class="ui-section-band-title">
            {{ copy.home.shipLeaderboard }}
          </h2>
        </div>
        <div class="px-3 pb-4 pt-3">
          <LeaderboardList
            v-if="leaderboardRows.length"
            :rows="leaderboardRows"
            show-members
            member-separator=" - "
          />
          <p
            v-else
            class="px-2 py-3 text-center text-sm leading-relaxed"
            style="color: var(--theme-ink)"
          >
            {{ copy.home.noTeamProgress }}
          </p>
        </div>
      </section>

      <section class="home-rules" :aria-label="copy.home.howToPlay" data-testid="how-to-play">
        <div class="ui-section-band">
          <h2 class="ui-section-band-title">
            {{ copy.home.howToPlay }}
          </h2>
        </div>
        <div class="px-3 pb-6 pt-4">
          <GameRulesPanel game="shipit" />
          <div class="mt-6">
            <AccountSection show-team surface="mint" />
          </div>
        </div>
      </section>
    </template>
  </GameShell>
</template>

<style scoped>
.ship-progress-title {
  font-family: var(--font-display);
  font-size: clamp(1.35rem, 5.5vw, 1.55rem);
  font-weight: 700;
  line-height: 1.2;
  color: var(--theme-ink);
}

.ship-progress-label {
  font-size: 0.98rem;
  font-weight: 600;
  line-height: 1.35;
  color: var(--theme-ink);
}

.ship-progress-track {
  height: 0.4rem;
  overflow: hidden;
  border-radius: 9999px;
  background: rgba(0, 0, 0, 0.1);
  box-shadow: inset 0 1px 1px rgba(31, 41, 51, 0.06);
}

.ship-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: var(--theme-primary);
}

.ship-progress-points {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.3rem;
  font-size: 0.9rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--theme-ink);
}

.home-rules {
  background: var(--theme-gradient-warm);
  color: var(--theme-ink);
}
</style>
