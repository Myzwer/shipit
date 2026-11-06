<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  applyVoidSubmission,
  newVoidRequestId,
  previewVoidSubmission,
  reconcileVoidSubmission,
  type AdminVoidApplyResult,
  type AdminVoidPreview,
} from '@/lib/adminVoid'
import {
  clearPendingAdminVoid,
  readPendingAdminVoid,
  writePendingAdminVoid,
  type PendingAdminVoid,
} from '@/lib/pendingAdminVoid'
import { copy } from '@/ui/copy'

const submissionIdInput = ref('')
const reason = ref('')
const preview = ref<AdminVoidPreview | null>(null)
const loadStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const busy = ref(false)
const confirmOpen = ref(false)
const feedback = ref<{
  kind: 'success' | 'error' | 'unknown'
  title: string
  body: string
} | null>(null)
const pending = ref<PendingAdminVoid | null>(null)

const locked = computed(() => busy.value || Boolean(pending.value))
const canVoid = computed(
  () =>
    Boolean(preview.value?.ok && preview.value.void_permitted && preview.value.submission_id) &&
    !locked.value,
)

const displayTitle = computed(() => {
  const d = preview.value?.display ?? {}
  if (typeof d.drink_name === 'string') return d.drink_name
  if (typeof d.title === 'string') return d.title
  return preview.value?.kind ?? 'Submission'
})

async function runPreview() {
  const id = submissionIdInput.value.trim()
  if (!id) {
    feedback.value = {
      kind: 'error',
      title: copy.admin.voidFailureTitle,
      body: 'Enter a submission id.',
    }
    return
  }
  loadStatus.value = 'loading'
  feedback.value = null
  preview.value = null
  try {
    const row = await previewVoidSubmission(id)
    preview.value = row
    loadStatus.value = 'ready'
    if (!row.ok) {
      feedback.value = {
        kind: 'error',
        title: copy.admin.voidFailureTitle,
        body: row.message || row.code || copy.admin.voidFailureBody,
      }
    } else if (!row.void_permitted) {
      feedback.value = {
        kind: 'error',
        title: copy.admin.voidFailureTitle,
        body:
          row.void_block_code === 'FINALE_LOCKED'
            ? copy.admin.voidFinaleBody
            : row.void_block_code === 'ALREADY_VOIDED'
              ? 'This submission is already voided.'
              : copy.admin.voidFailureBody,
      }
    }
  } catch (err) {
    loadStatus.value = 'error'
    feedback.value = {
      kind: 'error',
      title: copy.admin.voidFailureTitle,
      body: err instanceof Error ? err.message : copy.admin.voidFailureBody,
    }
  }
}

function persistPending(next: PendingAdminVoid) {
  pending.value = next
  writePendingAdminVoid(next)
}

function clearPendingResolved() {
  pending.value = null
  clearPendingAdminVoid()
}

function applyOutcome(outcome: AdminVoidApplyResult) {
  if (outcome.status === 'ok') {
    clearPendingResolved()
    confirmOpen.value = false
    feedback.value = {
      kind: 'success',
      title: copy.admin.voidSuccess,
      body: `Removed ${outcome.result.points_removed ?? 0} points.`,
    }
    if (preview.value) {
      preview.value = {
        ...preview.value,
        status: 'voided',
        void_permitted: false,
        void_block_code: 'ALREADY_VOIDED',
        points_active: 0,
      }
    }
    return
  }
  if (outcome.status === 'failed') {
    clearPendingResolved()
    confirmOpen.value = false
    feedback.value = {
      kind: 'error',
      title: copy.admin.voidFailureTitle,
      body:
        outcome.code === 'finale'
          ? copy.admin.voidFinaleBody
          : outcome.message || copy.admin.voidFailureBody,
    }
    return
  }
  feedback.value = {
    kind: 'unknown',
    title: copy.admin.voidUnknownTitle,
    body: outcome.message || copy.admin.voidUnknownBody,
  }
}

async function confirmVoid() {
  if (!preview.value?.submission_id || !preview.value.expected_status) return
  const clientRequestId = newVoidRequestId()
  const record: PendingAdminVoid = {
    version: 1,
    clientRequestId,
    submissionId: preview.value.submission_id,
    expectedStatus: preview.value.expected_status,
    reason: reason.value.trim() || null,
    cruiseConfigId: null,
    createdAt: new Date().toISOString(),
  }
  persistPending(record)
  busy.value = true
  try {
    const outcome = await applyVoidSubmission({
      clientRequestId,
      submissionId: record.submissionId,
      expectedStatus: record.expectedStatus,
      reason: record.reason,
    })
    applyOutcome(outcome)
  } finally {
    busy.value = false
  }
}

async function retryPending() {
  if (!pending.value) return
  busy.value = true
  try {
    const outcome = await reconcileVoidSubmission(
      pending.value.clientRequestId,
      pending.value.submissionId,
      pending.value.expectedStatus,
      pending.value.reason,
    )
    applyOutcome(outcome)
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  const stored = readPendingAdminVoid()
  if (!stored) return
  pending.value = stored
  submissionIdInput.value = stored.submissionId
  reason.value = stored.reason ?? ''
  feedback.value = {
    kind: 'unknown',
    title: copy.admin.voidUnknownTitle,
    body: copy.admin.voidUnknownBody,
  }
  busy.value = true
  try {
    await runPreview()
    const outcome = await reconcileVoidSubmission(
      stored.clientRequestId,
      stored.submissionId,
      stored.expectedStatus,
      stored.reason,
    )
    applyOutcome(outcome)
  } finally {
    busy.value = false
  }
})
</script>

