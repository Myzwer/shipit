/**
 * Drink It! logging wizard state (Phase 3B).
 * One intentional submission UUID; auto-fill bar_eligible from companions.
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import {
  buildSubmitPayload,
  fetchBarBountyReminder,
  listDrinkitBarDrinks,
  listDrinkitBars,
  listDrinkitCompanions,
  previewDrinkClaims,
  submitDrink,
  type SubmitCallOutcome,
} from '@/lib/drinkLog/api'
import {
  buildDefaultSelections,
  hasManuallyUnselectedEligible,
  reconcileSelections,
  selectedClaimsForSubmit,
} from '@/lib/drinkLog/claims'
import { sortDrinkitBars } from '@/lib/drinkLog/sortBars'
import type {
  BarSortMode,
  DrinkitBarDrinkRow,
  DrinkitBarRow,
  DrinkitCompanionRow,
  PreviewPayload,
  SelectedClaimChoice,
  SubmitDrinkResult,
  SubmitOutcomeKind,
  WizardDrinkSelection,
  WizardEntrySource,
  WizardPrefill,
  WizardStep,
} from '@/types/drinkLog'

const STEPS: WizardStep[] = ['bar', 'drink', 'friends', 'photo', 'review']

function newIdempotencyKey() {
  return crypto.randomUUID()
}

export const useDrinkLogWizardStore = defineStore('drinkLogWizard', () => {
  const active = ref(false)
  const step = ref<WizardStep>('bar')
  const entrySource = ref<WizardEntrySource>('plus')

  const bars = ref<DrinkitBarRow[]>([])
  const barsStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const barSort = ref<BarSortMode>('alpha')
  const selectedBar = ref<DrinkitBarRow | null>(null)

  const drinks = ref<DrinkitBarDrinkRow[]>([])
  const drinksStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const drinkSearch = ref('')
  const selectedDrink = ref<WizardDrinkSelection | null>(null)
  const showUnlistedForm = ref(false)
  const unlistedName = ref('')
  const unlistedType = ref<'cocktail' | 'beer' | 'wine' | 'other'>('cocktail')

  const companions = ref<DrinkitCompanionRow[]>([])
  const companionsStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const selectedCompanionIds = ref<string[]>([])
  const showBarReminder = ref(false)

  const caption = ref('')

  const preview = ref<PreviewPayload | null>(null)
  const previewStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const selectedClaims = ref<SelectedClaimChoice[]>([])
  const manuallyDeselected = ref<Set<string>>(new Set())

  const idempotencyKey = ref<string | null>(null)
  const submitStatus = ref<SubmitOutcomeKind>('idle')
  const submitResult = ref<SubmitDrinkResult | null>(null)
  const submitErrorMessage = ref<string | null>(null)
  const formLockedForUnknown = ref(false)

  const completedSteps = computed(() => {
    const done = new Set<WizardStep>()
    if (selectedBar.value) done.add('bar')
    if (selectedDrink.value) done.add('drink')
    // Friends is optional; mark complete once visited past friends or when leaving friends.
    if (stepIndex(step.value) > stepIndex('friends') || step.value === 'friends') {
      // only mark when user has reached friends or beyond after drink
      if (selectedDrink.value && stepIndex(step.value) >= stepIndex('friends')) {
        done.add('friends')
      }
    }
    if (stepIndex(step.value) > stepIndex('photo')) done.add('photo')
    if (step.value === 'review' && previewStatus.value === 'ready') done.add('review')
    return done
  })

  const sortedBars = computed(() => sortDrinkitBars(bars.value, barSort.value))

  const filteredDrinks = computed(() => {
    const q = drinkSearch.value.trim().toLowerCase()
    if (!q) return drinks.value
    return drinks.value.filter((d) => d.display_name.toLowerCase().includes(q))
  })

  const canLeaveWizard = computed(() => !formLockedForUnknown.value)

  function stepIndex(s: WizardStep) {
    return STEPS.indexOf(s)
  }

  function resetAll() {
    active.value = false
    step.value = 'bar'
    entrySource.value = 'plus'
    selectedBar.value = null
    drinks.value = []
    drinksStatus.value = 'idle'
    drinkSearch.value = ''
    selectedDrink.value = null
    showUnlistedForm.value = false
    unlistedName.value = ''
    unlistedType.value = 'cocktail'
    selectedCompanionIds.value = []
    showBarReminder.value = false
    caption.value = ''
    preview.value = null
    previewStatus.value = 'idle'
    selectedClaims.value = []
    manuallyDeselected.value = new Set()
    idempotencyKey.value = null
    submitStatus.value = 'idle'
    submitResult.value = null
    submitErrorMessage.value = null
    formLockedForUnknown.value = false
  }

  function invalidateFrom(changed: WizardStep) {
    if (formLockedForUnknown.value) return
    const idx = stepIndex(changed)
    if (idx <= stepIndex('bar')) {
      selectedDrink.value = null
      drinks.value = []
      drinkSearch.value = ''
      showUnlistedForm.value = false
    }
    if (idx <= stepIndex('drink')) {
      // companions kept unless bar/drink change requires re-preview only
    }
    if (idx <= stepIndex('friends')) {
      // caption kept
    }
    preview.value = null
    previewStatus.value = 'idle'
    selectedClaims.value = []
    manuallyDeselected.value = new Set()
    if (submitStatus.value !== 'unknown') {
      idempotencyKey.value = null
      submitStatus.value = 'idle'
      submitResult.value = null
      submitErrorMessage.value = null
    }
  }

  async function startFresh(prefill?: WizardPrefill) {
    resetAll()
    active.value = true
    entrySource.value = prefill?.source ?? 'plus'
    await loadBars()
    await loadCompanions()

    if (prefill?.barCanonicalKey) {
      const match =
        bars.value.find((b) => b.canonical_key === prefill.barCanonicalKey) ??
        (prefill.barDisplayName
          ? bars.value.find((b) => b.name === prefill.barDisplayName)
          : undefined)
      if (match) {
        selectedBar.value = match
        await loadDrinksForBar(match.canonical_key)
      }
    }

    if (prefill?.source === 'cocktail' && prefill.offeringId && selectedBar.value) {
      const drink = drinks.value.find((d) => d.offering_id === prefill.offeringId)
      if (drink) {
        selectedDrink.value = {
          mode: 'named_catalog',
          offeringId: drink.offering_id,
          displayName: drink.display_name,
        }
        step.value = 'friends'
        await refreshBarReminder()
        return
      }
    }

    if (prefill?.source === 'bar' && selectedBar.value) {
      step.value = 'drink'
      return
    }

    if (prefill?.source === 'ingredient') {
      step.value = 'bar'
      return
    }

    step.value = selectedBar.value ? 'drink' : 'bar'
  }

  async function loadBars() {
    barsStatus.value = 'loading'
    try {
      bars.value = await listDrinkitBars()
      barsStatus.value = 'ready'
    } catch {
      barsStatus.value = 'error'
    }
  }

  async function loadDrinksForBar(barKey: string) {
    drinksStatus.value = 'loading'
    try {
      drinks.value = await listDrinkitBarDrinks(barKey)
      drinksStatus.value = 'ready'
    } catch {
      drinksStatus.value = 'error'
    }
  }

  async function loadCompanions() {
    companionsStatus.value = 'loading'
    try {
      companions.value = await listDrinkitCompanions()
      companionsStatus.value = 'ready'
    } catch {
      companionsStatus.value = 'error'
    }
  }

  async function refreshBarReminder() {
    showBarReminder.value = false
    if (!selectedBar.value) return
    try {
      const row = await fetchBarBountyReminder(selectedBar.value.canonical_key)
      showBarReminder.value = row?.show_reminder === true
    } catch {
      showBarReminder.value = false
    }
  }

  async function selectBar(bar: DrinkitBarRow) {
    if (formLockedForUnknown.value) return
    const changed = selectedBar.value?.canonical_key !== bar.canonical_key
    selectedBar.value = bar
    if (changed) invalidateFrom('bar')
    await loadDrinksForBar(bar.canonical_key)
    step.value = 'drink'
  }

  async function selectNamedDrink(drink: DrinkitBarDrinkRow) {
    if (formLockedForUnknown.value) return
    selectedDrink.value = {
      mode: 'named_catalog',
      offeringId: drink.offering_id,
      displayName: drink.display_name,
    }
    showUnlistedForm.value = false
    invalidateFrom('drink')
    step.value = 'friends'
    await refreshBarReminder()
  }

  async function selectGeneric(mode: 'generic_beer' | 'generic_wine' | 'generic_other') {
    if (formLockedForUnknown.value) return
    const labels = {
      generic_beer: 'Beer',
      generic_wine: 'Wine',
      generic_other: 'Other Alcoholic Beverage',
    } as const
    selectedDrink.value = { mode, displayName: labels[mode] }
    showUnlistedForm.value = false
    invalidateFrom('drink')
    step.value = 'friends'
    await refreshBarReminder()
  }

  function openUnlistedForm() {
    if (formLockedForUnknown.value) return
    showUnlistedForm.value = true
  }

  async function confirmUnlisted() {
    if (formLockedForUnknown.value) return
    const name = unlistedName.value.trim()
    if (!name) return
    const modeMap = {
      cocktail: 'unlisted_named' as const,
      beer: 'generic_beer' as const,
      wine: 'generic_wine' as const,
      other: 'generic_other' as const,
    }
    // Type cocktail → unlisted_named; beer/wine/other map to generics when name not needed for scoring,
    // but UX asks for name always — use unlisted_named for cocktail, and for others still log as generic
    // with display name retained in caption? Spec: name + type. For beer/wine/other with custom name,
    // use unlisted_named so the name is preserved in the log.
    if (unlistedType.value === 'cocktail') {
      selectedDrink.value = {
        mode: 'unlisted_named',
        displayName: name,
        customName: name,
      }
    } else {
      // Preserve name via unlisted_named for ordinary log (no Cocktail/Ingredient auto-qualify).
      selectedDrink.value = {
        mode: 'unlisted_named',
        displayName: name,
        customName: name,
      }
      void modeMap
    }
    showUnlistedForm.value = false
    invalidateFrom('drink')
    step.value = 'friends'
    await refreshBarReminder()
  }

  function toggleCompanion(playerId: string) {
    if (formLockedForUnknown.value) return
    const set = new Set(selectedCompanionIds.value)
    if (set.has(playerId)) set.delete(playerId)
    else set.add(playerId)
    selectedCompanionIds.value = [...set]
    invalidateFrom('friends')
  }

  function goToStep(target: WizardStep) {
    if (formLockedForUnknown.value && target !== 'review') return
    const targetIdx = stepIndex(target)
    if (targetIdx < 0) return
    // Only allow navigating to completed earlier steps or current.
    if (target === 'bar') {
      step.value = 'bar'
      return
    }
    if (target === 'drink' && selectedBar.value) {
      step.value = 'drink'
      return
    }
    if (target === 'friends' && selectedDrink.value) {
      step.value = 'friends'
      void refreshBarReminder()
      return
    }
    if (target === 'photo' && selectedDrink.value) {
      step.value = 'photo'
      return
    }
    if (target === 'review' && selectedDrink.value) {
      void openReview()
    }
  }

  function goBack() {
    if (formLockedForUnknown.value) return
    if (showUnlistedForm.value) {
      showUnlistedForm.value = false
      return
    }
    const idx = stepIndex(step.value)
    if (idx <= 0) return
    step.value = STEPS[idx - 1]!
  }

  async function continueFromFriends() {
    if (formLockedForUnknown.value) return
    step.value = 'photo'
  }

  async function continueFromPhoto() {
    if (formLockedForUnknown.value) return
    await openReview()
  }

  async function openReview() {
    step.value = 'review'
    await refreshPreview()
  }

  function ensureIdempotencyKey() {
    if (!idempotencyKey.value) idempotencyKey.value = newIdempotencyKey()
    return idempotencyKey.value
  }

  function currentPayload() {
    if (!selectedBar.value || !selectedDrink.value || !idempotencyKey.value) return null
    return buildSubmitPayload({
      idempotencyKey: idempotencyKey.value,
      barCanonicalKey: selectedBar.value.canonical_key,
      drink: selectedDrink.value,
      companionIds: selectedCompanionIds.value,
      selectedClaims: selectedClaimsForSubmit(selectedClaims.value),
      caption: caption.value.trim() || null,
    })
  }

  async function refreshPreview() {
    if (!selectedBar.value || !selectedDrink.value) return
    previewStatus.value = 'loading'
    try {
      // Preview does not need a durable idempotency key; mint ephemeral for schema.
      const payload = buildSubmitPayload({
        idempotencyKey: crypto.randomUUID(),
        barCanonicalKey: selectedBar.value.canonical_key,
        drink: selectedDrink.value,
        companionIds: selectedCompanionIds.value,
        selectedClaims: [],
        caption: caption.value.trim() || null,
      })
      const res = await previewDrinkClaims(payload)
      preview.value = res.preview
      selectedClaims.value = reconcileSelections({
        preview: res.preview,
        previous: selectedClaims.value,
        manuallyDeselected: manuallyDeselected.value,
      })
      // First visit with empty previous → defaults
      if (!selectedClaims.value.length && manuallyDeselected.value.size === 0) {
        selectedClaims.value = buildDefaultSelections(res.preview)
      }
      previewStatus.value = 'ready'
    } catch {
      previewStatus.value = 'error'
    }
  }

  function toggleClaim(category: 'cocktail' | 'ingredient' | 'bar') {
    if (formLockedForUnknown.value) return
    const state = preview.value?.categories?.[category]
    if (!state || state.status !== 'eligible') return
    const idx = selectedClaims.value.findIndex((c) => c.category === category)
    if (idx >= 0) {
      selectedClaims.value = selectedClaims.value.filter((c) => c.category !== category)
      manuallyDeselected.value.add(category)
    } else {
      const defaults = buildDefaultSelections(preview.value!)
      const def = defaults.find((d) => d.category === category)
      if (def) {
        selectedClaims.value = [...selectedClaims.value, def]
        manuallyDeselected.value.delete(category)
      }
    }
  }

  function needsUnclaimedConfirm() {
    return hasManuallyUnselectedEligible({
      preview: preview.value,
      selected: selectedClaims.value,
    })
  }

  async function performSubmit(): Promise<SubmitCallOutcome> {
    if (formLockedForUnknown.value && submitStatus.value === 'unknown') {
      // Retry path
    } else if (submitStatus.value === 'submitting') {
      return { kind: 'rejected', result: { ok: false, code: 'BUSY' } }
    }

    ensureIdempotencyKey()
    const payload = currentPayload()
    if (!payload) {
      return { kind: 'rejected', result: { ok: false, code: 'INCOMPLETE' } }
    }

    submitStatus.value = 'submitting'
    submitErrorMessage.value = null
    const outcome = await submitDrink(payload)

    if (outcome.kind === 'confirmed') {
      submitStatus.value = 'success'
      submitResult.value = outcome.result
      formLockedForUnknown.value = false
      return outcome
    }
    if (outcome.kind === 'unknown') {
      submitStatus.value = 'unknown'
      formLockedForUnknown.value = true
      submitErrorMessage.value = 'Submission not confirmed'
      return outcome
    }

    const code = outcome.result.code ?? ''
    if (code === 'ELIGIBILITY_CHANGED') submitStatus.value = 'eligibility_changed'
    else if (code === 'ALREADY_CLAIMED') submitStatus.value = 'already_claimed'
    else if (code === 'GAME_PAUSED') submitStatus.value = 'game_paused'
    else if (code === 'GAME_ENDED') submitStatus.value = 'game_ended'
    else submitStatus.value = 'failed'
    submitResult.value = outcome.result
    submitErrorMessage.value = outcome.result.message ?? code
    if (outcome.result.preview) {
      preview.value = outcome.result.preview as PreviewPayload
      // Do not silently strip selections — leave Review for the player to adjust.
    }
    return outcome
  }

  async function retrySubmit() {
    return performSubmit()
  }

  /** After unknown outcome, only allow leaving once the player chooses to abandon the pending key. */
  function abandonUnknownAndEdit() {
    formLockedForUnknown.value = false
    submitStatus.value = 'idle'
    idempotencyKey.value = null
    submitResult.value = null
  }

  const companionNames = computed(() => {
    const map = new Map(companions.value.map((c) => [c.player_id, c.display_name]))
    return selectedCompanionIds.value.map((id) => map.get(id) ?? id)
  })

  return {
    STEPS,
    active,
    step,
    entrySource,
    bars,
    barsStatus,
    barSort,
    selectedBar,
    sortedBars,
    drinks,
    drinksStatus,
    drinkSearch,
    filteredDrinks,
    selectedDrink,
    showUnlistedForm,
    unlistedName,
    unlistedType,
    companions,
    companionsStatus,
    selectedCompanionIds,
    companionNames,
    showBarReminder,
    caption,
    preview,
    previewStatus,
    selectedClaims,
    manuallyDeselected,
    idempotencyKey,
    submitStatus,
    submitResult,
    submitErrorMessage,
    formLockedForUnknown,
    completedSteps,
    canLeaveWizard,
    resetAll,
    startFresh,
    loadBars,
    selectBar,
    selectNamedDrink,
    selectGeneric,
    openUnlistedForm,
    confirmUnlisted,
    toggleCompanion,
    goToStep,
    goBack,
    continueFromFriends,
    continueFromPhoto,
    openReview,
    refreshPreview,
    toggleClaim,
    needsUnclaimedConfirm,
    performSubmit,
    retrySubmit,
    abandonUnknownAndEdit,
    ensureIdempotencyKey,
    currentPayload,
    refreshBarReminder,
  }
})
