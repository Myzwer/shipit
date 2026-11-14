<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/shared/AppIcon.vue'
import FloatingBottomNav from '@/components/shared/FloatingBottomNav.vue'
import BarStep from '@/features/drinkit/log/BarStep.vue'
import DrinkStep from '@/features/drinkit/log/DrinkStep.vue'
import FriendsStep from '@/features/drinkit/log/FriendsStep.vue'
import PhotoStep from '@/features/drinkit/log/PhotoStep.vue'
import ReviewStep from '@/features/drinkit/log/ReviewStep.vue'
import WizardModal from '@/features/drinkit/log/WizardModal.vue'
import WizardProgress from '@/features/drinkit/log/WizardProgress.vue'
import { setPhotoFraming as persistStagedFraming } from '@/lib/media/stagePhoto'
import { cloneFraming, type PhotoFraming } from '@/lib/media/framing'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { useDrinkLogWizardStore } from '@/stores/drinkLogWizard'
import { useSessionStore } from '@/stores/session'
import { copy, formatCopy } from '@/ui/copy'
import type { WizardEntrySource, WizardPrefill, WizardStep } from '@/types/drinkLog'

const route = useRoute()
const router = useRouter()
const wizard = useDrinkLogWizardStore()
const session = useSessionStore()
const awardsMode = useAwardsModeStore()
const focusCaption = ref(false)

const photoRestoreSnapshot = computed(() => {
  const url = wizard.photoPreviewUrl
  const width = wizard.photoPreviewWidth
  const height = wizard.photoPreviewHeight
  if (!url || !(width && height)) return null
  return {
    previewUrl: url,
    width,
    height,
    framing: wizard.photoFraming,
    staged: wizard.stagedPhoto,
  }
})

type ModalKind =
  | null
  | 'exit'
  | 'startOver'
  | 'unclaimed'
  | 'unknown'
  | 'failed'
  | 'eligibility'
  | 'already_claimed'
  | 'paused'
  | 'ended'
  | 'lockedEdit'
  | 'ingredientConfirm'

const modal = ref<ModalKind>(null)
const bootstrapped = ref(false)
const wizardEl = ref<HTMLElement | null>(null)
const showBack = computed(() => wizard.step !== 'bar')

const wizardProgressSteps = computed(() =>
  wizard.STEPS.map((id) => ({
    id,
    label: copy.wizard.steps[id],
  })),
)

/**
 * Route the player already chose when a guard cancelled navigation.
 * Header Exit leaves this null and falls back to the Drink It! home.
 * Completed only after Exit and Discard, via a fresh router.push.
 */
let pendingDestination: string | null = null
let confirmLeave = false
let discardOnLeave = false
let exitInFlight = false
let scrollFrame = 0

const completed = computed(() => {
  const set = new Set<WizardStep>()
  if (wizard.selectedBar) set.add('bar')
  if (wizard.selectedDrink) {
    set.add('drink')
    set.add('friends')
    set.add('photo')
  }
  if (wizard.step === 'review' && wizard.previewStatus === 'ready') set.add('review')
  const idx = wizard.STEPS.indexOf(wizard.step)
  for (let i = 0; i < idx; i++) set.add(wizard.STEPS[i]!)
  return set
})

const ingredientConfirmBody = computed(() => {
  const conf = wizard.ingredientConfirmable
  if (!conf) return ''
  return formatCopy(copy.wizard.confirmIngredientBody, {
    drinkName: conf.drink_display_name || wizard.selectedDrink?.displayName || 'this drink',
    ingredientName: conf.ingredient_display_name,
  })
})

function parsePrefill(): WizardPrefill {
  const source = (route.query.from as WizardEntrySource) || 'plus'
  return {
    source,
    barCanonicalKey: typeof route.query.bar === 'string' ? route.query.bar : undefined,
    offeringId: typeof route.query.offering === 'string' ? route.query.offering : undefined,
    drinkDisplayName: typeof route.query.drink === 'string' ? route.query.drink : undefined,
  }
}

