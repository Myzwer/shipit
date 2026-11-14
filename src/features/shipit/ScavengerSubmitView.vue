<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/shared/AppIcon.vue'
import FloatingBottomNav from '@/components/shared/FloatingBottomNav.vue'
import WizardModal from '@/features/drinkit/log/WizardModal.vue'
import WizardProgress from '@/features/drinkit/log/WizardProgress.vue'
import ScavengerPhotoStep from '@/features/shipit/ScavengerPhotoStep.vue'
import ScavengerReviewStep from '@/features/shipit/ScavengerReviewStep.vue'
import { setPhotoFraming as persistStagedFraming } from '@/lib/media/stagePhoto'
import { cloneFraming, type PhotoFraming } from '@/lib/media/framing'
import { fetchShipItChallenges } from '@/lib/shipit/api'
import { submitScavenger } from '@/lib/shipit/submit'
import {
  clearPendingScavengerSubmit,
  clearPendingScavengerSubmitIfOtherPlayer,
  readPendingScavengerSubmit,
  writePendingScavengerSubmit,
} from '@/lib/pendingScavengerSubmit'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { useSessionStore } from '@/stores/session'
import type { StagedPhotoRef } from '@/types/media'
import type { ShipItChallengeCard } from '@/types/shipit'
import { copy } from '@/ui/copy'

type WizardStepId = 'photo' | 'review'
type ModalKind = null | 'exit' | 'startOver' | 'unknown' | 'ended'

const STEPS: WizardStepId[] = ['photo', 'review']

const route = useRoute()
const router = useRouter()
const session = useSessionStore()
const awardsMode = useAwardsModeStore()

const step = ref<WizardStepId>('photo')
const loading = ref(true)
const error = ref<string | null>(null)
const challenge = ref<ShipItChallengeCard | null>(null)
const teamName = ref('')
const caption = ref('')
const staged = ref<StagedPhotoRef | null>(null)
const previewUrl = ref<string | null>(null)
const previewWidth = ref<number | null>(null)
const previewHeight = ref<number | null>(null)
const photoFraming = ref<PhotoFraming | null>(null)
const submitting = ref(false)
const formLocked = ref(false)
const submitError = ref<string | null>(null)
const idempotencyKey = ref<string | null>(null)
const alreadyDone = ref(false)
const showFinaleGate = ref(false)
const focusCaption = ref(false)
const modal = ref<ModalKind>(null)
const wizardEl = ref<HTMLElement | null>(null)
const submitSucceeded = ref(false)

/**
 * Route the player already chose when a guard cancelled navigation.
 * Header Exit leaves this null and falls back to Challenges.
 * Completed only after Exit and Discard, via a fresh router.push.
 */
let pendingDestination: string | null = null
let confirmLeave = false
let discardOnLeave = false
let exitInFlight = false
let scrollFrame = 0

const progressSteps = computed(() =>
  STEPS.map((id) => ({
    id,
    label: copy.shipit.steps[id],
  })),
)

const photoRestoreSnapshot = computed(() => {
  const url = previewUrl.value
  const width = previewWidth.value
  const height = previewHeight.value
  if (!url || !(width && height)) return null
  return {
    previewUrl: url,
    width,
    height,
    framing: photoFraming.value,
    staged: staged.value,
  }
})

const hasDraft = computed(
  () =>
    !!staged.value?.photoId ||
    !!previewUrl.value ||
    !!caption.value.trim() ||
    step.value === 'review' ||
    formLocked.value,
)

const completed = computed(() => {
  const set = new Set<string>()
  // Photo required: once staged, both progress segments are reachable.
  if (staged.value?.photoId) {
    set.add('photo')
    set.add('review')
  }
  const idx = STEPS.indexOf(step.value)
  for (let i = 0; i < idx; i++) set.add(STEPS[i]!)
  return set
})

const showBack = computed(() => !loading.value && !error.value && !alreadyDone.value && !showFinaleGate.value)

