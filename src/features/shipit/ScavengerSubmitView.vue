<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PhotoCapture from '@/components/shared/PhotoCapture.vue'
import GameShell from '@/components/shared/GameShell.vue'
import { fetchShipItChallenges } from '@/lib/shipit/api'
import { submitScavenger } from '@/lib/shipit/submit'
import {
  clearPendingScavengerSubmit,
  clearPendingScavengerSubmitIfOtherPlayer,
  readPendingScavengerSubmit,
  writePendingScavengerSubmit,
} from '@/lib/pendingScavengerSubmit'
import { useSessionStore } from '@/stores/session'
import type { StagedPhotoRef } from '@/types/media'
import type { ShipItChallengeCard } from '@/types/shipit'
import { copy, formatCopy } from '@/ui/copy'

const route = useRoute()
const router = useRouter()
const session = useSessionStore()

const step = ref<'capture' | 'review'>('capture')
const loading = ref(true)
const error = ref<string | null>(null)
const challenge = ref<ShipItChallengeCard | null>(null)
const teamName = ref('')
const caption = ref('')
const staged = ref<StagedPhotoRef | null>(null)
const previewUrl = ref<string | null>(null)
const photoBusy = ref(false)
const submitting = ref(false)
const formLocked = ref(false)
const submitError = ref<string | null>(null)
const idempotencyKey = ref<string | null>(null)
const alreadyDone = ref(false)

const canSubmit = computed(
  () =>
    !!challenge.value &&
    !!staged.value?.photoId &&
    !photoBusy.value &&
    !submitting.value &&
    (!formLocked.value || submitError.value === 'unknown'),
)

async function loadChallenge() {
  loading.value = true
  error.value = null
  const id = typeof route.params.challengeId === 'string' ? route.params.challengeId : ''
  try {
    const board = await fetchShipItChallenges('all')
    teamName.value = board.team?.name ?? session.teamName ?? ''
    const cards = (board.sections ?? []).flatMap((s) => s.challenges)
    const found = cards.find((c) => c.id === id) ?? null
    if (!found) {
      error.value = copy.shipit.challengeMissing
      challenge.value = null
      return
    }
    if (found.completed) {
      alreadyDone.value = true
      challenge.value = found
      return
    }
    if (!found.submission_ready && !found.actionable) {
      error.value = copy.shipit.submissionClosed
      return
    }
    challenge.value = found
  } catch (err) {
    error.value = err instanceof Error ? err.message : copy.home.shipUnavailableDetail
  } finally {
    loading.value = false
  }
}

function restorePending() {
  const playerId = session.profile?.player_id ?? null
  clearPendingScavengerSubmitIfOtherPlayer(playerId)
  const pending = readPendingScavengerSubmit()
  if (!pending || !playerId || pending.playerId !== playerId) return
  const id = typeof route.params.challengeId === 'string' ? route.params.challengeId : ''
  if (pending.payload.challenge_id !== id) return
  idempotencyKey.value = pending.clientRequestId
  caption.value = pending.payload.caption ?? ''
  staged.value = {
    photoId: pending.payload.photo_id,
    bucket: 'game-photos',
    storagePath: '',
    status: 'staged',
    mimeType: 'image/jpeg',
    width: 1,
    height: 1,
    byteSize: 1,
  }
  formLocked.value = true
  submitError.value = 'unknown'
  step.value = 'review'
}

function onStaged(ref: StagedPhotoRef | null) {
  staged.value = ref
}

function onLocal(image: { previewUrl: string } | null) {
  previewUrl.value = image?.previewUrl ?? null
}

function goReview() {
  if (!staged.value?.photoId || photoBusy.value) return
  step.value = 'review'
}

