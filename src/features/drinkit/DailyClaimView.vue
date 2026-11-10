<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import FramedPhoto from '@/components/shared/FramedPhoto.vue'
import PhotoCapture from '@/components/shared/PhotoCapture.vue'
import GameShell from '@/components/shared/GameShell.vue'
import type { PhotoFraming } from '@/lib/media/framing'
import { fetchHomeBountySnapshot } from '@/lib/bounty/fetchHomeBounties'
import { submitDaily } from '@/lib/drinkit/submitDaily'
import {
  clearPendingDailySubmit,
  clearPendingDailySubmitIfOtherPlayer,
  readPendingDailySubmit,
  writePendingDailySubmit,
  type PendingDailySubmit,
} from '@/lib/pendingDailySubmit'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { useSessionStore } from '@/stores/session'
import type { ActiveDailyChallenge } from '@/types/bountyHome'
import type { StagedPhotoRef } from '@/types/media'
import { copy } from '@/ui/copy'

const router = useRouter()
const session = useSessionStore()
const awardsMode = useAwardsModeStore()
const showFinaleGate = ref(false)

const step = ref<'confirm' | 'capture' | 'review'>('confirm')
const loading = ref(true)
const error = ref<string | null>(null)
const challenge = ref<ActiveDailyChallenge | null>(null)
const alreadyClaimed = ref(false)
const confirmed = ref(false)
const caption = ref('')
const staged = ref<StagedPhotoRef | null>(null)
const previewUrl = ref<string | null>(null)
const previewWidth = ref<number | null>(null)
const previewHeight = ref<number | null>(null)
const photoFraming = ref<PhotoFraming | null>(null)
const photoBusy = ref(false)
const submitting = ref(false)
const formLocked = ref(false)
const submitError = ref<string | null>(null)
const idempotencyKey = ref<string | null>(null)
/** True when showing recovery for a prior payload that may not match today's assignment. */
const recoveringPending = ref(false)

const canSubmit = computed(
  () =>
    !!staged.value?.photoId &&
    !photoBusy.value &&
    !submitting.value &&
    (!formLocked.value || submitError.value === 'unknown') &&
    // Recovery may run when today's assignment is closed/paused.
    (recoveringPending.value || !!challenge.value),
)

const PENDING_DAILY_INSTRUCTIONS =
  'Detailed challenge instructions pending organizer supply.'

function displayableInstructions(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim()
  if (!text || text === PENDING_DAILY_INSTRUCTIONS) return null
  return text
}

function participationModeOf(
  offer: Pick<ActiveDailyChallenge, 'participation_mode' | 'is_all_hands'>,
): 'all_hands' | 'bring_a_friend' {
  if (offer.participation_mode === 'all_hands' || offer.participation_mode === 'bring_a_friend') {
    return offer.participation_mode
  }
  return offer.is_all_hands ? 'all_hands' : 'bring_a_friend'
}

const modeLabel = computed(() => {
  if (!challenge.value) return ''
  return participationModeOf(challenge.value) === 'all_hands'
    ? copy.daily.allHandsLabel
    : copy.daily.bringFriendLabel
})

const modeHint = computed(() => {
  if (!challenge.value) return ''
  return participationModeOf(challenge.value) === 'all_hands'
    ? copy.daily.allHandsHint
    : copy.daily.bringFriendHint
})

const shownInstructions = computed(() => displayableInstructions(challenge.value?.instructions))

const shownAnnouncement = computed(() => challenge.value?.admin_announcement?.trim() || null)

function challengeFromPending(pending: PendingDailySubmit): ActiveDailyChallenge {
  return {
    status: 'active',
    challenge_id: pending.payload.challenge_id,
    cruise_day: 1,
    title: pending.summary.title,
    instructions: '',
    location_name: null,
    meeting_time_ship_local: null,
    is_all_hands: false,
    participation_mode: 'bring_a_friend',
    admin_announcement: null,
    photo_required: true,
    points: pending.summary.points || 50,
    public_end_utc: '',
  }
}

