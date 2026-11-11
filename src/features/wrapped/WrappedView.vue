<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import GameShell from '@/components/shared/GameShell.vue'
import LeaderboardList from '@/components/shared/LeaderboardList.vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import WrappedStatCard from '@/features/wrapped/WrappedStatCard.vue'
import WrappedFinalAwardCard from '@/features/wrapped/WrappedFinalAwardCard.vue'
import { fetchMyWrapped, revealMyWrapped, WrappedApiError } from '@/lib/wrapped/api'
import {
  buildCollectiveCards,
  buildGlobalAwardCards,
  buildPersonalCards,
} from '@/lib/wrapped/buildFinalCards'
import { inventoryIdsForGame } from '@/lib/wrapped/inventory'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { copy } from '@/ui/copy'
import type { GameId, MockLeaderboardRow } from '@/types/game'
import type { WrappedPayload } from '@/types/wrapped'

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
const resultsTop = ref<HTMLElement | null>(null)

const revealed = computed(() => Boolean(payload.value?.revealed))

const personalHeading = computed(() =>
  props.game === 'drinkit' ? copy.wrapped.yourWeek : copy.wrapped.yourTeamWeek,
)

const introHeadline = computed(() =>
  props.game === 'drinkit'
    ? copy.wrapped.drinkIntroHeadline
    : copy.wrapped.shipIntroHeadline,
)

const introBody = computed(() =>
  props.game === 'drinkit' ? copy.wrapped.drinkIntroBody : copy.wrapped.shipIntroBody,
)

const everyoneSupport = computed(() =>
  props.game === 'drinkit'
    ? copy.wrapped.everyoneElseSupportDrink
    : copy.wrapped.everyoneElseSupportShip,
)

const collectiveHeading = computed(() =>
  props.game === 'drinkit' ? copy.wrapped.collectiveDrink : copy.wrapped.collectiveShip,
)

const startButton = computed(() =>
  props.game === 'drinkit' ? copy.wrapped.seeDrinkIt : copy.wrapped.seeShipIt,
)

const personalCards = computed(() =>
  buildPersonalCards(payload.value?.sections?.personal ?? []),
)

const globalCards = computed(() =>
  buildGlobalAwardCards(payload.value?.sections?.global ?? []),
)

const collectiveCards = computed(() =>
  buildCollectiveCards(payload.value?.sections?.collective ?? []),
)

const inventoryMismatch = computed(() => {
  const expected = inventoryIdsForGame(props.game)
  const got = [
    ...(payload.value?.sections?.personal ?? []).map((e) => e.spec_id),
    ...(payload.value?.sections?.global ?? []).map((e) => e.spec_id),
    ...(payload.value?.sections?.collective ?? []).map((e) => e.spec_id),
  ]
  return expected.length !== got.length || expected.some((id, i) => id !== got[i])
})

const standingsEntry = computed(() =>
  (payload.value?.sections?.collective ?? []).find((e) => e.spec_id === 'SI-C12'),
)

const leaderboardRows = computed<MockLeaderboardRow[]>(() => {
  if (props.game === 'shipit' && standingsEntry.value?.items?.length) {
    return (standingsEntry.value.items as Array<Record<string, unknown>>).map((row, idx) => ({
      id: String(row.id ?? idx),
      rank: Number(row.rank ?? idx + 1),
      name: String(row.name ?? ''),
      members: Array.isArray(row.members) ? (row.members as string[]) : undefined,
      metricLabel: `${row.points ?? 0} points`,
      points: Number(row.points ?? 0),
    }))
  }
  return (payload.value?.leaderboard ?? []).map((row) => ({
    id: row.id,
    rank: row.rank,
    name: row.name,
    members: row.members,
    metricLabel: row.metric_label,
    points: row.points,
  }))
})

const showMembers = computed(() => props.game === 'shipit')

const collectiveWithoutStandings = computed(() =>
  collectiveCards.value.filter((c) => c.key !== 'SI-C12'),
)