async function performSubmit() {
  if (!challenge.value || !staged.value?.photoId || !session.profile?.player_id) return
  if (!idempotencyKey.value) idempotencyKey.value = crypto.randomUUID()
  const payload = {
    idempotency_key: idempotencyKey.value,
    challenge_id: challenge.value.id,
    photo_id: staged.value.photoId,
    caption: caption.value.trim() || null,
  }
  writePendingScavengerSubmit({
    clientRequestId: idempotencyKey.value,
    playerId: session.profile.player_id,
    cruiseConfigId: null,
    payload,
    summary: {
      title: challenge.value.title,
      teamName: teamName.value,
      points: challenge.value.points,
    },
  })
  formLocked.value = true
  submitting.value = true
  submitError.value = null
  try {
    const result = await submitScavenger(payload)
    if (result.ok && result.submission_id) {
      clearPendingScavengerSubmit()
      formLocked.value = false
      await router.replace({
        name: 'shipit-gallery',
        query: { submission: result.submission_id },
      })
      return
    }
    if (result.code === 'TEAM_CHALLENGE_DONE') {
      clearPendingScavengerSubmit()
      formLocked.value = false
      alreadyDone.value = true
      return
    }
    if (result.code === 'IDEMPOTENCY_PAYLOAD_MISMATCH') {
      clearPendingScavengerSubmit()
      formLocked.value = false
      idempotencyKey.value = null
      submitError.value = result.message ?? copy.shipit.submitFailed
      return
    }
    // Confirmed rejection — allow edit
    clearPendingScavengerSubmit()
    formLocked.value = false
    idempotencyKey.value = null
    submitError.value = result.message ?? result.code ?? copy.shipit.submitFailed
  } catch {
    submitError.value = 'unknown'
  } finally {
    submitting.value = false
  }
}

function unlockAfterReject() {
  if (submitError.value === 'unknown') return
  formLocked.value = false
  submitError.value = null
  step.value = 'capture'
}

function backToList() {
  void router.push({ name: 'shipit-challenges' })
}

onMounted(async () => {
  await loadChallenge()
  restorePending()
})
</script>

