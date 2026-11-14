<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  applyBountyScheduleInit,
  fetchBountyScheduleStatus,
  newScheduleInitRequestId,
  reconcileBountyScheduleInit,
  type BountyScheduleStatus,
  type ScheduleInitApplyResult,
} from '@/lib/adminBountyScheduleInit'
import {
  clearPendingBountyScheduleInit,
  readPendingBountyScheduleInit,
  writePendingBountyScheduleInit,
  type PendingBountyScheduleInit,
} from '@/lib/pendingBountyScheduleInit'
import { copy } from '@/ui/copy'

const status = ref<BountyScheduleStatus | null>(null)
const loadStatus = ref<'loading' | 'ready' | 'error'>('loading')
const busy = ref(false)
const confirm = ref(false)
const feedback = ref<{
  kind: 'success' | 'error' | 'unknown'
  title: string
  body: string
} | null>(null)
const pending = ref<PendingBountyScheduleInit | null>(null)

const locked = computed(() => busy.value || Boolean(pending.value))
const initialized = computed(() => Boolean(status.value?.initialized))
const canInitialize = computed(() => Boolean(status.value?.can_initialize))
const finalized = computed(() => Boolean(status.value?.finalized_at_utc))

async function loadStatusOnly(): Promise<boolean> {
  try {
    status.value = await fetchBountyScheduleStatus()
    loadStatus.value = 'ready'
    return true
  } catch (err) {
    loadStatus.value = status.value ? 'ready' : 'error'
    if (!pending.value) {
      feedback.value = {
        kind: 'error',
        title: copy.admin.scheduleInitFailureTitle,
        body: err instanceof Error ? err.message : copy.admin.scheduleInitFailureBody,
      }
    }
    return false
  }
}

function persistPending(next: PendingBountyScheduleInit) {
  pending.value = next
  writePendingBountyScheduleInit(next)
}

function clearPendingResolved() {
  pending.value = null
  clearPendingBountyScheduleInit()
}

function restorePendingFromStorage(): PendingBountyScheduleInit | null {
  const stored = readPendingBountyScheduleInit()
  if (!stored) return null
  pending.value = stored
  feedback.value = {
    kind: 'unknown',
    title: copy.admin.scheduleInitUnknownTitle,
    body: copy.admin.scheduleInitUnknownBody,
  }
  return stored
}

function applyOutcome(outcome: ScheduleInitApplyResult) {
  if (outcome.scheduleStatus) {
    status.value = outcome.scheduleStatus
    loadStatus.value = 'ready'
  }

  if (outcome.status === 'ok') {
    clearPendingResolved()
    feedback.value = {
      kind: 'success',
      title: copy.admin.scheduleInitSuccess,
      body:
        outcome.result.code === 'SCHEDULE_ALREADY_INITIALIZED'
          ? copy.admin.scheduleInitAlreadyBody
          : copy.admin.scheduleInitSuccessBody,
    }
    void loadStatusOnly()
    return
  }

  if (outcome.status === 'failed') {
    clearPendingResolved()
    feedback.value = {
      kind: 'error',
      title: copy.admin.scheduleInitFailureTitle,
      body: outcome.message || copy.admin.scheduleInitFailureBody,
    }
    void loadStatusOnly()
    return
  }

  feedback.value = {
    kind: 'unknown',
    title: copy.admin.scheduleInitUnknownTitle,
    body: copy.admin.scheduleInitUnknownBody,
  }
}

async function applyConfirmed() {
  if (busy.value || pending.value) return
  confirm.value = false
  busy.value = true
  feedback.value = null
  const clientRequestId = newScheduleInitRequestId()
  const cruiseConfigId = status.value?.cruise_config_id ?? null
  persistPending({ clientRequestId, cruiseConfigId, seed: null })
  try {
    const outcome = await applyBountyScheduleInit({ clientRequestId, cruiseConfigId, seed: null })
    applyOutcome(outcome)
  } finally {
    busy.value = false
  }
}

async function reconcileOnly() {
  if (!pending.value || busy.value) return
  busy.value = true
  try {
    const outcome = await reconcileBountyScheduleInit({
      clientRequestId: pending.value.clientRequestId,
    })
    applyOutcome(outcome)
  } finally {
    busy.value = false
  }
}