const canSubmit = computed(
  () =>
    !!challenge.value &&
    !!staged.value?.photoId &&
    !submitting.value &&
    (!formLocked.value || submitError.value === 'unknown'),
)

const editsLocked = computed(() => formLocked.value)

function challengesPath() {
  return awardsMode.isAwardsMode ? '/shipit/wrapped' : '/shipit/challenges'
}

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

/** Resolve a pending submit for a *different* challenge so we never silently overwrite it. */
async function reconcileForeignPending() {
  const playerId = session.profile?.player_id ?? null
  clearPendingScavengerSubmitIfOtherPlayer(playerId)
  const pending = readPendingScavengerSubmit()
  if (!pending || !playerId || pending.playerId !== playerId) return
  const id = typeof route.params.challengeId === 'string' ? route.params.challengeId : ''
  if (pending.payload.challenge_id === id) return
  try {
    const result = await submitScavenger(pending.payload)
    if (
      result.ok ||
      result.code === 'TEAM_CHALLENGE_DONE' ||
      result.code === 'IDEMPOTENCY_PAYLOAD_MISMATCH'
    ) {
      clearPendingScavengerSubmit()
    }
  } catch {
    // Keep pending; caller must not overwrite until this resolves.
  }
}

function restorePending() {
  const playerId = session.profile?.player_id ?? null
  clearPendingScavengerSubmitIfOtherPlayer(playerId)
  const pending = readPendingScavengerSubmit()
  if (!pending || !playerId || pending.playerId !== playerId) return
  const id = typeof route.params.challengeId === 'string' ? route.params.challengeId : ''
  if (pending.payload.challenge_id !== id) return
  // Pending recovery takes precedence over ordinary already-completed UI.
  alreadyDone.value = false
  error.value = null
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
  if (ref?.framing) photoFraming.value = ref.framing
}

function onLocal(image: { previewUrl: string; width: number; height: number } | null) {
  previewUrl.value = image?.previewUrl ?? null
  previewWidth.value = image?.width ?? null
  previewHeight.value = image?.height ?? null
  if (!image) photoFraming.value = null
}

function onFraming(next: PhotoFraming | null) {
  photoFraming.value = next
}

function goToStep(next: WizardStepId) {
  if (editsLocked.value && submitError.value === 'unknown' && next !== 'review') {
    modal.value = 'unknown'
    return
  }
  if (editsLocked.value && submitError.value === 'unknown') return
  if (next === 'review' && !staged.value?.photoId) return
  step.value = next
}

function goReview() {
  goToStep('review')
}

function goBack() {
  if (step.value === 'review') {
    if (editsLocked.value && submitError.value === 'unknown') {
      modal.value = 'unknown'
      return
    }
    focusCaption.value = false
    step.value = 'photo'
    return
  }
  requestExit()
}

function onProgressSelect(stepId: string) {
  if (stepId === 'photo' || stepId === 'review') goToStep(stepId)
}

function resetWizardScroll() {
  const seen = new Set<HTMLElement>()
  const queue: HTMLElement[] = []
  const push = (node: unknown) => {
    if (node instanceof HTMLElement) queue.push(node)
  }
  push(wizardEl.value)
  push(document.scrollingElement)
  push(document.documentElement)
  push(document.body)

  while (queue.length) {
    const el = queue.pop()
    if (!el || seen.has(el)) continue
    seen.add(el)
    push(el.parentElement)
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }
    el.scrollTop = 0
    el.scrollLeft = 0
  }
}

function scheduleWizardScrollReset() {
  resetWizardScroll()
  if (scrollFrame) window.cancelAnimationFrame(scrollFrame)
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    resetWizardScroll()
  })
}

watch(
  () => step.value,
  async () => {
    await nextTick()
    if (!wizardEl.value?.isConnected) return
    scheduleWizardScrollReset()
  },
)

