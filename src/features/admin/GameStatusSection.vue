<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  applyDrinkItPaused,
  fetchDrinkItPauseStatus,
  newPauseRequestId,
  reconcileDrinkItPause,
  type DrinkItPauseStatus,
} from '@/lib/adminPause'
import {
  clearPendingDrinkItPause,
  readPendingDrinkItPause,
  writePendingDrinkItPause,
  type PendingDrinkItPause,
} from '@/lib/pendingDrinkItPause'
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

/** Unresolved operation — mirrored to localStorage before mutate. */
const pending = ref<PendingDrinkItPause | null>(null)

const locked = computed(() => busy.value || Boolean(pending.value))
const paused = computed(() => Boolean(status.value?.drinkit.paused))
const finalized = computed(() => Boolean(status.value?.drinkit.finalized_at_utc))

async function loadStatusOnly(): Promise<boolean> {
  try {
    status.value = await fetchDrinkItPauseStatus()
    loadStatus.value = 'ready'
    return true
  } catch (err) {
    loadStatus.value = status.value ? 'ready' : 'error'
    // Never clear pending here — caller decides.
    if (!pending.value) {
      feedback.value = {
        kind: 'error',
        title: copy.admin.pauseFailureTitle,
        body: err instanceof Error ? err.message : copy.admin.pauseFailureBody,
      }
    }
    return false
  }
}

function persistPending(next: PendingDrinkItPause) {
  pending.value = next
  writePendingDrinkItPause({
    clientRequestId: next.clientRequestId,
    desiredPaused: next.desiredPaused,
    cruiseConfigId: next.cruiseConfigId,
  })
}

function clearPendingResolved() {
  pending.value = null
  clearPendingDrinkItPause()
}

function restorePendingFromStorage(): PendingDrinkItPause | null {
  const stored = readPendingDrinkItPause()
  if (!stored) return null
  pending.value = stored
  feedback.value = {
    kind: 'unknown',
    title: copy.admin.pauseUnknownTitle,
    body: copy.admin.pauseUnknownBody,
  }
  return stored
}

function applyOutcome(
  outcome: Awaited<ReturnType<typeof applyDrinkItPaused>>,
) {
  if (outcome.pauseStatus) {
    status.value = outcome.pauseStatus
    loadStatus.value = 'ready'
  }

  if (outcome.status === 'ok') {
    clearPendingResolved()
    feedback.value = {
      kind: 'success',
      title: outcome.result.paused ? copy.admin.pauseSuccess : copy.admin.resumeSuccess,
      body: copy.admin.shipItUnaffected,
    }
    return
  }

  if (outcome.status === 'failed') {
    // Confirmed non-application (finale / auth / mismatch) — unlock.
    clearPendingResolved()
    feedback.value = {
      kind: 'error',
      title: copy.admin.pauseFailureTitle,
      body:
        outcome.code === 'finale'
          ? 'Drink It! is finalized. Pause and Resume are closed.'
          : outcome.message || copy.admin.pauseFailureBody,
    }
    return
  }

  // Unknown — keep pending locked.
  feedback.value = {
    kind: 'unknown',
    title: copy.admin.pauseUnknownTitle,
    body: outcome.message || copy.admin.pauseUnknownBody,
  }
}

onMounted(async () => {
  const restored = restorePendingFromStorage()
  await loadStatusOnly()

  if (restored && pending.value) {
    // Scope guard: if cruise config changed under us, keep locked and show unknown.
    const currentCruise = status.value?.cruise_config_id ?? null
    if (
      restored.cruiseConfigId &&
      currentCruise &&
      restored.cruiseConfigId !== currentCruise
    ) {
      feedback.value = {
        kind: 'unknown',
        title: copy.admin.pauseUnknownTitle,
        body: copy.admin.pauseUnknownBody,
      }
      return
    }

    busy.value = true
    try {
      const outcome = await reconcileDrinkItPause(
        restored.clientRequestId,
        restored.desiredPaused,
      )
      applyOutcome(outcome)
    } finally {
      busy.value = false
    }
  }
})

