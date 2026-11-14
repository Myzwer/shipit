<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '@/components/shared/AppIcon.vue'
import PhotoCapture from '@/components/shared/PhotoCapture.vue'
import GameShell from '@/components/shared/GameShell.vue'
import DailyReviewStep from '@/features/drinkit/DailyReviewStep.vue'
import {
  cloneFraming,
  type PhotoFraming,
} from '@/lib/media/framing'
import { setPhotoFraming as persistStagedFraming } from '@/lib/media/stagePhoto'
import { formatMeetingTime } from '@/lib/bounty/mapHomeCards'
import { fetchHomeBountySnapshot } from '@/lib/bounty/fetchHomeBounties'
import { pointsLabel } from '@/lib/bounty/tierLabels'
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
const focusCaption = ref(false)
const captionInput = ref<HTMLTextAreaElement | null>(null)
const dailyEl = ref<HTMLElement | null>(null)
let scrollFrame = 0

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

const reviewLocked = computed(
  () => formLocked.value && submitError.value === 'unknown',
)

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

const isAllHands = computed(
  () => !!challenge.value && participationModeOf(challenge.value) === 'all_hands',
)

const modeLabel = computed(() => {
  if (!challenge.value) return ''
  return isAllHands.value ? copy.daily.allHandsLabel : copy.daily.bringFriendLabel
})

/** Authorized mode for review acknowledgment + submit contract. */
const authorizedParticipationMode = computed<'all_hands' | 'bring_a_friend' | null>(() => {
  if (!challenge.value) return null
  return participationModeOf(challenge.value)
})

const shownInstructions = computed(() => displayableInstructions(challenge.value?.instructions))

const shownAnnouncement = computed(() => challenge.value?.admin_announcement?.trim() || null)

const shownMeetingTime = computed(() => {
  const raw = challenge.value?.meeting_time_ship_local
  if (!raw) return null
  return `${copy.bounty.dailyMeetAt} ${formatMeetingTime(raw)}`
})

const meetupVenue = computed(() => challenge.value?.location_name?.trim() || null)

/** Structured time and/or organizer meetup note — never invent times from prose. */
const hasMeetupInfo = computed(() => Boolean(shownMeetingTime.value || shownAnnouncement.value))

const challengePointsLabel = computed(() =>
  pointsLabel(challenge.value?.points && challenge.value.points > 0 ? challenge.value.points : 50),
)

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
  focusCaption.value = false
  step.value = 'capture'
}

function goReview() {
  if (!staged.value?.photoId || photoBusy.value) return
  focusCaption.value = false
  step.value = 'review'
}

function focusCaptionField() {
  const el = captionInput.value
  if (!el) return
  el.focus()
  const len = el.value.length
  el.setSelectionRange(len, len)
  focusCaption.value = false
}

function onEditCaption() {
  if (reviewLocked.value) return
  formLocked.value = false
  submitError.value = null
  recoveringPending.value = false
  focusCaption.value = true
  step.value = 'capture'
}

