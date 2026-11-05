<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  fetchDrinkItPauseStatus,
  newPauseRequestId,
  setDrinkItPaused,
  type DrinkItPauseStatus,
} from '@/lib/adminPause'
import { copy } from '@/ui/copy'

const status = ref<DrinkItPauseStatus | null>(null)
const loadStatus = ref<'loading' | 'ready' | 'error'>('loading')
const busy = ref(false)
const confirm = ref<'pause' | 'resume' | null>(null)
const feedback = ref<{
  kind: 'success' | 'error' | 'unknown'
  title: string
  body: string
} | null>(null)
/** Last uncertain request — reconcile before another mutation. */
const pendingRequestId = ref<string | null>(null)

async function load() {
  loadStatus.value = status.value ? 'ready' : 'loading'
  try {
    status.value = await fetchDrinkItPauseStatus()
    loadStatus.value = 'ready'
  } catch (err) {
    loadStatus.value = 'error'
    feedback.value = {
      kind: 'error',
      title: copy.admin.pauseFailureTitle,
      body: err instanceof Error ? err.message : copy.admin.pauseFailureBody,
    }
  }
}

onMounted(() => {
  void load()
})

function openConfirm(mode: 'pause' | 'resume') {
  if (busy.value || pendingRequestId.value) return
  feedback.value = null
  confirm.value = mode
}

async function applyConfirmed() {
  if (!confirm.value || busy.value) return
  const wantPaused = confirm.value === 'pause'
  const requestId = newPauseRequestId()
  busy.value = true
  confirm.value = null
  feedback.value = null
  try {
    const result = await setDrinkItPaused(wantPaused, requestId)
    pendingRequestId.value = null
    await load()
    feedback.value = {
      kind: 'success',
      title: result.paused ? copy.admin.pauseSuccess : copy.admin.resumeSuccess,
      body: copy.admin.shipItUnaffected,
    }
  } catch {
    // Lost/uncertain: reconcile before claiming outcome.
    pendingRequestId.value = requestId
    try {
      await load()
      pendingRequestId.value = null
      feedback.value = {
        kind: 'unknown',
        title: copy.admin.pauseUnknownTitle,
        body: copy.admin.pauseUnknownBody,
      }
    } catch {
      feedback.value = {
        kind: 'unknown',
        title: copy.admin.pauseUnknownTitle,
        body: copy.admin.pauseUnknownBody,
      }
    }
  } finally {
    busy.value = false
  }
}

async function reconcileOnly() {
  busy.value = true
  feedback.value = null
  try {
    await load()
    pendingRequestId.value = null
  } finally {
    busy.value = false
  }
}

const paused = () => Boolean(status.value?.drinkit.paused)
const finalized = () => Boolean(status.value?.drinkit.finalized_at_utc)
</script>

<template>
  <section class="mt-8 rounded-2xl p-4" style="background: #fff" data-testid="game-status-section">
    <h2 class="font-display text-base font-bold" style="color: #2f3a44">
      {{ copy.admin.gameStatus }}
    </h2>

    <p
      v-if="loadStatus === 'loading'"
      class="mt-3 text-sm"
      style="color: #5c6670"
      data-testid="game-status-loading"
    >
      Loading…
    </p>

    <template v-else-if="status">
      <p
        class="mt-3 text-sm font-semibold"
        style="color: #2f3a44"
        data-testid="drinkit-pause-state"
        :data-paused="paused() ? 'true' : 'false'"
        :data-finalized="finalized() ? 'true' : 'false'"
      >
        {{ paused() ? copy.admin.drinkItPaused : copy.admin.drinkItRunning }}
      </p>
      <p class="mt-1 text-xs" style="color: #5c6670">{{ copy.admin.shipItUnaffected }}</p>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          v-if="!paused()"
          type="button"
          class="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style="background: #8b2942"
          data-testid="pause-drinkit"
          :disabled="busy || Boolean(pendingRequestId) || finalized()"
          @click="openConfirm('pause')"
        >
          {{ copy.admin.pauseDrinkIt }}
        </button>
        <button
          v-else
          type="button"
          class="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style="background: #0a5c6b"
          data-testid="resume-drinkit"
          :disabled="busy || Boolean(pendingRequestId) || finalized()"
          @click="openConfirm('resume')"
        >
          {{ copy.admin.resumeDrinkIt }}
        </button>
        <button
          v-if="pendingRequestId"
          type="button"
          class="rounded-full px-4 py-2 text-sm font-semibold"
          style="background: #e8e2d9; color: #2f3a44"
          data-testid="reconcile-pause"
          :disabled="busy"
          @click="reconcileOnly"
        >
          {{ copy.admin.refreshGameStatus }}
        </button>
      </div>
    </template>

    <div
      v-if="feedback"
      class="mt-4 rounded-xl px-3 py-2 text-sm"
      :style="{
        background: feedback.kind === 'success' ? '#e7f3ef' : '#f8ecec',
        color: '#2f3a44',
      }"
      data-testid="game-status-feedback"
      :data-kind="feedback.kind"
    >
      <p class="font-semibold">{{ feedback.title }}</p>
      <p class="mt-1">{{ feedback.body }}</p>
    </div>

    <div
      v-if="confirm"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      data-testid="pause-confirm-modal"
      role="dialog"
      aria-modal="true"
    >
      <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lg">
        <h3 class="font-display text-lg font-bold" style="color: #2f3a44">
          {{ confirm === 'pause' ? copy.admin.confirmPauseTitle : copy.admin.confirmResumeTitle }}
        </h3>
        <p class="mt-2 text-sm" style="color: #5c6670">
          {{ confirm === 'pause' ? copy.admin.confirmPauseBody : copy.admin.confirmResumeBody }}
        </p>
        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-full px-4 py-2 text-sm font-semibold"
            style="background: #e8e2d9; color: #2f3a44"
            data-testid="pause-confirm-cancel"
            :disabled="busy"
            @click="confirm = null"
          >
            {{ copy.admin.cancel }}
          </button>
          <button
            type="button"
            class="rounded-full px-4 py-2 text-sm font-semibold text-white"
            style="background: #8b2942"
            data-testid="pause-confirm-apply"
            :disabled="busy"
            @click="applyConfirmed"
          >
            {{ confirm === 'pause' ? copy.admin.pauseDrinkIt : copy.admin.resumeDrinkIt }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
