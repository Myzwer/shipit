<script setup lang="ts">
import AccountSection from '@/components/shared/AccountSection.vue'
import GameShell from '@/components/shared/GameShell.vue'
import LeaderboardList from '@/components/shared/LeaderboardList.vue'
import BountyCarousel from '@/features/drinkit/BountyCarousel.vue'
import { drinkItMockBounties, drinkItMockLeaderboard } from '@/features/drinkit/mockHome'
import { copy } from '@/ui/copy'

</script>

<template>
  <GameShell game="drinkit" :title="copy.home.drinkDailyBounties">
    <p class="px-4 pt-3 text-center text-xs font-medium uppercase tracking-wide text-amber-800/80">
      {{ copy.home.mockShellNote }}
    </p>

    <section class="pt-3" :aria-label="copy.home.drinkDailyBounties">
      <BountyCarousel :cards="drinkItMockBounties" />
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
