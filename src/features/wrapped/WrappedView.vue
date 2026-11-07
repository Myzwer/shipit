<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import GameShell from '@/components/shared/GameShell.vue'
import LeaderboardList from '@/components/shared/LeaderboardList.vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import WrappedStatCard from '@/features/wrapped/WrappedStatCard.vue'
import WrappedAwardCard from '@/features/wrapped/WrappedAwardCard.vue'
import { fetchMyWrapped, revealMyWrapped, WrappedApiError } from '@/lib/wrapped/api'
import {
  buildDrinkItStatCards,
  buildShipItStatCards,
} from '@/lib/wrapped/buildStatCards'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { copy } from '@/ui/copy'
import type { GameId, MockLeaderboardRow } from '@/types/game'
import type {
  DrinkItPersonalStats,
  ShipItTeamStats,
  WrappedPayload,
} from '@/types/wrapped'

const props = defineProps<{
  game: GameId
}>()

const router = useRouter()
const awardsMode = useAwardsModeStore()

const status = ref<'loading' | 'ready' | 'error' | 'not_available'>('loading')
const errorMessage = ref<string | null>(null)
const payload = ref<WrappedPayload | null>(null)
const revealing = ref(false)
const justRevealed = ref(false)
const preferReducedMotion = ref(false)

const revealed = computed(() => Boolean(payload.value?.revealed))

const personalHeading = computed(() =>
  props.game === 'drinkit' ? copy.wrapped.yourWeek : copy.wrapped.yourTeamWeek,
)

const startButton = computed(() =>
  props.game === 'drinkit' ? copy.wrapped.seeDrinkIt : copy.wrapped.seeShipIt,
)

const statCards = computed(() => {
  const stats = payload.value?.personal_stats
  if (!stats) return []
  if (props.game === 'drinkit') {
    return buildDrinkItStatCards(stats as DrinkItPersonalStats)
  }
  return buildShipItStatCards(stats as ShipItTeamStats)
})

const leaderboardRows = computed<MockLeaderboardRow[]>(() =>
  (payload.value?.leaderboard ?? []).map((row) => ({
    id: row.id,
    rank: row.rank,
    name: row.name,
    members: row.members,
    metricLabel: row.metric_label,
    points: row.points,
  })),
)

const showMembers = computed(() => props.game === 'shipit')

async function load() {
  status.value = 'loading'
  errorMessage.value = null
  try {
    await awardsMode.refresh()
    if (!awardsMode.isAwardsMode) {
      status.value = 'not_available'
      return
    }
    const res = await fetchMyWrapped(props.game)
    if (!res.ok) {
      if (res.code === 'WRAPPED_NOT_AVAILABLE') {
        status.value = 'not_available'
        return
      }
      if (res.code === 'GAME_MEMBERSHIP_REQUIRED') {
        void router.replace({
          name: 'access-denied',
          query: { game: props.game },
        })
        return
      }
      status.value = 'error'
      errorMessage.value = res.message ?? res.code ?? copy.wrapped.loadFailed
      return
    }
    payload.value = res
    status.value = 'ready'
  } catch (err) {
    status.value = 'error'
    errorMessage.value =
      err instanceof WrappedApiError ? err.message : copy.wrapped.loadFailed
  }
}

async function onStart() {
  if (revealing.value || revealed.value) return
  revealing.value = true
  try {
    const res = await revealMyWrapped(props.game)
    if (!res.ok) {
      errorMessage.value = res.message ?? res.code ?? copy.wrapped.revealFailed
      return
    }
    justRevealed.value = true
    await load()
  } catch (err) {
    errorMessage.value =
      err instanceof WrappedApiError ? err.message : copy.wrapped.revealFailed
  } finally {
    revealing.value = false
  }
}

onMounted(() => {
  preferReducedMotion.value = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches
  awardsMode.ensureStarted()
  void load()
})

watch(
  () => props.game,
  () => {
    justRevealed.value = false
    void load()
  },
)
</script>