<template>
  <GameShell game="shipit" :title="copy.shipit.submitHeading" :show-switch="false">
    <div class="px-4 pb-28 pt-4" data-testid="scavenger-submit-page">
      <p v-if="loading" class="text-sm" style="color: var(--theme-muted)">{{ copy.shipit.loading }}</p>
      <p v-else-if="error" class="text-sm" style="color: var(--theme-ink)" data-testid="scavenger-error">
        {{ error }}
      </p>

      <div v-else-if="alreadyDone" class="space-y-4" data-testid="scavenger-already-done">
        <h2 class="font-display text-xl font-bold" style="color: var(--theme-ink)">
          {{ copy.shipit.alreadyCompletedTitle }}
        </h2>
        <p class="text-sm" style="color: var(--theme-muted)">{{ copy.shipit.alreadyCompletedBody }}</p>
        <button
          type="button"
          class="w-full rounded-full py-3 text-sm font-semibold text-white"
          style="background: var(--theme-primary)"
          data-testid="scavenger-back-list"
          @click="backToList"
        >
          {{ copy.shipit.backToChallenges }}
        </button>
      </div>

      <template v-else-if="challenge">
        <p class="text-xs font-semibold uppercase tracking-wide" style="color: var(--theme-muted)">
          {{ formatCopy(copy.shipit.teamCredit, { teamName }) }}
        </p>
        <h2 class="font-display mt-2 text-xl font-bold" style="color: var(--theme-ink)" data-testid="scavenger-title">
          {{ challenge.title }}
        </h2>
        <p class="mt-2 text-sm" style="color: var(--theme-ink)" data-testid="scavenger-instructions">
          {{ challenge.instructions }}
        </p>
        <p class="mt-2 text-sm font-semibold" style="color: var(--theme-primary)" data-testid="scavenger-points">
          {{ formatCopy(copy.shipit.pointsLabel, { points: challenge.points }) }}
        </p>

        <section v-if="step === 'capture'" class="mt-6" data-testid="scavenger-capture-step">
          <PhotoCapture
            game="shipit"
            purpose="scavenger"
            :required="true"
            :auto-stage="true"
            :disabled="formLocked && submitError !== 'unknown'"
            @staged="onStaged"
            @local-ready="onLocal"
            @busy="photoBusy = $event"
          />
          <label class="mt-6 block text-sm font-semibold" style="color: var(--theme-ink)">
            {{ copy.wizard.captionLabel }}
            <textarea
              v-model="caption"
              rows="3"
              class="mt-1 w-full resize-none rounded-2xl px-4 py-3 font-normal outline-none"
              style="background: var(--theme-card)"
              :placeholder="copy.wizard.captionPlaceholder"
              data-testid="scavenger-caption"
              :disabled="formLocked && submitError !== 'unknown'"
            />
          </label>
          <button
            type="button"
            class="mt-6 w-full rounded-full py-3 text-sm font-semibold text-white disabled:opacity-60"
            style="background: var(--theme-primary)"
            data-testid="scavenger-continue-review"
            :disabled="!staged?.photoId || photoBusy || (formLocked && submitError !== 'unknown')"
            @click="goReview"
          >
            {{ copy.shipit.continueReview }}
          </button>
        </section>

        <section v-else class="mt-6 space-y-4" data-testid="scavenger-review-step">
          <div class="rounded-2xl px-4 py-3" style="background: var(--theme-card)">
            <p class="text-xs uppercase tracking-wide" style="color: var(--theme-muted)">
              {{ copy.shipit.reviewChallenge }}
            </p>
            <p class="mt-1 font-semibold" style="color: var(--theme-ink)">{{ challenge.title }}</p>
          </div>
          <div class="rounded-2xl px-4 py-3" style="background: var(--theme-card)">
            <p class="text-xs uppercase tracking-wide" style="color: var(--theme-muted)">
              {{ copy.wizard.labelPhoto }}
            </p>
            <img
              v-if="previewUrl"
              :src="previewUrl"
              alt=""
              class="mt-2 aspect-square w-full max-w-[200px] rounded-xl object-cover"
              data-testid="scavenger-review-photo"
            />
            <p v-else class="mt-2 text-sm" data-testid="scavenger-review-photo-ready">
              {{ copy.photo.stagedReady }}
            </p>
          </div>
          <div class="rounded-2xl px-4 py-3" style="background: var(--theme-card)">
            <p class="text-xs uppercase tracking-wide" style="color: var(--theme-muted)">
              {{ copy.shipit.reviewTeam }}
            </p>
            <p class="mt-1 font-semibold" data-testid="scavenger-review-team">{{ teamName }}</p>
          </div>
          <div class="rounded-2xl px-4 py-3" style="background: var(--theme-card)">
            <p class="text-xs uppercase tracking-wide" style="color: var(--theme-muted)">
              {{ copy.shipit.reviewPoints }}
            </p>
            <p class="mt-1 font-semibold" data-testid="scavenger-review-points">
              {{ formatCopy(copy.shipit.pointsLabel, { points: challenge.points }) }}
            </p>
          </div>

          <div
            v-if="submitError === 'unknown'"
            class="rounded-2xl px-4 py-3 text-sm"
            style="background: var(--theme-card)"
            data-testid="scavenger-unknown"
          >
            <p class="font-semibold">{{ copy.wizard.unknownTitle }}</p>
            <p class="mt-1" style="color: var(--theme-muted)">{{ copy.wizard.unknownBody }}</p>
            <p class="mt-2 text-xs" style="color: var(--theme-muted)">{{ copy.wizard.resolveBeforeEdit }}</p>
          </div>
          <p
            v-else-if="submitError"
            class="text-sm"
            style="color: var(--theme-ink)"
            data-testid="scavenger-submit-error"
          >
            {{ submitError }}
          </p>

          <button
            type="button"
            class="w-full rounded-full py-3 text-sm font-semibold text-white disabled:opacity-60"
            style="background: var(--theme-primary)"
            data-testid="scavenger-submit"
            :disabled="!canSubmit"
            @click="performSubmit"
          >
            {{ submitting ? copy.shipit.submitting : copy.shipit.submit }}
          </button>
          <button
            v-if="!formLocked || submitError !== 'unknown'"
            type="button"
            class="w-full text-sm font-semibold underline"
            style="color: var(--theme-primary)"
            data-testid="scavenger-edit"
            @click="unlockAfterReject"
          >
            {{ copy.shipit.editPhoto }}
          </button>
        </section>
      </template>
    </div>
  </GameShell>
</template>