<template>
  <section class="mt-8" data-testid="admin-void-section">
    <h2 class="font-display text-base font-bold tracking-wide" style="color: #2f3a44">
      {{ copy.admin.voidHeading }}
    </h2>
    <p class="mt-1 text-sm" style="color: #5a6570">
      Emergency only. Reverses scoring before Friday 6 PM Ship Time.
    </p>

    <label class="mt-4 block text-xs font-semibold uppercase tracking-wide" style="color: #5a6570">
      Submission ID
      <input
        v-model="submissionIdInput"
        type="text"
        class="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
        style="border-color: #c9c2b8; color: #2f3a44"
        data-testid="admin-void-submission-id"
        :disabled="locked"
        autocomplete="off"
      />
    </label>

    <label class="mt-3 block text-xs font-semibold uppercase tracking-wide" style="color: #5a6570">
      Reason (optional)
      <input
        v-model="reason"
        type="text"
        class="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
        style="border-color: #c9c2b8; color: #2f3a44"
        data-testid="admin-void-reason"
        :disabled="locked"
      />
    </label>

    <button
      type="button"
      class="mt-3 rounded-full px-5 py-2 text-sm font-semibold text-white"
      style="background: #0a5c6b"
      data-testid="admin-void-preview"
      :disabled="locked || loadStatus === 'loading'"
      @click="runPreview"
    >
      Preview Void
    </button>

    <div
      v-if="preview?.ok"
      class="mt-4 rounded-2xl p-4 text-sm"
      style="background: #fff; color: #2f3a44"
      data-testid="admin-void-preview-card"
    >
      <p class="font-semibold">{{ displayTitle }}</p>
      <p class="mt-1" style="color: #5a6570">
        {{ preview.game }} · {{ preview.kind }} · Day {{ preview.ship_day }}
      </p>
      <p class="mt-1">
        {{ preview.owner_player_name || 'Player' }}
        <span v-if="preview.owner_team_name"> · {{ preview.owner_team_name }}</span>
      </p>
      <p class="mt-2 font-semibold" data-testid="admin-void-points">
        Points to remove: {{ preview.points_active ?? 0 }}
      </p>
      <ul v-if="preview.claims?.length" class="mt-2 list-disc pl-5" data-testid="admin-void-claims">
        <li v-for="c in preview.claims" :key="String(c.claim_id)">
          {{ c.category }} · {{ c.points }} pts · {{ c.status }}
        </li>
      </ul>
      <p v-if="preview.scavenger_completion" class="mt-2" data-testid="admin-void-completion">
        Challenge: {{ preview.scavenger_completion.title }} ({{
          preview.scavenger_completion.points
        }}
        pts)
      </p>
      <p class="mt-2 text-xs" style="color: #5a6570">
        Gallery post will be hidden. Photo kept for audit. Achievements not evaluated yet.
      </p>
    </div>

    <button
      v-if="canVoid"
      type="button"
      class="mt-4 rounded-full px-5 py-2 text-sm font-semibold text-white"
      style="background: #8b2e2e"
      data-testid="admin-void-open-confirm"
      @click="confirmOpen = true"
    >
      {{ copy.admin.voidAction }}
    </button>

    <div
      v-if="confirmOpen"
      class="mt-4 rounded-2xl p-4"
      style="background: #fff3f0; color: #2f3a44"
      data-testid="admin-void-confirm"
    >
      <p class="font-semibold">{{ copy.admin.voidConfirmTitle }}</p>
      <p class="mt-2 text-sm">{{ copy.admin.voidConfirmBody }}</p>
      <div class="mt-4 flex gap-2">
        <button
          type="button"
          class="rounded-full px-5 py-2 text-sm font-semibold text-white"
          style="background: #8b2e2e"
          data-testid="admin-void-confirm-yes"
          :disabled="locked"
          @click="confirmVoid"
        >
          {{ copy.admin.voidAction }}
        </button>
        <button
          type="button"
          class="rounded-full px-5 py-2 text-sm font-semibold"
          style="background: #e8e2da; color: #2f3a44"
          data-testid="admin-void-confirm-cancel"
          :disabled="busy"
          @click="confirmOpen = false"
        >
          {{ copy.admin.cancel }}
        </button>
      </div>
    </div>

    <div
      v-if="feedback"
      class="mt-4 rounded-2xl px-4 py-3 text-sm"
      :style="
        feedback.kind === 'success'
          ? { background: '#e7f6ef', color: '#1f4d3a' }
          : feedback.kind === 'unknown'
            ? { background: '#fff6e5', color: '#6a4b12' }
            : { background: '#fdeceb', color: '#6b1f1f' }
      "
      data-testid="admin-void-feedback"
    >
      <p class="font-semibold">{{ feedback.title }}</p>
      <p class="mt-1">{{ feedback.body }}</p>
      <button
        v-if="feedback.kind === 'unknown' && pending"
        type="button"
        class="mt-2 font-semibold underline"
        data-testid="admin-void-retry"
        :disabled="busy"
        @click="retryPending"
      >
        {{ copy.admin.retrySameVoid }}
      </button>
    </div>
  </section>
</template>