async function retrySameChange() {
  if (!pending.value || busy.value) return
  busy.value = true
  feedback.value = null
  try {
    persistPending(pending.value)
    const outcome = await applyBountyScheduleInit({
      clientRequestId: pending.value.clientRequestId,
      cruiseConfigId: pending.value.cruiseConfigId,
      seed: pending.value.seed,
    })
    applyOutcome(outcome)
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  restorePendingFromStorage()
  await loadStatusOnly()
})
</script>

<template>
  <section
    class="mt-8 rounded-2xl p-4"
    style="background: #fff"
    data-testid="bounty-schedule-init-section"
  >
    <h2 class="font-display text-base font-bold" style="color: #2f3a44">
      {{ copy.admin.scheduleInitHeading }}
    </h2>
    <p class="mt-2 text-sm" style="color: #5c6670">
      {{ copy.admin.scheduleInitHint }}
    </p>

    <p
      v-if="loadStatus === 'loading' && !status"
      class="mt-3 text-sm"
      style="color: #5c6670"
      data-testid="schedule-init-loading"
    >
      Loading…
    </p>

    <template v-if="status">
      <p
        class="mt-3 text-sm font-semibold"
        style="color: #2f3a44"
        data-testid="schedule-init-state"
        :data-initialized="initialized ? 'true' : 'false'"
        :data-can-initialize="canInitialize ? 'true' : 'false'"
        :data-pending="pending ? 'true' : 'false'"
      >
        {{
          initialized
            ? copy.admin.scheduleInitReady
            : canInitialize
              ? copy.admin.scheduleInitNeeded
              : copy.admin.scheduleInitBlocked
        }}
      </p>
      <p
        v-if="status.completeness"
        class="mt-1 text-xs"
        style="color: #5c6670"
        data-testid="schedule-init-counts"
      >
        Cocktail {{ status.completeness.cocktail_slots }}/72 · Ingredient
        {{ status.completeness.ingredient_slots }}/39 · Bar
        {{ status.completeness.bar_assignments }}/7 · Daily
        {{ status.completeness.daily_challenges }}/7
      </p>

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          v-if="!initialized"
          type="button"
          class="rounded-full px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style="background: #0a5c6b"
          data-testid="initialize-bounty-schedule"
          :disabled="locked || finalized || !canInitialize"
          @click="confirm = true"
        >
          {{ copy.admin.scheduleInitAction }}
        </button>
        <button
          v-if="pending"
          type="button"
          class="rounded-full px-4 py-2 text-sm font-semibold"
          style="background: #e8e2d9; color: #2f3a44"
          data-testid="reconcile-schedule-init"
          :disabled="busy"
          @click="reconcileOnly"
        >
          {{ copy.admin.scheduleInitRefresh }}
        </button>
        <button
          v-if="pending"
          type="button"
          class="rounded-full px-4 py-2 text-sm font-semibold"
          style="background: #e8e2d9; color: #2f3a44"
          data-testid="retry-same-schedule-init"
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
          feedback.kind === 'success'
            ? '#e7f3ef'
            : feedback.kind === 'unknown'
              ? '#f5f0e6'
              : '#f8ecec',
        color: '#2f3a44',
      }"
      data-testid="schedule-init-feedback"
      :data-kind="feedback.kind"
    >
      <p class="font-semibold">{{ feedback.title }}</p>
      <p class="mt-1">{{ feedback.body }}</p>
    </div>

    <div
      v-if="confirm"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      data-testid="schedule-init-confirm-modal"
      role="dialog"
      aria-modal="true"
    >
      <div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lg">
        <h3 class="font-display text-lg font-bold" style="color: #2f3a44">
          {{ copy.admin.scheduleInitConfirmTitle }}
        </h3>
        <p class="mt-2 text-sm" style="color: #5c6670">
          {{ copy.admin.scheduleInitConfirmBody }}
        </p>
        <div class="mt-5 flex justify-end gap-2">
          <button
            type="button"
            class="rounded-full px-4 py-2 text-sm font-semibold"
            style="background: #e8e2d9; color: #2f3a44"
            data-testid="schedule-init-confirm-cancel"
            :disabled="busy"
            @click="confirm = false"
          >
            {{ copy.admin.cancel }}
          </button>
          <button
            type="button"
            class="rounded-full px-4 py-2 text-sm font-semibold text-white"
            style="background: #0a5c6b"
            data-testid="schedule-init-confirm-apply"
            :disabled="busy"
            @click="applyConfirmed"
          >
            {{ copy.admin.scheduleInitAction }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