function openConfirm(mode: 'pause' | 'resume') {
  if (locked.value || finalized.value) return
  feedback.value = null
  confirm.value = mode
}

async function applyConfirmed() {
  if (!confirm.value || busy.value || pending.value) return
  const wantPaused = confirm.value === 'pause'
  const requestId = newPauseRequestId()
  busy.value = true
  confirm.value = null
  feedback.value = null

  // Persist BEFORE the network call so reload cannot drop the lock.
  persistPending({
    version: 1,
    clientRequestId: requestId,
    desiredPaused: wantPaused,
    cruiseConfigId: status.value?.cruise_config_id ?? null,
    createdAt: new Date().toISOString(),
  })

  try {
    const outcome = await applyDrinkItPaused(wantPaused, requestId)
    applyOutcome(outcome)
  } finally {
    busy.value = false
  }
}

/** Refresh Game Status — reconcile ledger; never clear pending on failure. */
async function reconcileOnly() {
  if (!pending.value || busy.value) return
  busy.value = true
  feedback.value = null
  try {
    const outcome = await reconcileDrinkItPause(
      pending.value.clientRequestId,
      pending.value.desiredPaused,
    )
    applyOutcome(outcome)
  } finally {
    busy.value = false
  }
}

/** Retry Same Change — same request id + fingerprint; never mint a new operation. */
async function retrySameChange() {
  if (!pending.value || busy.value) return
  busy.value = true
  feedback.value = null
  try {
    // Re-persist (same ids) so navigation mid-retry keeps protection.
    persistPending(pending.value)
    const outcome = await applyDrinkItPaused(
      pending.value.desiredPaused,
      pending.value.clientRequestId,
    )
    applyOutcome(outcome)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="mt-8 rounded-2xl p-4" style="background: #fff" data-testid="game-status-section">
    <h2 class="font-display text-base font-bold" style="color: #2f3a44">
      {{ copy.admin.gameStatus }}
    </h2>

    <p
      v-if="loadStatus === 'loading' && !status"
      class="mt-3 text-sm"
      style="color: #5c6670"
      data-testid="game-status-loading"
    >
      Loading…
    </p>

    <template v-if="status">
      <p
        class="mt-3 text-sm font-semibold"
        style="color: #2f3a44"
        data-testid="drinkit-pause-state"
        :data-paused="paused ? 'true' : 'false'"
        :data-finalized="finalized ? 'true' : 'false'"
        :data-pending="pending ? 'true' : 'false'"
      >
        {{ paused ? copy.admin.drinkItPaused : copy.admin.drinkItRunning }}
      </p>
      <p class="mt-1 text-xs" style="color: #5c6670">{{ copy.admin.shipItUnaffected }}</p>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          v-if="!paused"
          type="button"
          class="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style="background: #8b2942"
          data-testid="pause-drinkit"
          :disabled="locked || finalized"
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
          :disabled="locked || finalized"
          @click="openConfirm('resume')"
        >
          {{ copy.admin.resumeDrinkIt }}
        </button>
        <button
          v-if="pending"
          type="button"
          class="rounded-full px-4 py-2 text-sm font-semibold"
          style="background: #e8e2d9; color: #2f3a44"
          data-testid="reconcile-pause"
          :disabled="busy"
          @click="reconcileOnly"
        >
          {{ copy.admin.refreshGameStatus }}
        </button>
        <button
          v-if="pending"
          type="button"
          class="rounded-full px-4 py-2 text-sm font-semibold"
          style="background: #e8e2d9; color: #2f3a44"
          data-testid="retry-same-pause"
          :disabled="busy"
          @click="retrySameChange"
        >
          {{ copy.admin.retrySameChange }}
        </button>
      </div>
    </template>

    <div
      v-if="feedback"
      class="mt-4 rounded-xl px-3 py-2 text-sm"
      :style="{
        background:
          feedback.kind === 'success' ? '#e7f3ef' : feedback.kind === 'unknown' ? '#f5f0e6' : '#f8ecec',
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