async function loadDaily() {
  loading.value = true
  error.value = null
  try {
    const snap = await fetchHomeBountySnapshot()
    const daily = snap.daily
    if (!daily) {
      error.value = copy.daily.closed
      return
    }
    if (daily.status === 'already_claimed') {
      alreadyClaimed.value = true
      if (daily.title) {
        challenge.value = {
          status: 'active',
          challenge_id: daily.challenge_id ?? '',
          cruise_day: daily.cruise_day ?? 1,
          title: daily.title,
          instructions: daily.instructions ?? '',
          location_name: daily.location_name ?? null,
          bar_canonical_key: daily.bar_canonical_key ?? null,
          meeting_time_ship_local: null,
          is_all_hands: daily.is_all_hands ?? false,
          participation_mode: daily.participation_mode,
          admin_announcement: daily.admin_announcement ?? null,
          photo_required: daily.photo_required ?? true,
          points: daily.points ?? 50,
          public_end_utc: daily.public_end_utc ?? '',
        }
      }
      return
    }
    if (daily.status === 'paused') {
      error.value = copy.bounty.pausedTitle
      return
    }
    if (daily.status === 'finale') {
      error.value = copy.bounty.finaleTitle
      return
    }
    if (daily.status !== 'active') {
      if (daily.reason === 'pre_open') error.value = copy.daily.notAvailableYet
      else error.value = copy.daily.closed
      return
    }
    challenge.value = daily
  } catch (err) {
    error.value = err instanceof Error ? err.message : copy.bounty.unavailableDetail
  } finally {
    loading.value = false
  }
}

/**
 * Restore unresolved pending independently of today's Daily assignment.
 * Returns true when recovery UI should take precedence over loadDaily errors.
 */
