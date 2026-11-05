<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router'
import AppIcon from '@/components/shared/AppIcon.vue'
import FloatingBottomNav from '@/components/shared/FloatingBottomNav.vue'
import ShipTimeIndicator from '@/components/shared/ShipTimeIndicator.vue'
import BarStep from '@/features/drinkit/log/BarStep.vue'
import DrinkStep from '@/features/drinkit/log/DrinkStep.vue'
import FriendsStep from '@/features/drinkit/log/FriendsStep.vue'
import PhotoStep from '@/features/drinkit/log/PhotoStep.vue'
import ReviewStep from '@/features/drinkit/log/ReviewStep.vue'
import WizardModal from '@/features/drinkit/log/WizardModal.vue'
import WizardProgress from '@/features/drinkit/log/WizardProgress.vue'
import { useDrinkLogWizardStore } from '@/stores/drinkLogWizard'
import { copy, formatCopy } from '@/ui/copy'
import type { WizardEntrySource, WizardPrefill, WizardStep } from '@/types/drinkLog'

const route = useRoute()
const router = useRouter()
const wizard = useDrinkLogWizardStore()

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
  await wizard.startFresh(parsePrefill())
  bootstrapped.value = true
  if (wizard.formLockedForUnknown) {
    modal.value = 'unknown'
  }
})

onBeforeUnmount(() => {
  // Keep store until explicit discard so Plus mid-wizard can detect; cleared on leave confirm.
})

watch(
  () => route.fullPath,
  async (path, prev) => {
    if (!bootstrapped.value || path === prev) return
    if (route.name !== 'drinkit-log') return
  },
)

onBeforeRouteLeave((to, _from, next) => {
  if (!wizard.active) {
    next()
    return
  }
  if (wizard.submitStatus === 'success') {
    wizard.resetAll()
    next()
    return
  }
  if (wizard.formLockedForUnknown) {
    modal.value = 'unknown'
    next(false)
    return
  }
  if (to.name === 'drinkit-log') {
    next()
    return
  }
  modal.value = 'exit'
  pendingLeave.value = () => {
    wizard.resetAll()
    next()
  }
  next(false)
})

const pendingLeave = ref<null | (() => void)>(null)

function requestExit() {
  if (wizard.formLockedForUnknown) {
    modal.value = 'unknown'
    return
  }
  modal.value = 'exit'
}

function confirmExit() {
  modal.value = null
  const leave = pendingLeave.value
  pendingLeave.value = null
  wizard.resetAll()
  if (leave) leave()
  else void router.push('/drinkit')
}

function cancelModal() {
  modal.value = null
  pendingLeave.value = null
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

function onProgressSelect(step: WizardStep) {
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
  <div class="theme-drink min-h-dvh" style="background: var(--theme-page)" data-testid="log-wizard">
    <header
      class="sticky top-0 z-20 flex items-center justify-between px-3 py-3 text-white"
      style="background: var(--theme-header); padding-top: max(0.75rem, env(safe-area-inset-top))"
    >
      <button
        type="button"
        class="rounded-full p-2 hover:bg-white/10"
        :aria-label="copy.wizard.goBack"
        data-testid="wizard-back"
        :disabled="wizard.formLockedForUnknown"
        @click="wizard.goBack()"
      >
        <AppIcon name="header.back" class="text-lg" />
      </button>
      <h1 class="font-display text-lg font-bold tracking-[0.08em] uppercase">
        {{ copy.wizard.title }}
      </h1>
      <button
        type="button"
        class="rounded-full px-3 py-2 text-sm font-semibold hover:bg-white/10"
        data-testid="wizard-exit"
        @click="requestExit"
      >
        {{ copy.wizard.exit }}
      </button>
    </header>

    <ShipTimeIndicator />

    <WizardProgress
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
        @toggle="wizard.toggleCompanion($event)"
        @continue="wizard.continueFromFriends()"
      />
      <PhotoStep
        v-else-if="wizard.step === 'photo'"
        :caption="wizard.caption"
        @update:caption="wizard.caption = $event"
        @continue="wizard.continueFromPhoto()"
      />
      <ReviewStep
        v-else-if="wizard.step === 'review'"
        :drink-name="wizard.selectedDrink?.displayName ?? ''"
        :bar-name="wizard.selectedBar?.name ?? ''"
        :companion-names="wizard.companionNames"
        :caption="wizard.caption"
        :preview="wizard.preview"
        :preview-status="wizard.previewStatus"
        :selected-claims="wizard.selectedClaims"
        :submitting="wizard.submitStatus === 'submitting'"
        :show-ingredient-mismatch-link="!!wizard.ingredientConfirmable"
        @toggle-claim="wizard.toggleClaim($event)"
        @submit="onSubmitClick"
        @retry-preview="wizard.refreshPreview()"
        @open-ingredient-confirm="openIngredientConfirm"
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
      :primary-label="copy.wizard.ok"
      test-id="modal-ended"
      @primary="cancelModal"
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