<template>
  <GameShell :game="game" :title="copy.wrapped.heading">
    <div
      v-if="status === 'loading'"
      class="px-4 py-16 text-center text-sm"
      style="color: var(--theme-muted)"
      data-testid="wrapped-loading"
    >
      {{ copy.wrapped.loading }}
    </div>

    <div
      v-else-if="status === 'not_available'"
      class="mx-4 mt-8 rounded-2xl px-4 py-6 text-center"
      style="background: var(--theme-card); color: var(--theme-ink)"
      data-testid="wrapped-not-available"
    >
      <p class="font-semibold">{{ copy.wrapped.notAvailableTitle }}</p>
      <p class="mt-2 text-sm" style="color: var(--theme-muted)">
        {{ copy.wrapped.notAvailableDetail }}
      </p>
      <button
        type="button"
        class="mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white"
        style="background: var(--theme-primary)"
        @click="router.push(game === 'drinkit' ? '/drinkit' : '/shipit')"
      >
        {{ copy.wrapped.backToGame }}
      </button>
    </div>

    <div
      v-else-if="status === 'error'"
      class="mx-4 mt-8 rounded-2xl px-4 py-6 text-center"
      style="background: var(--theme-card); color: var(--theme-ink)"
      data-testid="wrapped-error"
    >
      <p class="font-semibold">{{ copy.wrapped.unavailableTitle }}</p>
      <p class="mt-2 text-sm" style="color: var(--theme-muted)">
        {{ errorMessage || copy.wrapped.loadFailed }}
      </p>
      <button
        type="button"
        class="mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white"
        style="background: var(--theme-primary)"
        data-testid="wrapped-retry"
        @click="load"
      >
        {{ copy.home.retryLoad }}
      </button>
    </div>

    <!-- One-time Start / intro -->
    <section
      v-else-if="!revealed"
      class="flex min-h-[70dvh] flex-col items-center justify-center px-6 pb-24 pt-8 text-center"
      style="background: var(--theme-page-alt)"
      data-testid="wrapped-intro"
      :data-game="game"
    >
      <AppIcon name="nav.wrapped" style-variant="outline" class="text-5xl opacity-90" />
      <h2 class="font-display mt-6 max-w-xs text-2xl font-bold leading-snug">
        {{ copy.wrapped.readyHeadline }}
      </h2>
      <p class="mt-3 max-w-sm text-sm" style="color: var(--theme-muted)">
        {{ copy.wrapped.readySupport }}
      </p>
      <button
        type="button"
        class="mt-8 inline-flex w-full max-w-sm items-center justify-center gap-2 rounded-full px-5 py-3.5 text-sm font-semibold text-white"
        style="background: var(--theme-primary)"
        data-testid="wrapped-start"
        :disabled="revealing"
        @click="onStart"
      >
        <span>{{ revealing ? copy.wrapped.revealing : startButton }}</span>
        <AppIcon v-if="!revealing" name="action.next" class="text-sm" />
      </button>
      <p
        v-if="errorMessage"
        class="mt-3 text-sm"
        style="color: var(--theme-accent)"
        data-testid="wrapped-reveal-error"
      >
        {{ errorMessage }}
      </p>
    </section>

    <!-- Full results (no per-stat View buttons) -->
    <div
      v-else
      class="pb-8"
      data-testid="wrapped-results"
      :data-game="game"
      :class="
        justRevealed && !preferReducedMotion
          ? 'wrapped-reveal-anim'
          : undefined
      "
    >
      <section
        class="px-4 py-6 text-white"
        style="background: var(--theme-primary)"
        data-testid="wrapped-personal-intro"
      >
        <h2 class="font-display text-xl font-bold">{{ personalHeading }}</h2>
        <p class="mt-2 text-sm text-white/85">
          {{
            game === 'drinkit'
              ? copy.wrapped.personalSupportDrink
              : copy.wrapped.personalSupportShip
          }}
        </p>
      </section>

      <section
        class="grid grid-cols-2 gap-3 px-3 py-4"
        :aria-label="personalHeading"
        data-testid="wrapped-stat-grid"
      >
        <WrappedStatCard v-for="card in statCards" :key="card.key" :card="card" />
      </section>

      <section
        class="px-4 py-6 text-white"
        style="background: var(--theme-primary)"
        data-testid="wrapped-group-intro"
      >
        <h2 class="font-display text-xl font-bold">{{ copy.wrapped.everyoneElse }}</h2>
        <p class="mt-2 text-sm text-white/85">{{ copy.wrapped.everyoneElseSupport }}</p>
      </section>

      <section class="space-y-3 px-3 py-4" data-testid="wrapped-awards-list">
        <WrappedAwardCard
          v-for="(award, idx) in payload?.group_awards ?? []"
          :key="award.stable_key"
          :award="award"
          :tone="idx % 2 === 0 ? 'aqua' : 'cream'"
        />
        <p
          v-if="!(payload?.group_awards?.length)"
          class="rounded-2xl px-4 py-6 text-center text-sm"
          style="background: var(--theme-card); color: var(--theme-muted)"
        >
          {{ copy.wrapped.noAwardsConfigured }}
        </p>
      </section>

      <section class="mt-2" style="background: var(--theme-page-alt)" data-testid="wrapped-leaderboard">
        <div
          class="px-4 py-3 text-center text-white"
          style="background: var(--theme-header)"
        >
          <h2 class="font-display text-sm font-bold tracking-[0.12em] uppercase">
            {{ copy.wrapped.finalLeaderboard }}
          </h2>
        </div>
        <div class="px-3 py-4">
          <LeaderboardList :rows="leaderboardRows" :show-members="showMembers" />
        </div>
      </section>
    </div>
  </GameShell>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .wrapped-reveal-anim {
    animation: wrapped-fade-in 0.55s ease-out 1;
  }
}

@keyframes wrapped-fade-in {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