onBeforeRouteLeave((to) => {
  if (confirmLeave) return true
  if (submitSucceeded.value) return true
  if (to.name === 'shipit-wrapped' || awardsMode.isAwardsMode) {
    clearPendingScavengerSubmit()
    return true
  }
  if (to.name === 'shipit-submit') return true
  if (!hasDraft.value) return true
  if (formLocked.value && submitError.value === 'unknown') {
    modal.value = 'unknown'
    return false
  }
  pendingDestination = to.fullPath
  modal.value = 'exit'
  return false
})

function requestExit() {
  if (exitInFlight) return
  if (formLocked.value && submitError.value === 'unknown') {
    modal.value = 'unknown'
    return
  }
  if (!hasDraft.value) {
    pendingDestination = null
    void confirmExit()
    return
  }
  pendingDestination = null
  modal.value = 'exit'
}

async function confirmExit() {
  if (exitInFlight) return
  if (formLocked.value && submitError.value === 'unknown') {
    pendingDestination = null
    modal.value = 'unknown'
    return
  }
  exitInFlight = true
  const dest = pendingDestination ?? challengesPath()
  pendingDestination = null
  modal.value = null
  confirmLeave = true
  discardOnLeave = true
  try {
    await router.push(dest)
  } catch {
    // Unexpected navigation failure. Leave the draft intact.
  } finally {
    confirmLeave = false
    exitInFlight = false
    if (router.currentRoute.value.name === 'shipit-submit') {
      discardOnLeave = false
    }
  }
}

function cancelModal() {
  modal.value = null
  pendingDestination = null
}

function goToWrapped() {
  modal.value = null
  pendingDestination = null
  clearPendingScavengerSubmit()
  void router.replace({ name: 'shipit-wrapped' })
}

function onNavAction() {
  if (formLocked.value && submitError.value === 'unknown') {
    modal.value = 'unknown'
    return
  }
  if (!hasDraft.value) {
    void router.push({ name: 'shipit-challenges' })
    return
  }
  modal.value = 'startOver'
}

function confirmStartOver() {
  modal.value = null
  clearPendingScavengerSubmit()
  caption.value = ''
  staged.value = null
  previewUrl.value = null
  previewWidth.value = null
  previewHeight.value = null
  photoFraming.value = null
  formLocked.value = false
  submitError.value = null
  idempotencyKey.value = null
  focusCaption.value = false
  step.value = 'photo'
}

function onReviewEditCaption() {
  if (editsLocked.value) {
    modal.value = 'unknown'
    return
  }
  focusCaption.value = true
  step.value = 'photo'
}

function onReviewEditPhoto() {
  if (editsLocked.value) {
    modal.value = 'unknown'
    return
  }
  focusCaption.value = false
  step.value = 'photo'
}

async function onReviewFraming(next: PhotoFraming) {
  if (editsLocked.value) return
  const framing = cloneFraming(next)
  photoFraming.value = framing
  const current = staged.value
  if (!current?.photoId) return
  try {
    const saved = await persistStagedFraming(current.photoId, framing)
    photoFraming.value = saved
    staged.value = { ...current, framing: cloneFraming(saved) }
  } catch {
    // Keep local framing; submit still uses staged photo_id.
  }
}