onMounted(async () => {
  awardsMode.ensureStarted()
  await wizard.startFresh(parsePrefill())
  bootstrapped.value = true
  if (wizard.formLockedForUnknown) {
    modal.value = 'unknown'
  }
  if (awardsMode.isAwardsMode) {
    modal.value = 'ended'
  }
})

watch(
  () => awardsMode.isAwardsMode,
  (ended) => {
    if (!ended || !wizard.active) return
    if (wizard.submitStatus === 'success') return
    // Mid-form Friday 6 PM: explain before discarding unfinished work.
    modal.value = 'ended'
  },
)

onBeforeUnmount(() => {
  // Discard only after a confirmed leave actually unmounts the wizard.
  // A cancelled or failed navigation never reaches this hook, so the draft stays.
  if (discardOnLeave) {
    discardOnLeave = false
    wizard.resetAll()
  }
  if (scrollFrame) window.cancelAnimationFrame(scrollFrame)
})

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
  () => wizard.step,
  async () => {
    await nextTick()
    if (!wizardEl.value?.isConnected) return
    scheduleWizardScrollReset()
  },
)

watch(
  () => route.fullPath,
  async (path, prev) => {
    if (!bootstrapped.value || path === prev) return
    if (route.name !== 'drinkit-log') return
  },
)

/** First Log It screen (BAR). Exiting here never asks to leave — even after brief interaction. */
const isFirstWizardScreen = computed(() => wizard.step === wizard.STEPS[0])

onBeforeRouteLeave((to) => {
  // A confirmed Exit and Discard is already in flight. Allow it, including
  // redirects, without opening the dialog again.
  if (confirmLeave) return true
  if (!wizard.active) return true
  if (wizard.submitStatus === 'success') {
    wizard.resetAll()
    return true
  }
  // Awards Mode / View Wrapped — leave without Keep Editing prompt.
  if (to.name === 'drinkit-wrapped' || awardsMode.isAwardsMode) {
    wizard.resetAll()
    return true
  }
  if (wizard.formLockedForUnknown) {
    modal.value = 'unknown'
    return false
  }
  if (to.name === 'drinkit-log') return true
  // Screen one (BAR): leave immediately with no confirmation, discarding any
  // brief first-screen interaction. Screen two+ keep the Leave This Log? modal.
  if (isFirstWizardScreen.value) {
    wizard.resetAll()
    return true
  }
  // Returning false cancels this attempt. Resume the same URL with router.push
  // only after Exit and Discard — next() cannot continue a cancelled navigation.
  pendingDestination = to.fullPath
  modal.value = 'exit'
  return false
})

function requestExit() {
  if (exitInFlight) return
  if (wizard.formLockedForUnknown) {
    modal.value = 'unknown'
    return
  }
  // Header Exit on the first screen skips the leave confirmation.
  if (isFirstWizardScreen.value) {
    pendingDestination = null
    void confirmExit()
    return
  }
  pendingDestination = null
  modal.value = 'exit'
}