function scrollToTop() {
  resultsTop.value?.scrollIntoView({ behavior: preferReducedMotion.value ? 'auto' : 'smooth' })
}

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
      style="background: var(--theme-gradient-warm); color: var(--theme-ink)"
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
      style="background: var(--theme-gradient-warm); color: var(--theme-ink)"
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
      style="background: var(--theme-gradient-cool)"
      data-testid="wrapped-intro"
      :data-game="game"
    >
      <AppIcon name="nav.wrapped" style-variant="outline" class="text-5xl opacity-90" />
      <h2 class="font-display mt-6 max-w-xs text-2xl font-bold leading-snug">
        {{ introHeadline }}
      </h2>
      <p class="mt-3 max-w-sm text-sm" style="color: var(--theme-muted)">
        {{ introBody }}
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

    <!-- Full results: three scrollable sections -->
    <div
      v-else
      ref="resultsTop"
      class="pb-8"
      data-testid="wrapped-results"
      :data-game="game"
      :data-inventory-ok="inventoryMismatch ? 'false' : 'true'"
      :class="
        justRevealed && !preferReducedMotion
          ? 'wrapped-reveal-anim'
          : undefined
      "
    >
      <section
        class="relative px-4 py-6 text-white"
        style="background: var(--theme-primary)"
        data-testid="wrapped-personal-intro"
      >
        <button
          type="button"
          class="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15"
          :aria-label="'Back to top'"
          data-testid="wrapped-back-to-top"
          @click="scrollToTop"
        >
          <AppIcon name="action.next" class="rotate-[-90deg] text-sm" />
        </button>
        <p class="text-xs font-bold uppercase tracking-[0.14em] text-white/80">
          {{ copy.wrapped.heading }}
        </p>
        <h2 class="font-display mt-2 text-2xl font-bold">{{ introHeadline }}</h2>
        <p class="mt-2 text-sm text-white/85">{{ introBody }}</p>
        <h3 class="font-display mt-5 text-lg font-bold">{{ personalHeading }}</h3>
      </section>

      <section
        class="grid grid-cols-2 gap-3 px-3 py-4"
        :aria-label="personalHeading"
        data-testid="wrapped-stat-grid"
      >
        <WrappedStatCard
          v-for="card in personalCards"
          :key="card.key"
          :card="card"
          :class="card.kind === 'photo' ? 'col-span-2' : undefined"
        />
      </section>

      <section
        class="px-4 py-6 text-white"
        style="background: var(--theme-primary)"
        data-testid="wrapped-group-intro"
      >
        <h2 class="font-display text-xl font-bold">{{ copy.wrapped.everyoneElse }}</h2>
        <p class="mt-2 text-sm text-white/85">{{ everyoneSupport }}</p>
      </section>

      <section class="space-y-3 px-3 py-4" data-testid="wrapped-awards-list">
        <WrappedFinalAwardCard
          v-for="card in globalCards"
          :key="card.key"
          :card="card"
        />
      </section>

      <section
        class="px-4 py-6 text-white"
        style="background: var(--theme-primary)"
        data-testid="wrapped-collective-intro"
      >
        <h2 class="font-display text-xl font-bold">{{ collectiveHeading }}</h2>
      </section>

      <section class="space-y-3 px-3 py-4" data-testid="wrapped-collective-list">
        <WrappedFinalAwardCard
          v-for="card in collectiveWithoutStandings"
          :key="card.key"
          :card="card"
        />
      </section>

      <section
        v-if="game === 'shipit'"
        class="mt-2"
        style="background: var(--theme-gradient-cool)"
        data-testid="wrapped-leaderboard"
      >
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

      <section
        class="mx-3 mt-4 rounded-2xl px-4 py-6 text-center"
        style="background: var(--theme-gradient-warm); color: var(--theme-ink)"
        data-testid="wrapped-ending"
      >
        <h2 class="font-display text-2xl font-bold">{{ copy.wrapped.wrapHeading }}</h2>
        <p class="mt-2 text-sm" style="color: var(--theme-muted)">
          {{ copy.wrapped.wrapBody }}
        </p>
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
