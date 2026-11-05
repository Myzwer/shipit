<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  applyManualCorrection,
  fetchAdminClockDiagnostics,
  previewManualDelta,
  reconcileManualCorrection,
  saveShipClockPlan,
  type ApplyCorrectionResult,
} from '@/lib/adminClock'
import {
  cruiseDayWeekdayName,
  formatCruiseDayLabel,
  formatPlanDeltaLabel,
  formatShipDateTime,
  formatShipTimeOfDay,
  formatUtcOffsetLabel,
  parseShipLocal,
} from '@/lib/shipClockFormat'
import { copy, formatCopy } from '@/ui/copy'
import type {
  AdminClockDiagnostics,
  ManualCorrectionIntent,
  PlanDaySelectValue,
  PlanDeltaChoice,
  ShipClockPlanDay,
  ShipClockPlanDraftDay,
} from '@/types/shipClock'

const diagnostics = ref<AdminClockDiagnostics | null>(null)
const loadStatus = ref<'loading' | 'ready' | 'unavailable' | 'error'>('loading')
const loadError = ref<string | null>(null)

const busy = ref(false)
const feedback = ref<{
  kind: 'success' | 'error' | 'unknown'
  title: string
  body: string
} | null>(null)

type ConfirmMode =
  | { type: 'manual'; intent: ManualCorrectionIntent; currentLocal: string; proposedLocal: string }
  | { type: 'plan'; days: ShipClockPlanDraftDay[] }
  | null

const confirm = ref<ConfirmMode>(null)
/** Pending UNKNOWN attempt — never auto-reapply ±1h; reconcile first. */
const unknownAttempt = ref<{
  intent: ManualCorrectionIntent
  before: import('@/types/shipClock').ShipClockState
  clientRequestId: string
} | null>(null)

const setTimeInput = ref('')
const draftPlan = ref<Record<number, PlanDaySelectValue>>({
  1: '0',
  2: '0',
  3: '0',
  4: '0',
  5: '0',
  6: '0',
  7: '0',
})

function planSelectToDraft(day: number, value: PlanDaySelectValue): ShipClockPlanDraftDay {
  if (value === 'off') {
    return { day_number: day, delta_minutes: 0, enabled: false }
  }
  const delta = Number(value) as PlanDeltaChoice
  return { day_number: day, delta_minutes: delta, enabled: true }
}

function planRowToSelect(row: ShipClockPlanDay): PlanDaySelectValue {
  if (!row.enabled) return 'off'
  if (row.delta_minutes === -120) return '-120'
  if (row.delta_minutes === -60) return '-60'
  if (row.delta_minutes === 60) return '60'
  if (row.delta_minutes === 120) return '120'
  return '0'
}

const state = computed(() => diagnostics.value?.state ?? null)
const plan = computed(() => diagnostics.value?.plan ?? [])
const events = computed(() => diagnostics.value?.events ?? [])

const cruiseDayText = computed(() => {
  if (!state.value) return null
  if (state.value.cruise_day != null && state.value.ship_date) {
    return formatCopy(copy.admin.cruiseDay, {
      dayNumber: state.value.cruise_day,
      weekday: cruiseDayWeekdayName(state.value.cruise_day),
    })
  }
  return formatCruiseDayLabel(state.value)
})

const scheduleOn = computed(() =>
  plan.value.some((p) => p.enabled && p.delta_minutes !== 0),
)

const manualHistory = computed(() =>
  events.value
    .filter((e) => e.source === 'manual_delta' || e.source === 'manual_set')
    .slice()
    .reverse()
    .slice(0, 8),
)

const appliedScheduleKeys = computed(() => {
  const at = state.value?.at_utc
  if (!at) return new Set<string>()
  const atMs = new Date(at).getTime()
  const keys = new Set<string>()
  for (const e of events.value) {
    if (e.schedule_key && new Date(e.effective_at_utc).getTime() <= atMs) {
      keys.add(e.schedule_key)
    }
  }
  return keys
})

function isHistoricalDay(dayNumber: number) {
  return appliedScheduleKeys.value.has(`plan:day:${dayNumber}`)
}

function syncDraftFromPlan(rows: ShipClockPlanDay[]) {
  const next: Record<number, PlanDaySelectValue> = {
    1: '0',
    2: '0',
    3: '0',
    4: '0',
    5: '0',
    6: '0',
    7: '0',
  }
  for (const row of rows) {
    next[row.day_number] = planRowToSelect(row)
  }
  draftPlan.value = next
}

