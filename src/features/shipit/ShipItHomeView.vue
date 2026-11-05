<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AccountSection from '@/components/shared/AccountSection.vue'
import GameShell from '@/components/shared/GameShell.vue'
import LeaderboardList from '@/components/shared/LeaderboardList.vue'
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
  <GameShell game="shipit" :title="copy.nav.home">
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
      style="background: var(--theme-card); color: var(--theme-ink)"
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
        class="px-4 pt-4"
        :aria-label="formatCopy(copy.home.shipProgress, { teamName })"
        data-testid="shipit-progress"
      >
        <h2 class="font-display text-xl font-bold" style="color: var(--theme-ink)">
          {{ formatCopy(copy.home.shipProgress, { teamName }) }}
        </h2>

        <ul class="mt-5 space-y-5">
          <li v-for="row in progressRows" :key="row.id">
            <button
              type="button"
              class="w-full text-left transition hover:opacity-90"
              :data-testid="`shipit-progress-${row.linkFilter}`"
              @click="openChallenges(row.linkFilter)"
            >
              <p class="text-[0.95rem] font-medium leading-snug" style="color: var(--theme-ink)">
                {{ row.label }} — {{ row.completed }}/{{ row.total }}
              </p>
              <div class="mt-2 h-[3px] overflow-hidden rounded-full bg-black/10">
                <div
                  class="h-full rounded-full"
                  :style="{
                    width: `${row.total ? Math.round((row.completed / row.total) * 100) : 0}%`,
                    background: 'var(--theme-primary)',
                  }"
                />
              </div>
              <p class="mt-1.5 text-right text-sm tabular-nums" style="color: var(--theme-ink)">
                {{ row.points }}
              </p>
            </button>
          </li>
        </ul>
      </section>

      <section class="mt-8" style="background: var(--theme-page-alt)" data-testid="shipit-leaderboard">
        <div class="px-4 py-3 text-center text-white" style="background: var(--theme-header)">
          <h2 class="font-display text-sm font-bold tracking-[0.12em] uppercase">
            {{ copy.home.shipLeaderboard }}
          </h2>
        </div>
        <div class="px-3 py-4">
          <LeaderboardList :rows="leaderboardRows" show-members />
        </div>
      </section>

      <section class="px-4 py-6">
        <details class="rounded-2xl px-4 py-3" style="background: var(--theme-card)">
          <summary class="cursor-pointer font-semibold" style="color: var(--theme-ink)">
            {{ copy.home.howToPlay }}
          </summary>
          <div class="mt-2 space-y-3 text-sm leading-relaxed" style="color: var(--theme-muted)">
            <p>{{ copy.shipit.howToPlayBasics }}</p>
            <p>{{ copy.shipit.howToPlayFind }}</p>
            <p>{{ copy.shipit.howToPlayPhotos }}</p>
            <p>{{ copy.shipit.howToPlayPoints }}</p>
            <p>{{ copy.shipit.howToPlayHours }}</p>
          </div>
        </details>

        <AccountSection show-team />
      </section>
    </template>
  </GameShell>
</template>