async function onReviewFraming(next: PhotoFraming) {
  if (reviewLocked.value) return
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

/** Same ancestor-walking reset as ordinary Drink It! LogWizardView. */
function resetWizardScroll() {
  const seen = new Set<HTMLElement>()
  const queue: HTMLElement[] = []
  const push = (node: unknown) => {
    if (node instanceof HTMLElement) queue.push(node)
  }
  push(dailyEl.value)
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

function scheduleWizardScrollReset(after?: () => void) {
  resetWizardScroll()
  if (scrollFrame) window.cancelAnimationFrame(scrollFrame)
  scrollFrame = requestAnimationFrame(() => {
    scrollFrame = 0
    resetWizardScroll()
    after?.()
  })
}

watch(
  () => step.value,
  async () => {
    await nextTick()
    if (!dailyEl.value?.isConnected) return
    const shouldFocusCaption = step.value === 'capture' && focusCaption.value
    scheduleWizardScrollReset(() => {
      if (shouldFocusCaption) focusCaptionField()
    })
  },
)

async function performSubmit() {
  if (!session.profile?.player_id) return
  // In-flight re-entry guard (REL-002) — latch before any await (button :disabled is not enough).
  if (submitting.value) return
  submitting.value = true
  const existingPending = readPendingDailySubmit()

  try {
    // Locked unknown recovery: retry same UUID; ensure attest is present on this Submit action.
    if (submitError.value === 'unknown' && existingPending) {
      const payload = {
        ...existingPending.payload,
        attest_participation: true as const,
      }
      writePendingDailySubmit({
        clientRequestId: existingPending.clientRequestId,
        playerId: existingPending.playerId,
        cruiseConfigId: existingPending.cruiseConfigId,
        payload,
        summary: existingPending.summary,
        createdAt: existingPending.createdAt,
      })
      formLocked.value = true
      const result = await submitDaily(payload)
      await handleSubmitResult(result)
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
    if (!idempotencyKey.value) {
      idempotencyKey.value =
        existingPending?.playerId === session.profile.player_id
          ? existingPending.clientRequestId
          : crypto.randomUUID()
    }
    // Attestation is set only on this final Submit action (not earlier wizard steps).
    const payload = {
      idempotency_key: idempotencyKey.value,
      challenge_id: challenge.value.challenge_id,
      photo_id: staged.value.photoId,
      caption: caption.value.trim() || null,
      attest_participation: true as const,
    }
    writePendingDailySubmit({
      clientRequestId: idempotencyKey.value,
      playerId: session.profile.player_id,
      cruiseConfigId: null,
      payload,
      summary: { title: challenge.value.title, points: challenge.value.points || 50 },
    })
    formLocked.value = true
    submitError.value = null
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
  if (result.code === 'ATTEST_PARTICIPATION_REQUIRED') {
    clearPendingDailySubmit()
    formLocked.value = false
    recoveringPending.value = false
    idempotencyKey.value = null
    submitError.value =
      result.message ??
      (authorizedParticipationMode.value === 'all_hands'
        ? copy.daily.attestAllHands
        : copy.daily.attestBringFriend)
    return
  }
  // Definitive rejection (closed window, wrong day, pause for NEW submits, etc.)
  clearPendingDailySubmit()
  formLocked.value = false
  recoveringPending.value = false
  idempotencyKey.value = null
  submitError.value = result.message ?? result.code ?? copy.daily.submitFailed
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

onBeforeUnmount(() => {
  if (scrollFrame) window.cancelAnimationFrame(scrollFrame)
})

watch(
  () => awardsMode.isAwardsMode,
  (ended) => {
    if (ended) showFinaleGate.value = true
  },
)
</script>

<template>
  <GameShell
    game="drinkit"
    :title="copy.daily.heading"
    :show-switch="false"
    :show-ship-time="false"
    :header-pinned="false"
  >
    <template #header-actions>
      <button
        type="button"
        class="shrink-0 rounded-full px-2.5 py-2 text-sm font-semibold text-white hover:bg-white/10"
        data-testid="daily-exit"
        @click="backHome"
      >
        {{ copy.wizard.exit }}
      </button>
    </template>

    <div ref="dailyEl" class="px-4 pb-28 pt-4" data-testid="daily-claim-page">
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
          class="ui-primary-btn mt-4"
          data-testid="daily-view-wrapped"
          @click="goToWrapped"
        >
          {{ copy.wrapped.viewWrapped }}
        </button>
      </div>

      <template v-if="!showFinaleGate">
      <p v-if="loading" class="text-sm" style="color: var(--theme-muted)">{{ copy.bounty.loadingTitle }}</p>

      <!-- Recovery takes precedence over closed/paused/already-claimed banners. -->
      <template v-if="!loading && recoveringPending && step === 'review' && challenge">
        <p
          class="mb-4 rounded-2xl px-4 py-3 text-sm"
          style="background: var(--theme-gradient-warm); color: var(--theme-muted)"
          data-testid="daily-recovery-banner"
        >
          {{ copy.daily.recoveryBanner }}
        </p>
        <DailyReviewStep
          :challenge-title="challenge.title"
          :location-name="challenge.location_name"
          :points="challenge.points || 50"
          :player-name="session.displayName"
          :caption="caption"
          :photo-preview-url="previewUrl"
          :photo-preview-width="previewWidth"
          :photo-preview-height="previewHeight"
          :photo-framing="photoFraming"
          :photo-staged="!!staged"
          :submitting="submitting"
          :can-submit="canSubmit"
          :locked="true"
          :submit-error="submitError"
          :participation-mode="authorizedParticipationMode"
          @submit="performSubmit"
          @update-framing="onReviewFraming"
          @edit-caption="onEditCaption"
        />
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
          class="ui-primary-btn w-full"
          data-testid="daily-back-home"
          @click="backHome"
        >
          {{ copy.daily.backHome }}
        </button>
      </div>

      <template v-else-if="!loading && challenge && !recoveringPending">
        <!-- Details: identity → what to do → meetup → completion CTA -->
        <section v-if="step === 'confirm'" class="daily-details" data-testid="daily-confirm-step">
          <article class="daily-identity ui-mint-panel" data-testid="daily-identity">
            <p
              class="daily-mode"
              data-testid="daily-mode"
            >
              {{ modeLabel }}
            </p>
            <h2 class="daily-title ui-display-name" data-testid="daily-title">
              {{ challenge.title }}
            </h2>
            <p
              v-if="challenge.location_name"
              class="daily-venue"
              data-testid="daily-location"
            >
              {{ challenge.location_name }}
            </p>
            <p class="daily-points" data-testid="daily-points">
              {{ challengePointsLabel }}
            </p>
          </article>

          <div class="daily-what" data-testid="daily-what-to-do">
            <h3 class="daily-what-heading">{{ copy.daily.whatToDo }}</h3>
            <p
              v-if="shownInstructions"
              class="daily-instructions"
              data-testid="daily-instructions"
            >
              {{ shownInstructions }}
            </p>

            <p
              v-if="isAllHands"
              class="daily-all-hands-rule"
              data-testid="daily-all-hands-rule"
            >
              {{ copy.daily.allHandsAttendanceRule }}
            </p>

            <aside
              v-if="hasMeetupInfo"
              class="daily-meetup"
              data-testid="daily-meetup"
            >
              <AppIcon name="status.time" class="daily-meetup-icon" aria-hidden="true" />
              <div class="daily-meetup-copy">
                <p
                  v-if="shownMeetingTime"
                  class="daily-meetup-time"
                  data-testid="daily-meeting-time"
                >
                  <template v-if="meetupVenue">
                    {{ shownMeetingTime }} · {{ meetupVenue }}
                  </template>
                  <template v-else>
                    {{ shownMeetingTime }}
                  </template>
                </p>
                <p
                  v-if="shownAnnouncement"
                  class="daily-meetup-body"
                  data-testid="daily-announcement"
                >
                  {{ shownAnnouncement }}
                </p>
              </div>
            </aside>
          </div>

          <div class="daily-complete" data-testid="daily-complete">
            <p class="daily-complete-question">{{ copy.daily.confirmQuestion }}</p>
            <button
              type="button"
              class="daily-continue ui-primary-btn"
              data-testid="daily-confirm-yes"
              @click="goCapture"
            >
              <span class="daily-continue-label">{{ copy.daily.yesAddPhoto }}</span>
              <AppIcon name="action.next" class="daily-continue-icon" />
            </button>
          </div>
        </section>

        <section v-if="step === 'capture'" class="mt-2" data-testid="daily-capture-step">
          <h2 class="wizard-prompt" data-testid="daily-photo-title">
            {{ copy.daily.photoTitle }}
          </h2>
          <p class="mt-1.5 text-sm" style="color: var(--theme-muted)">{{ copy.daily.photoHelper }}</p>
          <div class="mt-4">
            <PhotoCapture
              game="drinkit"
              purpose="daily"
              :required="true"
              :auto-stage="true"
              :disabled="reviewLocked"
              :restore="photoRestoreSnapshot"
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
              ref="captionInput"
              v-model="caption"
              rows="3"
              class="mt-2 w-full resize-none rounded-2xl bg-white px-4 py-3 text-sm font-normal shadow-sm outline-none"
              :placeholder="copy.wizard.captionPlaceholder"
              data-testid="daily-caption"
              :disabled="reviewLocked"
            />
          </label>
          <button
            type="button"
            class="ui-primary-btn mt-6 w-full"
            data-testid="daily-continue-review"
            :disabled="!staged?.photoId || photoBusy || reviewLocked"
            @click="goReview"
          >
            {{ copy.daily.continueReview }}
            <AppIcon name="action.next" />
          </button>
        </section>

        <DailyReviewStep
          v-else-if="step === 'review'"
          :challenge-title="challenge.title"
          :location-name="challenge.location_name"
          :points="challenge.points || 50"
          :player-name="session.displayName"
          :caption="caption"
          :photo-preview-url="previewUrl"
          :photo-preview-width="previewWidth"
          :photo-preview-height="previewHeight"
          :photo-framing="photoFraming"
          :photo-staged="!!staged"
          :submitting="submitting"
          :can-submit="canSubmit"
          :locked="reviewLocked"
          :submit-error="submitError"
          :participation-mode="authorizedParticipationMode"
          @submit="performSubmit"
          @update-framing="onReviewFraming"
          @edit-caption="onEditCaption"
        />
      </template>
      </template>
    </div>
  </GameShell>
</template>

<style scoped>
.daily-details {
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
  padding-bottom: 0.5rem;
}

.daily-identity {
  border-radius: 1.35rem;
  padding: 1.2rem 1.15rem 1.25rem;
  text-align: center;
  color: var(--theme-ink);
  box-shadow: var(--theme-card-shadow, 0 5px 12px rgba(36, 72, 78, 0.12));
}

.daily-mode {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--theme-muted);
}

.daily-title {
  margin: 0.55rem 0 0;
  font-family: var(--font-display);
  font-size: 1.45rem;
  font-weight: 800;
  line-height: 1.15;
}

.daily-venue {
  margin: 0.45rem 0 0;
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.3;
}

.daily-points {
  margin: 0.85rem auto 0;
  display: inline-flex;
  min-height: 1.7rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--theme-accent);
  padding: 0.22rem 0.95rem;
  color: #fff;
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1;
}

.daily-what {
  padding: 0.15rem 0.15rem 0;
}

.daily-what-heading {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 800;
  line-height: 1.2;
  color: var(--theme-ink);
}

.daily-instructions {
  margin: 0.55rem 0 0;
  font-size: 0.95rem;
  font-weight: 400;
  line-height: 1.5;
  color: var(--theme-ink);
}

.daily-all-hands-rule {
  margin: 0.7rem 0 0;
  font-size: 0.9rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--theme-ink);
}

.daily-meetup {
  display: flex;
  gap: 0.7rem;
  align-items: center;
  margin: 0.85rem 0 0;
  border-radius: 1.1rem;
  background: linear-gradient(to right, #b7e6e1, #e0f5ee);
  padding: 0.9rem 1rem;
  color: var(--theme-ink);
  box-shadow: var(--theme-card-shadow, 0 5px 12px rgba(36, 72, 78, 0.1));
}

.daily-meetup-icon {
  flex-shrink: 0;
  font-size: 1.15rem;
  color: var(--theme-primary);
}

.daily-meetup-copy {
  min-width: 0;
  flex: 1;
}

.daily-meetup-time {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.02rem;
  font-weight: 800;
  line-height: 1.25;
}

.daily-meetup-body {
  margin: 0.35rem 0 0;
  font-size: 0.9rem;
  font-weight: 500;
  line-height: 1.4;
}

.daily-meetup-time + .daily-meetup-body {
  margin-top: 0.4rem;
}

.daily-complete {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding-top: 0.15rem;
}

.daily-complete-question {
  margin: 0;
  text-align: center;
  font-family: var(--font-display);
  font-size: 1.12rem;
  font-weight: 800;
  line-height: 1.25;
  color: var(--theme-ink);
}

.daily-continue {
  position: relative;
  width: min(100%, 20rem);
  margin: 0;
  justify-content: center;
  gap: 0;
}

.daily-continue-label {
  text-align: center;
}

.daily-continue-icon {
  position: absolute;
  right: 1.1rem;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: none;
}
</style>