function draftDays(): ShipClockPlanDraftDay[] {
  return ([1, 2, 3, 4, 5, 6, 7] as const).map((day) =>
    planSelectToDraft(day, draftPlan.value[day] ?? '0'),
  )
}

async function loadDiagnostics() {
  loadStatus.value = 'loading'
  loadError.value = null
  try {
    const data = await fetchAdminClockDiagnostics()
    diagnostics.value = data
    syncDraftFromPlan(data.plan ?? [])
    if (data.state?.ship_local) {
      const p = parseShipLocal(data.state.ship_local)
      if (p) setTimeInput.value = `${p.date}T${String(p.hours).padStart(2, '0')}:${String(p.minutes).padStart(2, '0')}`
    }
    loadStatus.value = data.state?.configured === false ? 'unavailable' : 'ready'
  } catch (err) {
    loadStatus.value = 'error'
    loadError.value = err instanceof Error ? err.message : copy.admin.error
  }
}

onMounted(() => {
  void loadDiagnostics()
})

async function startMinusPlus(delta: 60 | -60) {
  if (busy.value || unknownAttempt.value) return
  feedback.value = null
  busy.value = true
  try {
    const preview = await previewManualDelta(delta)
    confirm.value = {
      type: 'manual',
      intent: {
        kind: delta === 60 ? 'plus_1h' : 'minus_1h',
        deltaMinutes: delta,
      },
      currentLocal: preview.before.ship_local ?? '',
      proposedLocal: preview.after_ship_local,
    }
  } catch (err) {
    feedback.value = {
      kind: 'error',
      title: copy.admin.failureTitle,
      body: err instanceof Error ? err.message : copy.admin.failureBody,
    }
  } finally {
    busy.value = false
  }
}

function startSetTime() {
  if (busy.value || unknownAttempt.value || !setTimeInput.value) return
  feedback.value = null
  const raw = setTimeInput.value.length === 16 ? `${setTimeInput.value}:00` : setTimeInput.value
  const normalized = raw.includes('T') ? raw.replace(' ', 'T') : raw
  const current = state.value?.ship_local ?? ''
  confirm.value = {
    type: 'manual',
    intent: { kind: 'set_time', targetShipLocal: normalized },
    currentLocal: current,
    proposedLocal: normalized,
  }
}

function startSavePlan() {
  if (busy.value || unknownAttempt.value) return
  feedback.value = null
  confirm.value = { type: 'plan', days: draftDays() }
}

function cancelConfirm() {
  confirm.value = null
}

async function handleApplyResult(result: ApplyCorrectionResult) {
  if (result.status === 'ok') {
    diagnostics.value = result.diagnostics
    syncDraftFromPlan(result.diagnostics.plan ?? [])
    unknownAttempt.value = null
    feedback.value = {
      kind: 'success',
      title: copy.admin.successApplied,
      body: result.after.ship_local
        ? `Now ${formatShipDateTime(result.after.ship_local)} Ship Time.`
        : copy.admin.successApplied,
    }
    return
  }
  if (result.status === 'unknown') {
    if (result.diagnostics) {
      diagnostics.value = result.diagnostics
      syncDraftFromPlan(result.diagnostics.plan ?? [])
    }
    unknownAttempt.value = {
      intent: result.intent,
      before: result.before,
      clientRequestId: result.clientRequestId,
    }
    feedback.value = {
      kind: 'unknown',
      title: copy.admin.unknownTitle,
      body: result.message || copy.admin.unknownBody,
    }
    return
  }
  unknownAttempt.value = null
  feedback.value = {
    kind: 'error',
    title: copy.admin.failureTitle,
    body: copy.admin.failureBody,
  }
}

async function confirmManual() {
  if (!confirm.value || confirm.value.type !== 'manual' || busy.value) return
  if (unknownAttempt.value) return
  const intent = confirm.value.intent
  confirm.value = null
  busy.value = true
  feedback.value = null
  try {
    const result = await applyManualCorrection(intent)
    await handleApplyResult(result)
  } finally {
    busy.value = false
  }
}

