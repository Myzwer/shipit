<script setup lang="ts">
import GameShell from '@/components/shared/GameShell.vue'
import LeaderboardList from '@/components/shared/LeaderboardList.vue'
import {
  shipItMockLeaderboard,
  shipItMockProgress,
  shipItMockTeamName,
} from '@/features/shipit/mockHome'
import { copy, formatCopy } from '@/ui/copy'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
</script>

<template>
  <GameShell game="shipit" :title="copy.nav.home">
    <p class="px-4 pt-3 text-center text-xs font-medium uppercase tracking-wide text-amber-900/70">
      {{ copy.home.mockShellNote }}
    </p>

    <section class="px-4 pt-4" :aria-label="formatCopy(copy.home.shipProgress, { teamName: shipItMockTeamName })">
      <h2 class="font-display text-xl font-bold" style="color: var(--theme-ink)">
        {{ formatCopy(copy.home.shipProgress, { teamName: shipItMockTeamName }) }}
      </h2>

      <ul class="mt-5 space-y-5">
        <li v-for="row in shipItMockProgress" :key="row.id">
          <p class="text-[0.95rem] font-medium leading-snug" style="color: var(--theme-ink)">
            {{ row.label }} — {{ row.completed }}/{{ row.total }}
          </p>
          <div class="mt-2 h-[3px] overflow-hidden rounded-full bg-black/10">
            <div
              class="h-full rounded-full"
              :style="{
                width: `${Math.round((row.completed / row.total) * 100)}%`,
                background: 'var(--theme-primary)',
              }"
            />
          </div>
          <p class="mt-1.5 text-right text-sm tabular-nums" style="color: var(--theme-ink)">
            {{ row.points }}
          </p>
        </li>
      </ul>
    </section>

    <section class="mt-8" style="background: var(--theme-page-alt)">
      <div class="px-4 py-3 text-center text-white" style="background: var(--theme-header)">
        <h2 class="font-display text-sm font-bold tracking-[0.12em] uppercase">
          {{ copy.home.shipLeaderboard }}
        </h2>
      </div>
      <div class="px-3 py-4">
        <!--
          Member names under team titles follow
          design/latest-available-updates/01-Ship-It-Home-Team-Leaderboard-Names.png
        -->
        <LeaderboardList :rows="shipItMockLeaderboard" show-members />
      </div>
    </section>

    <section class="px-4 py-6">
      <details class="rounded-2xl px-4 py-3" style="background: var(--theme-card)">
        <summary class="cursor-pointer font-semibold" style="color: var(--theme-ink)">
          {{ copy.home.howToPlay }}
        </summary>
        <p class="mt-2 text-sm leading-relaxed" style="color: var(--theme-muted)">
          Explore the ship and complete photo challenges with your team. Full rules and the 50
          challenges arrive with later content phases.
        </p>
      </details>

      <div class="mt-4 rounded-2xl px-4 py-3" style="background: var(--theme-card)">
        <h3 class="text-sm font-semibold uppercase tracking-wide" style="color: var(--theme-muted)">
          {{ copy.home.account }}
        </h3>
        <p class="mt-1 text-sm" style="color: var(--theme-ink)">
          {{ formatCopy(copy.home.signedInAs, { playerName: session.displayName }) }}
        </p>
        <p class="text-sm" style="color: var(--theme-muted)">
          {{ formatCopy(copy.home.teamLine, { teamName: shipItMockTeamName }) }}
        </p>
        <button
          type="button"
          class="mt-3 text-sm font-semibold underline-offset-2 hover:underline"
          style="color: var(--theme-primary)"
          disabled
        >
          {{ copy.home.logOut }}
        </button>
      </div>
    </section>
  </GameShell>
</template>
