<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AccountSection from '@/components/shared/AccountSection.vue'
import GameShell from '@/components/shared/GameShell.vue'
import LeaderboardList from '@/components/shared/LeaderboardList.vue'
import BountyCarousel from '@/features/drinkit/BountyCarousel.vue'
import GameRulesPanel from '@/features/shared/GameRulesPanel.vue'
import { fetchMyBarBountyCrew } from '@/lib/bounty/barBountyApi'
import { createHomeBountySync } from '@/lib/bounty/homeBountySync'
import { fetchDrinkItLeaderboard } from '@/lib/wrapped/api'
import { copy } from '@/ui/copy'
import type {
  HomeBarCrewView,
  HomeBountyCardView,
  HomeBoardPhase,
  HomeBountyFetchStatus,
} from '@/types/bountyHome'
import type { MockLeaderboardRow } from '@/types/game'

const router = useRouter()

const cards = ref<HomeBountyCardView[]>([])
const phase = ref<HomeBoardPhase>('loading')
const status = ref<HomeBountyFetchStatus>('idle')
const errorMessage = ref<string | null>(null)
const leaderboardRows = ref<MockLeaderboardRow[]>([])
const barCrew = ref<HomeBarCrewView>({ status: 'loading', message: copy.bounty.barCrewLoading })
let lastCards: HomeBountyCardView[] = []

function applyCrewToCards(list: HomeBountyCardView[]): HomeBountyCardView[] {
  return list.map((card) =>
    card.id === 'bar' && (card.presentation === 'active' || card.presentation === 'claimed')
      ? { ...card, crew: barCrew.value }
      : card,
  )
}

async function refreshBarCrew() {
  try {
    const res = await fetchMyBarBountyCrew()
    if (res.ok && res.status === 'assigned') {
      barCrew.value = {
        status: 'assigned',
        crewSize: res.crew_size,
        mateNames: res.members.filter((m) => !m.is_self).map((m) => m.display_name),
      }
    } else if (res.ok && res.status === 'unassigned') {
      barCrew.value = {
        status: 'unassigned',
        message: copy.bounty.barCrewUnassigned,
      }
    } else if (!res.ok && res.status === 'roster_too_small') {
      barCrew.value = {
        status: 'unavailable',
        message: copy.bounty.barCrewTooSmall,
      }
    } else {
      barCrew.value = {
        status: 'unavailable',
        message: copy.bounty.barCrewUnavailable,
      }
    }
  } catch {
    barCrew.value = {
      status: 'error',
      message: copy.bounty.barCrewUnavailable,
    }
  }
  cards.value = applyCrewToCards(lastCards)
}

const sync = createHomeBountySync({ tickMs: 1000, refreshMs: 60_000 })
let unsubscribe: (() => void) | null = null

async function loadLeaderboard() {
  try {
    const res = await fetchDrinkItLeaderboard()
    if (!res.ok || !res.leaderboard) {
      leaderboardRows.value = []
      return
    }
    leaderboardRows.value = res.leaderboard.map((row) => ({
      id: row.id,
      rank: row.rank,
      name: row.name,
      metricLabel: row.metric_label,
      points: row.points,
    }))
  } catch {
    leaderboardRows.value = []
  }
}

onMounted(() => {
  let crewSyncedForReady = false
  unsubscribe = sync.subscribe((snap) => {
    lastCards = snap.cards
    cards.value = applyCrewToCards(snap.cards)
    phase.value = snap.phase
    status.value = snap.status
    errorMessage.value = snap.errorMessage
    // Tick emits while ready; only refresh crew when board becomes ready (or after retry).
    if (snap.status === 'ready') {
      if (!crewSyncedForReady) {
        crewSyncedForReady = true
        void refreshBarCrew()
      }
    } else {
      crewSyncedForReady = false
    }
  })
  sync.start()
  void loadLeaderboard()
  void refreshBarCrew()
})

onUnmounted(() => {
  unsubscribe?.()
  sync.stop()
})

function retry() {
  void sync.refresh()
  void refreshBarCrew()
}

function onClaim(card: HomeBountyCardView) {
  if (!card.claimEnabled || !card.claimPrefill) return
  if (card.claimPrefill.source === 'daily') {
    void router.push({ name: 'drinkit-daily' })
    return
  }
  const q: Record<string, string> = { from: card.claimPrefill.source }
  if (card.claimPrefill.barCanonicalKey) q.bar = card.claimPrefill.barCanonicalKey
  if (card.claimPrefill.offeringId) q.offering = card.claimPrefill.offeringId
  if (card.claimPrefill.drinkDisplayName) q.drink = card.claimPrefill.drinkDisplayName
  void router.push({ name: 'drinkit-log', query: q })
}
</script>

<template>
  <GameShell
    game="drinkit"
    tone="home"
    :show-ship-time="false"
    :title="copy.home.drinkDailyBounties"
  >
    <p
      class="sr-only"
      data-testid="home-board-note"
      :data-board-phase="phase"
      :data-board-status="status"
    >
      {{ phase }}
    </p>

    <div
      v-if="status === 'error' || status === 'unavailable'"
      class="mx-4 mt-3 rounded-2xl px-4 py-3 text-center text-sm"
      style="background: var(--theme-gradient-warm); color: var(--theme-ink)"
      data-testid="home-bounty-error"
    >
      <p class="font-semibold">{{ copy.bounty.unavailableTitle }}</p>
      <p class="mt-1" style="color: var(--theme-muted)">
        {{ errorMessage || copy.bounty.unavailableDetail }}
      </p>
      <button
        type="button"
        class="mt-3 inline-flex min-h-11 rounded-full px-4 py-2 text-sm font-semibold text-white"
        style="background: var(--theme-primary)"
        data-testid="home-bounty-retry"
        @click="retry"
      >
        {{ copy.home.retryLoad }}
      </button>
    </div>

    <section :aria-label="copy.home.drinkDailyBounties">
      <BountyCarousel :cards="cards" @claim="onClaim" />
    </section>

    <section style="background: var(--theme-gradient-cool)">
      <div class="ui-section-band">
        <h2 class="ui-section-band-title">
          {{ copy.home.drinkLeaderboard }}
        </h2>
      </div>
      <div class="px-3 pb-4 pt-3">
        <LeaderboardList v-if="leaderboardRows.length" metric-under-name :rows="leaderboardRows" />
        <p
          v-else
          class="px-2 py-3 text-center text-sm leading-relaxed"
          style="color: var(--theme-ink)"
          data-testid="leaderboard-empty"
        >
          {{ copy.home.noDrinkStandings }}
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
        <GameRulesPanel game="drinkit" />
        <div class="mt-6">
          <AccountSection surface="mint" />
        </div>
      </div>
    </section>
  </GameShell>
</template>

<style scoped>
.home-rules {
  background: var(--theme-gradient-warm);
  color: var(--theme-ink);
}
</style>