async function confirmPlan() {
  if (!confirm.value || confirm.value.type !== 'plan' || busy.value) return
  const days = confirm.value.days
  confirm.value = null
  busy.value = true
  feedback.value = null
  try {
    const next = await saveShipClockPlan(days)
    diagnostics.value = next.diagnostics
    syncDraftFromPlan(next.plan ?? next.diagnostics.plan ?? [])
    feedback.value = {
      kind: 'success',
      title: copy.admin.successPlanSaved,
      body: copy.admin.scheduleHint,
    }
  } catch {
    feedback.value = {
      kind: 'error',
      title: copy.admin.failureTitle,
      body: copy.admin.failureBody,
    }
  } finally {
    busy.value = false
  }
}

/** Refresh only — never re-sends the same ±1h / set-time mutation. */
async function refreshUnknownAttempt() {
  if (!unknownAttempt.value || busy.value) return
  busy.value = true
  try {
    const result = await reconcileManualCorrection(
      unknownAttempt.value.clientRequestId,
      unknownAttempt.value.intent,
      unknownAttempt.value.before,
    )
    await handleApplyResult(result)
    // After a successful refresh that still cannot find the event, allow a
    // deliberate new preview (operator must open confirm again).
    if (result.status === 'unknown' && result.diagnostics) {
      // Keep blocking auto-retry; operator can dismiss by starting a new preview
      // only after acknowledging refresh showed current time.
    }
  } finally {
    busy.value = false
  }
}

function clearUnknownAndAllowNewAction() {
  unknownAttempt.value = null
  feedback.value = null
}
</script>

