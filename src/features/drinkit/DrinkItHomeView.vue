<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import AccountSection from '@/components/shared/AccountSection.vue'
import GameShell from '@/components/shared/GameShell.vue'
import LeaderboardList from '@/components/shared/LeaderboardList.vue'
import BountyCarousel from '@/features/drinkit/BountyCarousel.vue'
import { drinkItMockLeaderboard } from '@/features/drinkit/mockHome'
import { createHomeBountySync } from '@/lib/bounty/homeBountySync'
import { copy } from '@/ui/copy'
import type { HomeBountyCardView, HomeBoardPhase, HomeBountyFetchStatus } from '@/types/bountyHome'

const cards = ref<HomeBountyCardView[]>([])
const phase = ref<HomeBoardPhase>('loading')
const status = ref<HomeBountyFetchStatus>('idle')
const errorMessage = ref<string | null>(null)

const boardNote = computed(() => {
  // Never contradict paused / closed / finale with a "live" development notice.
  if (phase.value === 'active') return copy.home.partialLiveNote
  return null
})

const sync = createHomeBountySync({ tickMs: 1000, refreshMs: 60_000 })
let unsubscribe: (() => void) | null = null

onMounted(() => {
  unsubscribe = sync.subscribe((snap) => {
    cards.value = snap.cards
    phase.value = snap.phase
    status.value = snap.status
    errorMessage.value = snap.errorMessage
  })
  sync.start()
})

onUnmounted(() => {
  unsubscribe?.()
  sync.stop()
})

function retry() {
  void sync.refresh()
}
</script>

<template>
  <GameShell game="drinkit" :title="copy.home.drinkDailyBounties">
    <p
      v-if="boardNote"
      class="px-4 pt-3 text-center text-xs font-medium uppercase tracking-wide text-amber-800/80"
      data-testid="home-board-note"
      :data-board-phase="phase"
      :data-board-status="status"
    >
      {{ boardNote }}
    </p>
    <p
      v-else
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
      style="background: var(--theme-card); color: var(--theme-ink)"
      data-testid="home-bounty-error"
    >
      <p class="font-semibold">{{ copy.bounty.unavailableTitle }}</p>
      <p class="mt-1" style="color: var(--theme-muted)">
        {{ errorMessage || copy.bounty.unavailableDetail }}
      </p>
      <button
        type="button"
        class="mt-3 inline-flex rounded-full px-4 py-2 text-sm font-semibold text-white"
        style="background: var(--theme-primary)"
        data-testid="home-bounty-retry"
        @click="retry"
      >
        {{ copy.home.retryLoad }}
      </button>
    </div>

    <section class="pt-3" :aria-label="copy.home.drinkDailyBounties">
      <BountyCarousel :cards="cards" />
    </section>

    <section class="mt-6" style="background: var(--theme-page-alt)">
      <div
        class="px-4 py-3 text-center text-white"
        style="background: var(--theme-header)"
      >
        <h2 class="font-display text-sm font-bold tracking-[0.12em] uppercase">
          {{ copy.home.drinkLeaderboard }}
        </h2>
      </div>
      <div class="px-3 py-4">
        <LeaderboardList :rows="drinkItMockLeaderboard" />
      </div>
    </section>

    <section class="px-4 py-6">
      <details class="rounded-2xl px-4 py-3" style="background: var(--theme-card)">
        <summary class="cursor-pointer font-semibold" style="color: var(--theme-ink)">
          {{ copy.home.howToPlay }}
        </summary>
        <p class="mt-2 text-sm leading-relaxed" style="color: var(--theme-muted)">
          Earn points by completing bounties throughout the cruise. Full player-facing rules arrive
          with later phases; this accordion is a Phase 0 shell.
        </p>
      </details>

      <AccountSection />
    </section>
  </GameShell>
</template>