function restorePending(): boolean {
  const playerId = session.profile?.player_id ?? null
  clearPendingDailySubmitIfOtherPlayer(playerId)
  const pending = readPendingDailySubmit()
  if (!pending || !playerId || pending.playerId !== playerId) return false

  recoveringPending.value = true
  alreadyClaimed.value = false
  error.value = null
  challenge.value = challengeFromPending(pending)
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
  confirmed.value = true
  formLocked.value = true
  submitError.value = 'unknown'
  step.value = 'review'
  loading.value = false
  return true
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

function goCapture() {
  confirmed.value = true
  step.value = 'capture'
}

function goReview() {
  if (!staged.value?.photoId || photoBusy.value) return
  step.value = 'review'
}

async function performSubmit() {
  if (!session.profile?.player_id) return
  const existingPending = readPendingDailySubmit()

  // Locked unknown recovery: always retry the exact stored payload/UUID.
  if (submitError.value === 'unknown' && existingPending) {
    formLocked.value = true
    submitting.value = true
    try {
      const result = await submitDaily(existingPending.payload)
      await handleSubmitResult(result)
    } catch {
      submitError.value = 'unknown'
    } finally {
      submitting.value = false
    }
    return
  }

  // Never silently replace a pending request for a different challenge.
  if (
    existingPending &&
    challenge.value &&
    existingPending.payload.challenge_id !== challenge.value.challenge_id
  ) {
    restorePending()
    return
  }

  if (!challenge.value || !staged.value?.photoId) return
  if (!idempotencyKey.value) idempotencyKey.value = crypto.randomUUID()
  const payload = {
    idempotency_key: idempotencyKey.value,
    challenge_id: challenge.value.challenge_id,
    photo_id: staged.value.photoId,
    caption: caption.value.trim() || null,
  }
  writePendingDailySubmit({
    clientRequestId: idempotencyKey.value,
    playerId: session.profile.player_id,
    cruiseConfigId: null,
    payload,
    summary: { title: challenge.value.title, points: challenge.value.points || 50 },
  })
  formLocked.value = true
  submitting.value = true
  submitError.value = null
  try {
    const result = await submitDaily(payload)
    await handleSubmitResult(result)
  } catch {
    submitError.value = 'unknown'
  } finally {
    submitting.value = false
  }
}

async function handleSubmitResult(result: Awaited<ReturnType<typeof submitDaily>>) {
  if (result.ok && result.submission_id) {
    clearPendingDailySubmit()
    formLocked.value = false
    recoveringPending.value = false
    const { useAchievementCelebrationStore } = await import('@/stores/achievementCelebration')
    useAchievementCelebrationStore().queueFromSubmit({
      game: 'drinkit',
      submissionId: result.submission_id,
      awardIds: (result as { new_achievement_ids?: string[] }).new_achievement_ids,
      idempotentReplay: (result as { idempotent_replay?: boolean }).idempotent_replay === true,
    })
    await router.replace({
      name: 'drinkit-gallery',
      query: { submission: result.submission_id },
    })
    return
  }
  if (result.code === 'ALREADY_CLAIMED') {
    // Definitive for a *new* claim; for UUID replay of a prior success we never reach here.
    clearPendingDailySubmit()
    formLocked.value = false
    recoveringPending.value = false
    alreadyClaimed.value = true
    return
  }
  if (result.code === 'IDEMPOTENCY_PAYLOAD_MISMATCH') {
    clearPendingDailySubmit()
    formLocked.value = false
    recoveringPending.value = false
    idempotencyKey.value = null
    submitError.value = result.message ?? copy.daily.submitFailed
    return
  }
  // Definitive rejection (closed window, wrong day, pause for NEW submits, etc.)
  clearPendingDailySubmit()
  formLocked.value = false
  recoveringPending.value = false
  idempotencyKey.value = null
  submitError.value = result.message ?? result.code ?? copy.daily.submitFailed
}

function unlockAfterReject() {
  if (submitError.value === 'unknown') return
  formLocked.value = false
  submitError.value = null
  recoveringPending.value = false
  step.value = 'capture'
}

function backHome() {
  void router.push(awardsMode.homePathForGame('drinkit'))
}

function goToWrapped() {
  clearPendingDailySubmit()
  void router.replace({ name: 'drinkit-wrapped' })
}

onMounted(async () => {
  awardsMode.ensureStarted()
  if (awardsMode.isAwardsMode) {
    showFinaleGate.value = true
    loading.value = false
    return
  }
  // Pending recovery must not depend on today's active assignment.
  if (restorePending()) return
  await loadDaily()
})

watch(
  () => awardsMode.isAwardsMode,
  (ended) => {
    if (ended) showFinaleGate.value = true
  },
)
</script>

<template>
  <GameShell game="drinkit" :title="copy.daily.heading" :show-switch="false">
    <div class="px-4 pb-28 pt-4" data-testid="daily-claim-page">
      <div
        v-if="showFinaleGate"
        class="rounded-2xl px-4 py-6 text-center"
        style="background: var(--theme-gradient-warm); color: var(--theme-ink)"
        data-testid="daily-finale-gate"
      >
        <p class="font-semibold">{{ copy.wizard.gameEndedTitle }}</p>
        <p class="mt-2 text-sm" style="color: var(--theme-muted)">{{ copy.wizard.gameEndedBody }}</p>
        <button
          type="button"
          class="mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white"
          style="background: var(--theme-primary)"
          data-testid="daily-view-wrapped"
          @click="goToWrapped"
        >
          {{ copy.wrapped.viewWrapped }}
        </button>
      </div>

      <template v-if="!showFinaleGate">
      <p v-if="loading" class="text-sm" style="color: var(--theme-muted)">{{ copy.bounty.loadingTitle }}</p>

      <!-- Recovery takes precedence over closed/paused/already-claimed banners. -->
      <template v-if="!loading && recoveringPending && step === 'review'">
        <p
          class="mb-4 rounded-2xl px-4 py-3 text-sm"
          style="background: var(--theme-gradient-warm); color: var(--theme-muted)"
          data-testid="daily-recovery-banner"
        >
          {{ copy.daily.recoveryBanner }}
        </p>
        <h2 class="font-display text-xl font-bold" style="color: var(--theme-ink)" data-testid="daily-title">
          {{ challenge?.title }}
        </h2>
        <p class="mt-2 text-sm font-semibold" style="color: var(--theme-primary)">
          {{ copy.daily.pointsLine }}
        </p>
        <section class="mt-6 space-y-4" data-testid="daily-review-step">
          <div
            class="rounded-2xl px-4 py-3 text-sm"
            style="background: var(--theme-gradient-warm)"
            data-testid="daily-unknown"
          >
            <p class="font-semibold">{{ copy.wizard.unknownTitle }}</p>
            <p class="mt-1" style="color: var(--theme-muted)">{{ copy.wizard.unknownBody }}</p>
            <p class="mt-2 text-xs" style="color: var(--theme-muted)">{{ copy.wizard.resolveBeforeEdit }}</p>
          </div>
          <button
            type="button"
            class="w-full rounded-full py-3 text-sm font-semibold text-white disabled:opacity-60"
            style="background: var(--theme-primary)"
            data-testid="daily-submit"
            :disabled="!canSubmit"
            @click="performSubmit"
          >
            {{ submitting ? copy.daily.submitting : copy.wizard.retry }}
          </button>
        </section>
      </template>

      <p
        v-else-if="!loading && error && !recoveringPending"
        class="text-sm"
        style="color: var(--theme-ink)"
        data-testid="daily-error"
      >
        {{ error }}
      </p>

      <div
        v-else-if="!loading && alreadyClaimed && !recoveringPending"
        class="space-y-4"
        data-testid="daily-already-claimed"
      >
        <h2 class="font-display text-xl font-bold" style="color: var(--theme-ink)">
          {{ copy.daily.alreadyCompleted }}
        </h2>
        <button
          type="button"
          class="w-full rounded-full py-3 text-sm font-semibold text-white"
          style="background: var(--theme-primary)"
          data-testid="daily-back-home"
          @click="backHome"
        >
          {{ copy.daily.backHome }}
        </button>
      </div>

      <template v-else-if="!loading && challenge && !recoveringPending">
        <p
          class="text-xs font-semibold uppercase tracking-wide"
          style="color: var(--theme-muted)"
          data-testid="daily-mode"
        >
          {{ modeLabel }}
        </p>
        <h2 class="mt-1 font-display text-xl font-bold" style="color: var(--theme-ink)" data-testid="daily-title">
          {{ challenge.title }}
        </h2>
        <p
          v-if="challenge.location_name"
          class="mt-2 text-sm"
          style="color: var(--theme-ink)"
          data-testid="daily-location"
        >
          {{ copy.daily.locationLabel }}: {{ challenge.location_name }}
        </p>
        <p class="mt-2 text-sm" style="color: var(--theme-muted)" data-testid="daily-mode-hint">
          {{ modeHint }}
        </p>
        <p
          v-if="shownAnnouncement"
          class="mt-3 rounded-2xl px-4 py-3 text-sm font-semibold"
          style="background: var(--theme-gradient-warm); color: var(--theme-ink)"
          data-testid="daily-announcement"
        >
          {{ copy.daily.announcementLabel }}: {{ shownAnnouncement }}
        </p>
        <p
          v-if="shownInstructions"
          class="mt-2 text-sm"
          style="color: var(--theme-ink)"
          data-testid="daily-instructions"
        >
          {{ shownInstructions }}
        </p>
        <p class="mt-2 text-sm font-semibold" style="color: var(--theme-primary)" data-testid="daily-points">
          {{ copy.daily.pointsLine }}
        </p>

        <section v-if="step === 'confirm'" class="mt-8 space-y-4" data-testid="daily-confirm-step">
          <p class="font-display text-lg font-bold" style="color: var(--theme-ink)">
            {{ copy.daily.confirmQuestion }}
          </p>
          <button
            type="button"
            class="w-full rounded-full py-3 text-sm font-semibold text-white"
            style="background: var(--theme-primary)"
            data-testid="daily-confirm-yes"
            @click="goCapture"
          >
            {{ copy.wizard.continue }}
          </button>
        </section>

        <section v-else-if="step === 'capture'" class="mt-6" data-testid="daily-capture-step">
          <h3 class="font-display text-lg font-bold" style="color: var(--theme-ink)">
            {{ copy.daily.photoTitle }}
          </h3>
          <p class="mt-1 text-sm" style="color: var(--theme-muted)">{{ copy.daily.photoHelper }}</p>
          <div class="mt-4">
            <PhotoCapture
              game="drinkit"
              purpose="daily"
              :required="true"
              :auto-stage="true"
              :disabled="formLocked && submitError !== 'unknown'"
              @staged="onStaged"
              @local-ready="onLocal"
              @framing="onFraming"
              @busy="photoBusy = $event"
            />
          </div>
          <label class="mt-7 block" style="color: var(--theme-ink)" data-testid="caption-field">
            <span class="font-display text-lg font-bold tracking-tight">
              {{ copy.daily.captionLabel }}
            </span>
            <span class="text-sm font-medium" style="color: var(--theme-muted)">
              — {{ copy.daily.captionOptional }}
            </span>
            <textarea
              v-model="caption"
              rows="3"
              class="mt-2 w-full resize-none rounded-2xl px-4 py-3 text-sm font-normal outline-none"
              style="background: var(--theme-gradient-warm)"
              :placeholder="copy.wizard.captionPlaceholder"
              data-testid="daily-caption"
              :disabled="formLocked && submitError !== 'unknown'"
            />
          </label>
          <button
            type="button"
            class="mt-6 w-full rounded-full py-3 text-sm font-semibold text-white disabled:opacity-60"
            style="background: var(--theme-primary)"
            data-testid="daily-continue-review"
            :disabled="!staged?.photoId || photoBusy || (formLocked && submitError !== 'unknown')"
            @click="goReview"
          >
            {{ copy.daily.continueReview }}
          </button>
        </section>

        <section v-else class="mt-6 space-y-4" data-testid="daily-review-step">
          <h3 class="font-display text-lg font-bold" data-testid="daily-review-title">
            {{ copy.daily.reviewTitle }}
          </h3>
          <div class="rounded-2xl px-4 py-3" style="background: var(--theme-gradient-warm)">
            <p class="text-xs uppercase tracking-wide" style="color: var(--theme-muted)">
              {{ copy.bounty.daily }}
            </p>
            <p class="mt-1 font-semibold" style="color: var(--theme-ink)">{{ challenge.title }}</p>
          </div>
          <div class="rounded-2xl px-4 py-3" style="background: var(--theme-gradient-warm)">
            <p class="text-xs uppercase tracking-wide" style="color: var(--theme-muted)">
              {{ copy.wizard.labelPhoto }}
            </p>
            <div v-if="previewUrl" class="mt-2 w-full max-w-[200px]" data-testid="daily-review-photo">
              <FramedPhoto
                v-if="previewWidth && previewHeight"
                :src="previewUrl"
                :width="previewWidth"
                :height="previewHeight"
                :framing="photoFraming"
              />
              <img
                v-else
                :src="previewUrl"
                alt=""
                class="aspect-square w-full rounded-xl object-cover"
              />
            </div>
            <p v-else class="mt-2 text-sm">{{ copy.photo.stagedReady }}</p>
          </div>
          <div class="rounded-2xl px-4 py-3" style="background: var(--theme-gradient-warm)">
            <p class="text-xs uppercase tracking-wide" style="color: var(--theme-muted)">Points</p>
            <p class="mt-1 font-semibold" data-testid="daily-review-points">{{ copy.daily.pointsLine }}</p>
          </div>

          <div
            v-if="submitError === 'unknown'"
            class="rounded-2xl px-4 py-3 text-sm"
            style="background: var(--theme-gradient-warm)"
            data-testid="daily-unknown"
          >
            <p class="font-semibold">{{ copy.wizard.unknownTitle }}</p>
            <p class="mt-1" style="color: var(--theme-muted)">{{ copy.wizard.unknownBody }}</p>
            <p class="mt-2 text-xs" style="color: var(--theme-muted)">{{ copy.wizard.resolveBeforeEdit }}</p>
          </div>
          <p
            v-else-if="submitError"
            class="text-sm"
            style="color: var(--theme-ink)"
            data-testid="daily-submit-error"
          >
            {{ submitError }}
          </p>

          <button
            type="button"
            class="w-full rounded-full py-3 text-sm font-semibold text-white disabled:opacity-60"
            style="background: var(--theme-primary)"
            data-testid="daily-submit"
            :disabled="!canSubmit"
            @click="performSubmit"
          >
            {{ submitting ? copy.daily.submitting : copy.daily.submit }}
          </button>
          <button
            v-if="!formLocked || submitError !== 'unknown'"
            type="button"
            class="w-full text-sm font-semibold underline"
            style="color: var(--theme-primary)"
            data-testid="daily-edit"
            @click="unlockAfterReject"
          >
            {{ copy.daily.editPhoto }}
          </button>
        </section>
      </template>
      </template>
    </div>
  </GameShell>
</template>
