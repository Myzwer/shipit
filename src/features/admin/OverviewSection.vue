<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { fetchAdminOverviewSummary, type AdminOverviewSummary } from '@/lib/adminOverview'
import { fetchAdminClockDiagnostics } from '@/lib/adminClock'
import { fetchDrinkItPauseStatus, type DrinkItPauseStatus } from '@/lib/adminPause'
import { formatShipDateTime } from '@/lib/shipClockFormat'
import type { AdminClockDiagnostics } from '@/types/shipClock'
import { copy, formatCopy } from '@/ui/copy'

const summary = ref<AdminOverviewSummary | null>(null)
const clock = ref<AdminClockDiagnostics | null>(null)
const pause = ref<DrinkItPauseStatus | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const errorMessage = ref('')

async function load() {
  status.value = 'loading'
  errorMessage.value = ''
  try {
    const [overview, clockDiag, pauseStatus] = await Promise.all([
      fetchAdminOverviewSummary(),
      fetchAdminClockDiagnostics().catch(() => null),
      fetchDrinkItPauseStatus().catch(() => null),
    ])
    summary.value = overview
    clock.value = clockDiag
    pause.value = pauseStatus
    status.value = 'ready'
  } catch (err) {
    status.value = 'error'
    errorMessage.value = err instanceof Error ? err.message : copy.admin.overviewLoadError
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <section class="mt-4 rounded-2xl p-4" style="background: #fff" data-testid="admin-overview">
    <h2 class="font-display text-base font-bold tracking-wide" style="color: #2f3a44">
      {{ copy.admin.overviewSection }}
    </h2>
    <p class="mt-1 text-sm" style="color: #5a6570">{{ copy.admin.overviewHint }}</p>

    <p
      v-if="status === 'loading'"
      class="mt-4 text-sm"
      style="color: #5a6570"
      data-testid="admin-overview-loading"
    >
      {{ copy.admin.overviewLoading }}
    </p>

    <div
      v-else-if="status === 'error'"
      class="mt-4 rounded-2xl px-4 py-3 text-sm"
      style="background: #fdeceb; color: #6b1f1f"
      data-testid="admin-overview-error"
    >
      <p>{{ errorMessage || copy.admin.overviewLoadError }}</p>
      <button
        type="button"
        class="mt-2 min-h-12 font-semibold underline"
        data-testid="admin-overview-retry"
        @click="load"
      >
        {{ copy.admin.retry }}
      </button>
    </div>

    <div v-else-if="summary" class="mt-4 grid gap-3" data-testid="admin-overview-ready">
      <div class="rounded-2xl p-3" style="background: #f7f4ef; color: #2f3a44">
        <p class="text-xs font-semibold uppercase tracking-wide" style="color: #5a6570">
          {{ copy.admin.overviewRoster }}
        </p>
        <p class="mt-1 text-sm font-semibold" data-testid="admin-overview-players">
          {{
            formatCopy(copy.admin.overviewPlayersCount, {
              count: summary.players,
            })
          }}
        </p>
        <p class="mt-1 text-sm" data-testid="admin-overview-memberships">
          {{
            formatCopy(copy.admin.overviewMemberships, {
              drinkit: summary.drinkit_enabled,
              shipit: summary.shipit_enabled,
              teams: summary.teams,
            })
          }}
        </p>
        <p
          v-if="summary.shipit_unassigned > 0"
          class="mt-1 text-sm"
          style="color: #5a6570"
          data-testid="admin-overview-unassigned"
        >
          {{
            formatCopy(copy.admin.overviewUnassigned, {
              count: summary.shipit_unassigned,
            })
          }}
        </p>
      </div>

      <div
        v-if="clock?.state"
        class="rounded-2xl p-3"
        style="background: #f7f4ef; color: #2f3a44"
        data-testid="admin-overview-clock"
      >
        <p class="text-xs font-semibold uppercase tracking-wide" style="color: #5a6570">
          {{ copy.admin.clockSection }}
        </p>
        <p class="mt-1 text-sm font-semibold">
          {{ clock.state.ship_local ? formatShipDateTime(clock.state.ship_local) : '—' }}
        </p>
        <p v-if="clock.state.cruise_day != null" class="mt-1 text-sm" style="color: #5a6570">
          {{
            formatCopy(copy.admin.overviewCruiseDay, {
              day: clock.state.cruise_day,
            })
          }}
        </p>
      </div>

      <div
        v-if="pause"
        class="rounded-2xl p-3"
        style="background: #f7f4ef; color: #2f3a44"
        data-testid="admin-overview-drinkit"
      >
        <p class="text-xs font-semibold uppercase tracking-wide" style="color: #5a6570">
          {{ copy.games.drinkIt }}
        </p>
        <p class="mt-1 text-sm font-semibold">
          {{ pause.drinkit?.paused ? copy.admin.drinkItPaused : copy.admin.drinkItRunning }}
        </p>
      </div>
    </div>
  </section>
</template>