async function performSubmit() {
  if (!challenge.value || !staged.value?.photoId || !session.profile?.player_id) return
  // In-flight re-entry guard (REL-001) — latch before any await (button :disabled is not enough).
  if (submitting.value) return
  submitting.value = true
  formLocked.value = true
  submitError.value = null
  try {
    await reconcileForeignPending()
    const blocking = readPendingScavengerSubmit()
    if (
      blocking &&
      blocking.playerId === session.profile.player_id &&
      blocking.payload.challenge_id !== challenge.value.id
    ) {
      submitError.value = 'unknown'
      modal.value = 'unknown'
      return
    }
    if (!idempotencyKey.value) {
      const durable = readPendingScavengerSubmit()
      idempotencyKey.value =
        durable?.playerId === session.profile.player_id
          ? durable.clientRequestId
          : crypto.randomUUID()
    }
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
    const result = await submitScavenger(payload)
    if (result.ok && result.submission_id) {
      clearPendingScavengerSubmit()
      formLocked.value = false
      submitSucceeded.value = true
      const { useAchievementCelebrationStore } = await import('@/stores/achievementCelebration')
      useAchievementCelebrationStore().queueFromSubmit({
        game: 'shipit',
        submissionId: result.submission_id,
        awardIds: (result as { new_achievement_ids?: string[] }).new_achievement_ids,
        idempotentReplay: (result as { idempotent_replay?: boolean }).idempotent_replay === true,
      })
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
    modal.value = 'unknown'
  } finally {
    submitting.value = false
  }
}

async function onRetry() {
  modal.value = null
  await performSubmit()
}

function backToList() {
  void router.push(
    awardsMode.isAwardsMode ? { name: 'shipit-wrapped' } : { name: 'shipit-challenges' },
  )
}

onMounted(async () => {
  awardsMode.ensureStarted()
  if (awardsMode.isAwardsMode) {
    showFinaleGate.value = true
    loading.value = false
    return
  }
  await reconcileForeignPending()
  await loadChallenge()
  restorePending()
})

onBeforeUnmount(() => {
  if (discardOnLeave) {
    discardOnLeave = false
    clearPendingScavengerSubmit()
    caption.value = ''
    staged.value = null
    previewUrl.value = null
    previewWidth.value = null
    previewHeight.value = null
    photoFraming.value = null
  }
  if (scrollFrame) window.cancelAnimationFrame(scrollFrame)
})

watch(
  () => awardsMode.isAwardsMode,
  (ended) => {
    if (ended) {
      showFinaleGate.value = true
      modal.value = 'ended'
    }
  },
)
</script>

<template>
  <div
    ref="wizardEl"
    class="theme-ship log-wizard-root min-h-dvh"
    style="background: var(--theme-gradient-warm)"
    data-testid="scavenger-submit-page"
  >
    <header class="wizard-header" style="padding-top: max(0.4rem, env(safe-area-inset-top))">
      <button
        v-if="showBack"
        type="button"
        class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
        :aria-label="copy.wizard.goBack"
        data-testid="wizard-back"
        :disabled="editsLocked && submitError === 'unknown'"
        @click="goBack"
      >
        <AppIcon name="header.back" class="text-lg" />
      </button>
      <span
        v-else
        class="inline-flex h-11 w-11 shrink-0"
        data-testid="wizard-back-spacer"
        aria-hidden="true"
      />
      <h1>
        {{ copy.shipit.submitHeading }}
      </h1>
      <button
        type="button"
        class="shrink-0 rounded-full px-2 py-2 text-sm font-semibold hover:bg-white/10"
        data-testid="wizard-exit"
        @click="requestExit"
      >
        {{ copy.wizard.exit }}
      </button>
    </header>

    <WizardProgress
      v-if="challenge && !alreadyDone && !showFinaleGate && !loading && !error"
      :steps="progressSteps"
      :step="step"
      :completed="completed"
      :locked="editsLocked && submitError === 'unknown'"
      :aria-label="copy.shipit.progressAria"
      @select="onProgressSelect"
    />

    <main class="mx-auto w-full max-w-lg">
      <div
        v-if="showFinaleGate"
        class="px-4 pb-32 pt-6 text-center"
        data-testid="scavenger-finale-gate"
      >
        <p class="font-display text-xl font-bold" style="color: var(--theme-ink)">
          {{ copy.wizard.gameEndedTitle }}
        </p>
        <p class="mt-2 text-sm" style="color: var(--theme-muted)">{{ copy.wizard.gameEndedBody }}</p>
        <button
          type="button"
          class="ui-primary-btn mt-5 w-full"
          data-testid="scavenger-view-wrapped"
          @click="goToWrapped"
        >
          {{ copy.wrapped.viewWrapped }}
        </button>
      </div>

      <template v-else>
        <p
          v-if="loading"
          class="px-4 pt-6 text-sm"
          style="color: var(--theme-muted)"
        >
          {{ copy.shipit.loading }}
        </p>
        <p
          v-else-if="error"
          class="px-4 pt-6 text-sm"
          style="color: var(--theme-ink)"
          data-testid="scavenger-error"
        >
          {{ error }}
        </p>

        <div
          v-else-if="alreadyDone"
          class="space-y-4 px-4 pb-32 pt-6"
          data-testid="scavenger-already-done"
        >
          <h2 class="font-display text-xl font-bold" style="color: var(--theme-ink)">
            {{ copy.shipit.alreadyCompletedTitle }}
          </h2>
          <p class="text-sm" style="color: var(--theme-muted)">{{ copy.shipit.alreadyCompletedBody }}</p>
          <button
            type="button"
            class="ui-primary-btn w-full"
            data-testid="scavenger-back-list"
            @click="backToList"
          >
            {{ copy.shipit.backToChallenges }}
          </button>
        </div>

        <template v-else-if="challenge">
          <ScavengerPhotoStep
            v-if="step === 'photo'"
            :caption="caption"
            :locked="editsLocked"
            :focus-caption="focusCaption"
            :has-photo="!!staged?.photoId"
            :restore-photo="photoRestoreSnapshot"
            @update:caption="caption = $event"
            @continue="goReview"
            @staged="onStaged"
            @local-ready="onLocal"
            @framing="onFraming"
            @caption-focused="focusCaption = false"
          />
          <ScavengerReviewStep
            v-else
            :challenge="challenge"
            :player-name="session.displayName"
            :team-name="teamName"
            :caption="caption"
            :photo-preview-url="previewUrl"
            :photo-preview-width="previewWidth"
            :photo-preview-height="previewHeight"
            :photo-framing="photoFraming"
            :photo-staged="!!staged"
            :submitting="submitting"
            :locked="editsLocked"
            :submit-error="submitError"
            :can-submit="canSubmit"
            @submit="performSubmit"
            @retry="onRetry"
            @update-framing="onReviewFraming"
            @edit-caption="onReviewEditCaption"
            @edit-photo="onReviewEditPhoto"
          />
        </template>
      </template>
    </main>

    <FloatingBottomNav game="shipit" @action="onNavAction" />

    <WizardModal
      v-if="modal === 'exit'"
      class="theme-ship"
      :title="copy.shipit.leaveTitle"
      :body="copy.shipit.leaveBody"
      :primary-label="copy.shipit.exitDiscard"
      :secondary-label="copy.shipit.keepEditing"
      test-id="modal-exit"
      @primary="confirmExit"
      @secondary="cancelModal"
    />
    <WizardModal
      v-else-if="modal === 'startOver'"
      class="theme-ship"
      :title="copy.shipit.startOverTitle"
      :body="copy.shipit.startOverBody"
      :primary-label="copy.shipit.startOverConfirm"
      :secondary-label="copy.shipit.keepEditing"
      test-id="modal-start-over"
      @primary="confirmStartOver"
      @secondary="cancelModal"
    />
    <WizardModal
      v-else-if="modal === 'unknown'"
      class="theme-ship"
      :title="copy.wizard.unknownTitle"
      :body="copy.wizard.unknownBody"
      :primary-label="copy.wizard.retry"
      test-id="modal-unknown"
      @primary="onRetry"
    />
    <WizardModal
      v-else-if="modal === 'ended'"
      class="theme-ship"
      :title="copy.wizard.gameEndedTitle"
      :body="copy.wizard.gameEndedBody"
      :primary-label="copy.wrapped.viewWrapped"
      test-id="modal-ended"
      @primary="goToWrapped"
    />
  </div>
</template>

<style>
/* Keep a step change from re-anchoring the window to the previous list offset. */
.log-wizard-root,
.log-wizard-root * {
  overflow-anchor: none;
}
</style>
