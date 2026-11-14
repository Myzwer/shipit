<script setup lang="ts">
import { ref } from 'vue'
import { adminListBarBountyCrews } from '@/lib/bounty/barBountyApi'
import { copy, formatCopy } from '@/ui/copy'
import type { AdminBarBountyCrewsResult } from '@/types/barBountyCrew'

const result = ref<AdminBarBountyCrewsResult | null>(null)
const loadStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const errorBody = ref('')
const confirmGenerate = ref(false)

async function load() {
  loadStatus.value = 'loading'
  errorBody.value = ''
  confirmGenerate.value = false
  try {
    result.value = await adminListBarBountyCrews()
    loadStatus.value = 'ready'
  } catch (err) {
    loadStatus.value = 'error'
    errorBody.value = err instanceof Error ? err.message : copy.admin.barCrewsLoadError
  }
}

function requestGenerate() {
  if (loadStatus.value === 'loading') return
  // First intentional load can lock the day — require confirm. Refresh after load is idempotent.
  if (result.value) {
    void load()
    return
  }
  confirmGenerate.value = true
}

function cancelGenerate() {
  confirmGenerate.value = false
}
</script>

<template>
  <section class="mt-8 rounded-2xl p-4" style="background: #fff" data-testid="bar-bounty-crews-section">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h2 class="font-display text-base font-bold" style="color: #2f3a44">
          {{ copy.admin.barCrewsSection }}
        </h2>
        <p class="mt-1 text-xs leading-relaxed" style="color: #5c6670">
          {{ copy.admin.barCrewsNote }}
        </p>
      </div>
      <button
        type="button"
        class="shrink-0 rounded-full px-3 py-2 text-xs font-semibold"
        style="background: #e8e2d9; color: #2f3a44"
        data-testid="bar-crews-refresh"
        :disabled="loadStatus === 'loading'"
        @click="requestGenerate"
      >
        {{ result ? copy.admin.barCrewsRefresh : copy.admin.barCrewsGenerate }}
      </button>
    </div>

    <p
      v-if="loadStatus === 'idle'"
      class="mt-3 rounded-xl px-3 py-2 text-sm"
      style="background: #f7efe6; color: #2f3a44"
      data-testid="bar-crews-idle"
    >
      {{ copy.admin.barCrewsIdle }}
    </p>

    <p
      v-else-if="loadStatus === 'loading' && !result"
      class="mt-3 text-sm"
      style="color: #5c6670"
      data-testid="bar-crews-loading"
    >
      Loading…
    </p>

    <p
      v-else-if="loadStatus === 'error'"
      class="mt-3 text-sm"
      style="color: #8b2942"
      data-testid="bar-crews-error"
    >
      {{ errorBody || copy.admin.barCrewsLoadError }}
    </p>

    <template v-else-if="result">
      <p
        v-if="!result.ok && (result.status === 'roster_too_small' || result.code === 'ROSTER_TOO_SMALL')"
        class="mt-3 rounded-xl px-3 py-2 text-sm"
        style="background: #f7efe6; color: #2f3a44"
        data-testid="bar-crews-too-small"
      >
        {{
          formatCopy(copy.admin.barCrewsTooSmall, {
            minimum: result.minimum_roster ?? result.issue?.minimum_roster ?? 7,
            roster: result.roster_size ?? result.issue?.roster_size ?? 0,
          })
        }}
      </p>

      <p
        v-else-if="!result.ok"
        class="mt-3 text-sm"
        style="color: #5c6670"
        data-testid="bar-crews-unavailable"
      >
        {{ result.message || copy.admin.barCrewsEmpty }}
      </p>

      <template v-else>
        <p class="mt-3 text-sm font-semibold" style="color: #2f3a44" data-testid="bar-crews-day">
          {{ formatCopy(copy.admin.barCrewsDay, { day: result.cruise_day }) }}
        </p>
        <p class="mt-1 text-xs" style="color: #5c6670" data-testid="bar-crews-meta">
          {{
            formatCopy(copy.admin.barCrewsRoster, {
              roster: result.roster_size,
              crews: result.crews.length,
            })
          }}
        </p>

        <ul v-if="result.crews.length" class="mt-3 space-y-2" data-testid="bar-crews-list">
          <li
            v-for="crew in result.crews"
            :key="crew.crew_id"
            class="rounded-xl px-3 py-2"
            style="background: #f4f7f8"
            :data-testid="`bar-crew-${crew.crew_index}`"
          >
            <p class="text-xs font-semibold uppercase tracking-wide" style="color: #5c6670">
              {{ formatCopy(copy.admin.barCrewSize, { size: crew.size }) }}
            </p>
            <p class="mt-1 text-sm font-medium" style="color: #2f3a44">
              {{ crew.members.map((m) => m.display_name).join(' · ') }}
            </p>
          </li>
        </ul>
        <p v-else class="mt-3 text-sm" style="color: #5c6670">{{ copy.admin.barCrewsEmpty }}</p>
      </template>
    </template>

    <div
      v-if="confirmGenerate"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      data-testid="bar-crews-confirm"
      role="dialog"
      aria-modal="true"
    >
      <div class="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg">
        <h3 class="font-display text-lg font-bold" style="color: #2f3a44">
          {{ copy.admin.barCrewsConfirmTitle }}
        </h3>
        <p class="mt-2 text-sm leading-relaxed" style="color: #5b6770">
          {{ copy.admin.barCrewsConfirmBody }}
        </p>
        <div class="mt-5 flex gap-2">
          <button
            type="button"
            class="flex-1 rounded-full px-4 py-3 text-sm font-semibold"
            style="background: #ebe6df; color: #2f3a44"
            @click="cancelGenerate"
          >
            {{ copy.admin.cancel }}
          </button>
          <button
            type="button"
            class="flex-1 rounded-full px-4 py-3 text-sm font-semibold text-white"
            style="background: #0a5c6b"
            data-testid="bar-crews-confirm-apply"
            @click="load"
          >
            {{ copy.admin.barCrewsConfirmApply }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