<template>
  <section class="mt-6" data-testid="ship-clock-section" :aria-label="copy.admin.clockSection">
    <h2 class="font-display text-lg font-bold tracking-wide" style="color: #2f3a44">
      {{ copy.admin.clockSection }}
    </h2>

    <div v-if="loadStatus === 'loading'" class="mt-4 text-sm" style="color: #5b6770">
      {{ copy.admin.loading }}
    </div>

    <div v-else-if="loadStatus === 'unavailable'" class="mt-4 rounded-2xl px-4 py-3 text-sm" style="background: #ebe6df; color: #5b6770">
      {{ copy.admin.unavailable }}
    </div>

    <div v-else-if="loadStatus === 'error'" class="mt-4 space-y-3">
      <p class="text-sm" style="color: #8b3a3a">{{ loadError || copy.admin.error }}</p>
      <button
        type="button"
        class="rounded-full px-5 py-2 text-sm font-semibold text-white"
        style="background: #0a5c6b"
        @click="loadDiagnostics"
      >
        {{ copy.admin.retry }}
      </button>
    </div>

    <template v-else-if="state">
      <div class="mt-4 rounded-2xl px-4 py-4" style="background: #ebe6df" data-testid="clock-overview">
        <p class="text-xs font-semibold uppercase tracking-wide" style="color: #5b6770">
          {{ copy.admin.currentShipTime }}
        </p>
        <p class="mt-1 font-display text-2xl font-bold tabular-nums" style="color: #2f3a44">
          {{ state.ship_local ? formatShipTimeOfDay(state.ship_local) : '—' }}
        </p>
        <p v-if="cruiseDayText" class="mt-1 text-sm" style="color: #2f3a44">{{ cruiseDayText }}</p>
        <p v-if="state.ship_date" class="text-sm" style="color: #5b6770">{{ state.ship_date }}</p>
        <dl class="mt-3 grid grid-cols-1 gap-2 text-sm">
          <div class="flex justify-between gap-3">
            <dt style="color: #5b6770">{{ copy.admin.offsetLabel }}</dt>
            <dd class="font-medium tabular-nums" style="color: #2f3a44">
              {{
                state.offset_minutes != null ? formatUtcOffsetLabel(state.offset_minutes) : '—'
              }}
            </dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt style="color: #5b6770">{{ copy.admin.lifecycleLabel }}</dt>
            <dd class="font-medium capitalize" style="color: #2f3a44">{{ state.lifecycle }}</dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt style="color: #5b6770">{{ copy.games.drinkIt }}</dt>
            <dd class="font-medium" style="color: #2f3a44">
              {{ state.games?.drinkit.paused ? 'paused' : state.games?.drinkit.status }}
            </dd>
          </div>
          <div class="flex justify-between gap-3">
            <dt style="color: #5b6770">{{ copy.games.shipIt }}</dt>
            <dd class="font-medium" style="color: #2f3a44">{{ state.games?.shipit.status }}</dd>
          </div>
        </dl>
        <p v-if="state.config_label" class="mt-3 text-xs" style="color: #5b6770">
          Config: {{ state.config_label }}
        </p>
      </div>

      <div
        v-if="feedback"
        class="mt-4 rounded-2xl px-4 py-3 text-sm"
        :style="
          feedback.kind === 'success'
            ? { background: '#dcefe8', color: '#1d5c4a' }
            : feedback.kind === 'unknown'
              ? { background: '#f5ecd7', color: '#6a4b12' }
              : { background: '#f3dede', color: '#8b3a3a' }
        "
        data-testid="clock-feedback"
      >
        <p class="font-semibold">{{ feedback.title }}</p>
        <p class="mt-1">{{ feedback.body }}</p>
        <div v-if="feedback.kind === 'unknown' && unknownAttempt" class="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-full px-4 py-2 text-xs font-semibold text-white"
            style="background: #0a5c6b"
            :disabled="busy"
            data-testid="refresh-unknown"
            @click="refreshUnknownAttempt"
          >
            {{ copy.admin.refreshStatus }}
          </button>
          <button
            type="button"
            class="rounded-full px-4 py-2 text-xs font-semibold"
            style="background: #ebe6df; color: #2f3a44"
            :disabled="busy"
            data-testid="dismiss-unknown"
            @click="clearUnknownAndAllowNewAction"
          >
            {{ copy.admin.cancel }}
          </button>
        </div>
      </div>

      <div class="mt-5" data-testid="manual-controls">
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style="background: #2f3a44"
            :disabled="busy || Boolean(unknownAttempt)"
            data-testid="minus-1h"
            @click="startMinusPlus(-60)"
          >
            {{ copy.admin.minus1Hour }}
          </button>
          <button
            type="button"
            class="rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style="background: #2f3a44"
            :disabled="busy || Boolean(unknownAttempt)"
            data-testid="plus-1h"
            @click="startMinusPlus(60)"
          >
            {{ copy.admin.plus1Hour }}
          </button>
        </div>

        <label class="mt-4 block text-sm font-medium" style="color: #2f3a44">
          {{ copy.admin.setTimeLabel }}
          <input
            v-model="setTimeInput"
            type="datetime-local"
            class="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
            data-testid="set-time-input"
            :disabled="Boolean(unknownAttempt)"
          />
        </label>
        <button
          type="button"
          class="mt-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          style="background: #0a5c6b"
          :disabled="busy || !setTimeInput || Boolean(unknownAttempt)"
          data-testid="set-ship-time"
          @click="startSetTime"
        >
          {{ copy.admin.setShipTime }}
        </button>
      </div>

      <div class="mt-8" data-testid="plan-schedule">
        <h3 class="font-display text-base font-bold" style="color: #2f3a44">
          {{ copy.admin.plannedHeading }}
        </h3>
        <p class="mt-1 text-xs font-semibold uppercase tracking-wide" style="color: #5b6770">
          {{ scheduleOn ? copy.admin.scheduleOn : copy.admin.scheduleOff }}
        </p>
        <p class="mt-1 text-sm" style="color: #5b6770">{{ copy.admin.scheduleHint }}</p>

        <ul class="mt-4 space-y-3">
          <li
            v-for="day in 7"
            :key="day"
            class="rounded-2xl px-3 py-3"
            style="background: #ebe6df"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-semibold" style="color: #2f3a44">
                Day {{ day }} · {{ cruiseDayWeekdayName(day) }}
              </p>
              <select
                v-model="draftPlan[day]"
                class="rounded-lg border border-black/10 bg-white px-2 py-1.5 text-sm"
                :data-testid="`plan-day-${day}`"
              >
                <option value="off">{{ copy.admin.planDisabled }}</option>
                <option value="0">{{ copy.admin.planNoChange }}</option>
                <option value="-60">{{ copy.admin.planMinus1 }}</option>
                <option value="60">{{ copy.admin.planPlus1 }}</option>
                <option value="-120">{{ copy.admin.planMinus2 }}</option>
                <option value="120">{{ copy.admin.planPlus2 }}</option>
              </select>
            </div>
            <p v-if="isHistoricalDay(day)" class="mt-2 text-xs leading-snug" style="color: #6a4b12">
              {{ copy.admin.historicalPlanNote }}
            </p>
            <p v-else class="mt-2 text-xs" style="color: #5b6770">
              Planned:
              {{
                formatPlanDeltaLabel(
                  planSelectToDraft(day, draftPlan[day] ?? '0').delta_minutes,
                  planSelectToDraft(day, draftPlan[day] ?? '0').enabled,
                )
              }}
              at 3:00 AM Ship Time
            </p>
          </li>
        </ul>

        <button
          type="button"
          class="mt-4 w-full rounded-full px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          style="background: #0a5c6b"
          :disabled="busy"
          data-testid="save-plan"
          @click="startSavePlan"
        >
          {{ copy.admin.savePlan }}
        </button>
      </div>

      <div class="mt-8" data-testid="manual-history">
        <h3 class="font-display text-base font-bold" style="color: #2f3a44">
          {{ copy.admin.manualHistory }}
        </h3>
        <p v-if="manualHistory.length === 0" class="mt-2 text-sm" style="color: #5b6770">
          {{ copy.admin.noManualHistory }}
        </p>
        <ul v-else class="mt-3 space-y-2 text-sm">
          <li
            v-for="ev in manualHistory"
            :key="ev.id"
            class="rounded-xl px-3 py-2"
            style="background: #ebe6df; color: #2f3a44"
          >
            <span class="font-medium">{{ ev.source }}</span>
            · {{ ev.delta_minutes > 0 ? '+' : '' }}{{ ev.delta_minutes }} min
            <span class="block text-xs" style="color: #5b6770">{{ ev.note || ev.effective_at_utc }}</span>
          </li>
        </ul>
      </div>
    </template>

    <!-- Confirm dialog -->
    <div
      v-if="confirm"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      data-testid="confirm-dialog"
      role="dialog"
      aria-modal="true"
    >
      <div class="w-full max-w-md rounded-2xl bg-white p-5 shadow-lg">
        <template v-if="confirm.type === 'manual'">
          <h3 class="font-display text-lg font-bold" style="color: #2f3a44">
            {{ copy.admin.confirmAdjustTitle }}
          </h3>
          <p class="mt-2 text-sm leading-relaxed" style="color: #5b6770">
            {{ copy.admin.confirmAdjustBody }}
          </p>
          <p
            v-if="state?.lifecycle === 'active'"
            class="mt-2 text-sm font-medium"
            style="color: #6a4b12"
          >
            {{ copy.admin.confirmAdjustActiveWarn }}
          </p>
          <dl class="mt-4 space-y-2 text-sm">
            <div class="flex justify-between gap-3">
              <dt style="color: #5b6770">{{ copy.admin.previewCurrent }}</dt>
              <dd class="font-medium tabular-nums" style="color: #2f3a44">
                {{ confirm.currentLocal ? formatShipDateTime(confirm.currentLocal) : '—' }}
              </dd>
            </div>
            <div class="flex justify-between gap-3">
              <dt style="color: #5b6770">{{ copy.admin.previewProposed }}</dt>
              <dd class="font-medium tabular-nums" style="color: #2f3a44">
                {{
                  formatShipDateTime(
                    confirm.proposedLocal.length === 16
                      ? `${confirm.proposedLocal}:00`
                      : confirm.proposedLocal,
                  )
                }}
              </dd>
            </div>
          </dl>
          <div class="mt-5 flex gap-2">
            <button
              type="button"
              class="flex-1 rounded-full px-4 py-3 text-sm font-semibold"
              style="background: #ebe6df; color: #2f3a44"
              :disabled="busy"
              @click="cancelConfirm"
            >
              {{ copy.admin.cancel }}
            </button>
            <button
              type="button"
              class="flex-1 rounded-full px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              style="background: #0a5c6b"
              :disabled="busy"
              data-testid="confirm-apply"
              @click="confirmManual"
            >
              {{ copy.admin.applyTimeAdjustment }}
            </button>
          </div>
        </template>
        <template v-else>
          <h3 class="font-display text-lg font-bold" style="color: #2f3a44">
            {{ copy.admin.confirmPlanTitle }}
          </h3>
          <p class="mt-2 text-sm leading-relaxed" style="color: #5b6770">
            {{ copy.admin.confirmPlanBody }}
          </p>
          <div class="mt-5 flex gap-2">
            <button
              type="button"
              class="flex-1 rounded-full px-4 py-3 text-sm font-semibold"
              style="background: #ebe6df; color: #2f3a44"
              :disabled="busy"
              @click="cancelConfirm"
            >
              {{ copy.admin.cancel }}
            </button>
            <button
              type="button"
              class="flex-1 rounded-full px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
              style="background: #0a5c6b"
              :disabled="busy"
              data-testid="confirm-plan"
              @click="confirmPlan"
            >
              {{ copy.admin.savePlan }}
            </button>
          </div>
        </template>
      </div>
    </div>
  </section>
</template>