async function confirmExit() {
  if (exitInFlight) return
  if (wizard.formLockedForUnknown) {
    pendingDestination = null
    modal.value = 'unknown'
    return
  }
  exitInFlight = true
  const dest = pendingDestination ?? awardsMode.homePathForGame('drinkit')
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
    if (router.currentRoute.value.name === 'drinkit-log') {
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
  wizard.resetAll()
  void router.replace({ name: 'drinkit-wrapped' })
}

async function onSubmitClick() {
  if (wizard.formLockedForUnknown) {
    modal.value = 'unknown'
    return
  }
  if (wizard.needsUnclaimedConfirm()) {
    modal.value = 'unclaimed'
    return
  }
  await runSubmit()
}

async function runSubmit() {
  modal.value = null
  wizard.ensureIdempotencyKey()
  const outcome = await wizard.performSubmit()
  if (outcome.kind === 'confirmed' && outcome.result.submission_id) {
    const id = outcome.result.submission_id
    const { useAchievementCelebrationStore } = await import('@/stores/achievementCelebration')
    useAchievementCelebrationStore().queueFromSubmit({
      game: 'drinkit',
      submissionId: id,
      awardIds: outcome.result.new_achievement_ids,
      idempotentReplay: outcome.result.idempotent_replay === true,
    })
    wizard.resetAll()
    await router.replace({ name: 'drinkit-gallery', query: { submission: id } })
    return
  }
  if (outcome.kind === 'unknown') {
    modal.value = 'unknown'
    return
  }
  const code = outcome.result.code
  if (code === 'ELIGIBILITY_CHANGED') modal.value = 'eligibility'
  else if (code === 'ALREADY_CLAIMED') modal.value = 'already_claimed'
  else if (code === 'GAME_PAUSED') modal.value = 'paused'
  else if (code === 'GAME_ENDED') modal.value = 'ended'
  else modal.value = 'failed'
}

async function onRetry() {
  modal.value = null
  await runSubmit()
}

function onProgressSelect(stepId: string) {
  const step = stepId as WizardStep
  if (wizard.formLockedForUnknown && step !== 'review') {
    modal.value = 'lockedEdit'
    return
  }
  wizard.goToStep(step)
}

function onNavAction() {
  if (wizard.formLockedForUnknown) {
    modal.value = 'unknown'
    return
  }
  modal.value = 'startOver'
}

async function confirmStartOver() {
  modal.value = null
  await wizard.startFresh({ source: 'plus' })
  await router.replace({ name: 'drinkit-log' })
  if (wizard.formLockedForUnknown) modal.value = 'unknown'
}

function openIngredientConfirm() {
  if (!wizard.ingredientConfirmable) return
  modal.value = 'ingredientConfirm'
}

async function onReviewFraming(next: PhotoFraming) {
  if (wizard.formLockedForUnknown) return
  const framing = cloneFraming(next)
  wizard.setPhotoFraming(framing)
  const staged = wizard.stagedPhoto
  if (!staged?.photoId) return
  try {
    const saved = await persistStagedFraming(staged.photoId, framing)
    wizard.setPhotoFraming(saved)
    wizard.setStagedPhoto({ ...staged, framing: cloneFraming(saved) })
  } catch {
    // Keep local framing; submit still uses staged photo_id. Retry via Adjust if needed.
  }
}

function onReviewEditCaption() {
  if (wizard.formLockedForUnknown) {
    modal.value = 'unknown'
    return
  }
  focusCaption.value = true
  wizard.goToStep('photo')
}

function onReviewAddPhoto() {
  if (wizard.formLockedForUnknown) {
    modal.value = 'unknown'
    return
  }
  focusCaption.value = false
  wizard.goToStep('photo')
}

async function onIngredientConfirmYes() {
  modal.value = null
  await wizard.confirmIngredientYes()
}

function onIngredientConfirmNo() {
  modal.value = null
  wizard.confirmIngredientNo()
}
</script>

<template>
  <div
    ref="wizardEl"
    class="theme-drink log-wizard-root min-h-dvh"
    style="background: var(--theme-gradient-warm)"
    data-testid="log-wizard"
  >
    <header class="wizard-header" style="padding-top: max(0.4rem, env(safe-area-inset-top))">
      <button
        v-if="showBack"
        type="button"
        class="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10"
        :aria-label="copy.wizard.goBack"
        data-testid="wizard-back"
        :disabled="wizard.formLockedForUnknown"
        @click="wizard.goBack()"
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
        {{ copy.wizard.title }}
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
      :steps="wizardProgressSteps"
      :step="wizard.step"
      :completed="completed"
      :locked="wizard.formLockedForUnknown"
      @select="onProgressSelect"
    />

    <main class="mx-auto w-full max-w-lg">
      <BarStep
        v-if="wizard.step === 'bar'"
        :bars="wizard.sortedBars"
        :sort="wizard.barSort"
        :status="wizard.barsStatus"
        @sort="wizard.barSort = $event"
        @select="wizard.selectBar($event)"
        @retry="wizard.loadBars()"
      />
      <DrinkStep
        v-else-if="wizard.step === 'drink'"
        :drinks="wizard.filteredDrinks"
        :search="wizard.drinkSearch"
        :status="wizard.drinksStatus"
        :show-unlisted="wizard.showUnlistedForm"
        :unlisted-name="wizard.unlistedName"
        :unlisted-type="wizard.unlistedType"
        :active-ingredient-name="wizard.activeIngredientHint?.displayName ?? null"
        :unlisted-contains-ingredient="wizard.unlistedContainsIngredient"
        :show-featured-confirm="wizard.showFeaturedConfirm"
        :featured-drink-name="wizard.featuredCocktailHint?.drinkName ?? null"
        :unlisted-confirm-featured="wizard.unlistedConfirmFeatured"
        :is-mobile-order="wizard.selectedBar?.is_virtual === true"
        @update:search="wizard.drinkSearch = $event"
        @update:unlisted-name="wizard.unlistedName = $event"
        @update:unlisted-type="wizard.unlistedType = $event"
        @update:unlisted-contains-ingredient="wizard.unlistedContainsIngredient = $event"
        @update:unlisted-confirm-featured="wizard.unlistedConfirmFeatured = $event"
        @select-named="wizard.selectNamedDrink($event)"
        @select-generic="wizard.selectGeneric($event)"
        @open-unlisted="wizard.openUnlistedForm()"
        @confirm-unlisted="wizard.confirmUnlisted()"
        @cancel-unlisted="wizard.showUnlistedForm = false"
      />
      <FriendsStep
        v-else-if="wizard.step === 'friends'"
        :companions="wizard.companions"
        :selected-ids="wizard.selectedCompanionIds"
        :status="wizard.companionsStatus"
        :show-bar-reminder="wizard.showBarReminder"
        :crew-mate-ids="wizard.crewMateIds"
        :bar-preview-label="wizard.barPreviewLabel"
        :bar-preview-kind="wizard.barPreviewKind"
        :bar-preview-provisional="wizard.barPreviewProvisional"
        @toggle="wizard.toggleCompanion($event)"
        @continue="wizard.continueFromFriends()"
      />
      <PhotoStep
        v-else-if="wizard.step === 'photo'"
        :caption="wizard.caption"
        :locked="wizard.formLockedForUnknown"
        :focus-caption="focusCaption"
        :restore-photo="photoRestoreSnapshot"
        @update:caption="wizard.caption = $event"
        @continue="wizard.continueFromPhoto()"
        @staged="wizard.setStagedPhoto($event)"
        @local-ready="wizard.setPhotoPreviewImage($event)"
        @framing="wizard.setPhotoFraming($event)"
        @caption-focused="focusCaption = false"
      />
      <ReviewStep
        v-else-if="wizard.step === 'review'"
        :drink-name="wizard.selectedDrink?.displayName ?? ''"
        :bar-name="wizard.selectedBar?.name ?? ''"
        :companion-names="wizard.companionNames"
        :player-name="session.displayName"
        :caption="wizard.caption"
        :photo-preview-url="wizard.photoPreviewUrl"
        :photo-preview-width="wizard.photoPreviewWidth"
        :photo-preview-height="wizard.photoPreviewHeight"
        :photo-framing="wizard.photoFraming"
        :photo-staged="!!wizard.stagedPhoto"
        :preview="wizard.preview"
        :preview-status="wizard.previewStatus"
        :selected-claims="wizard.selectedClaims"
        :submitting="wizard.submitStatus === 'submitting'"
        :show-ingredient-mismatch-link="!!wizard.ingredientConfirmable"
        :locked="wizard.formLockedForUnknown"
        @toggle-claim="wizard.toggleClaim($event)"
        @submit="onSubmitClick"
        @retry-preview="wizard.refreshPreview()"
        @open-ingredient-confirm="openIngredientConfirm"
        @update-framing="onReviewFraming"
        @edit-caption="onReviewEditCaption"
        @add-photo="onReviewAddPhoto"
      />
    </main>

    <FloatingBottomNav game="drinkit" @action="onNavAction" />

    <WizardModal
      v-if="modal === 'exit'"
      :title="copy.wizard.leaveTitle"
      :body="copy.wizard.leaveBody"
      :primary-label="copy.wizard.exitDiscard"
      :secondary-label="copy.wizard.keepEditing"
      test-id="modal-exit"
      @primary="confirmExit"
      @secondary="cancelModal"
    />
    <WizardModal
      v-else-if="modal === 'startOver'"
      :title="copy.wizard.startOverTitle"
      :body="copy.wizard.startOverBody"
      :primary-label="copy.wizard.startOverConfirm"
      :secondary-label="copy.wizard.keepEditing"
      test-id="modal-start-over"
      @primary="confirmStartOver"
      @secondary="cancelModal"
    />
    <WizardModal
      v-else-if="modal === 'unclaimed'"
      :title="copy.wizard.unclaimedTitle"
      :body="copy.wizard.unclaimedBody"
      :primary-label="copy.wizard.submitAnyway"
      :secondary-label="copy.wizard.keepEditing"
      test-id="modal-unclaimed"
      @primary="runSubmit"
      @secondary="cancelModal"
    />
    <WizardModal
      v-else-if="modal === 'unknown'"
      :title="copy.wizard.unknownTitle"
      :body="copy.wizard.unknownBody"
      :primary-label="copy.wizard.retry"
      test-id="modal-unknown"
      @primary="onRetry"
    />
    <WizardModal
      v-else-if="modal === 'failed'"
      :title="copy.wizard.failedTitle"
      :body="copy.wizard.failedBody"
      :primary-label="copy.wizard.retry"
      :secondary-label="copy.wizard.keepEditing"
      test-id="modal-failed"
      @primary="onRetry"
      @secondary="cancelModal"
    />
    <WizardModal
      v-else-if="modal === 'eligibility'"
      :title="copy.wizard.eligibilityTitle"
      :body="copy.wizard.eligibilityBody"
      :primary-label="copy.wizard.backToReview"
      test-id="modal-eligibility"
      @primary="cancelModal"
    />
    <WizardModal
      v-else-if="modal === 'already_claimed'"
      :title="copy.wizard.alreadyClaimedTitle"
      :body="formatCopy(copy.wizard.alreadyClaimedBody, { bountyType: 'bounty' })"
      :primary-label="copy.wizard.backToReview"
      test-id="modal-already-claimed"
      @primary="cancelModal"
    />
    <WizardModal
      v-else-if="modal === 'paused'"
      :title="copy.wizard.gamePausedTitle"
      :body="copy.wizard.gamePausedBody"
      :primary-label="copy.wizard.ok"
      test-id="modal-paused"
      @primary="cancelModal"
    />
    <WizardModal
      v-else-if="modal === 'ended'"
      :title="copy.wizard.gameEndedTitle"
      :body="copy.wizard.gameEndedBody"
      :primary-label="copy.wrapped.viewWrapped"
      test-id="modal-ended"
      @primary="goToWrapped"
    />
    <WizardModal
      v-else-if="modal === 'lockedEdit'"
      :title="copy.wizard.unknownTitle"
      :body="copy.wizard.resolveBeforeEdit"
      :primary-label="copy.wizard.retry"
      :secondary-label="copy.wizard.keepEditing"
      test-id="modal-locked-edit"
      @primary="onRetry"
      @secondary="cancelModal"
    />
    <WizardModal
      v-else-if="modal === 'ingredientConfirm'"
      :title="copy.wizard.confirmIngredientTitle"
      :body="`${ingredientConfirmBody} ${copy.wizard.confirmIngredientHelper}`"
      :primary-label="copy.wizard.confirmIngredientYes"
      :secondary-label="copy.wizard.confirmIngredientNo"
      test-id="modal-ingredient-confirm"
      @primary="onIngredientConfirmYes"
      @secondary="onIngredientConfirmNo"
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
