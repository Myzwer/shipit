<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  applyBountySkip,
  fetchBountySkipStatus,
  newBountySkipRequestId,
  reconcileBountySkip,
  type BountySkipApplyResult,
  type BountySkipCategory,
  type BountySkipCategoryStatus,
  type BountySkipStatus,
} from '@/lib/adminBountySkip'
import {
  clearPendingBountySkip,
  readPendingBountySkip,
  writePendingBountySkip,
  type PendingBountySkip,
} from '@/lib/pendingBountySkip'
import { copy, formatCopy } from '@/ui/copy'

const status = ref<BountySkipStatus | null>(null)
const loadStatus = ref<'loading' | 'ready' | 'error'>('loading')
const busy = ref(false)
const confirmCategory = ref<BountySkipCategory | null>(null)
const feedback = ref<{
  kind: 'success' | 'error' | 'unknown'
  title: string
  body: string
} | null>(null)
const pending = ref<PendingBountySkip | null>(null)

const locked = computed(() => busy.value || Boolean(pending.value))

const cocktail = computed(() => status.value?.categories?.cocktail ?? null)
const ingredient = computed(() => status.value?.categories?.ingredient ?? null)

async function loadStatusOnly(): Promise<boolean> {
  try {
    status.value = await fetchBountySkipStatus()
    loadStatus.value = 'ready'
    return true
  } catch (err) {
    loadStatus.value = status.value ? 'ready' : 'error'
    if (!pending.value) {
      feedback.value = {
        kind: 'error',
        title: copy.admin.skipFailureTitle,
        body: err instanceof Error ? err.message : copy.admin.skipFailureBody,
      }
    }
    return false
  }
}

function persistPending(next: PendingBountySkip) {
  pending.value = next
  writePendingBountySkip(next)
}

function clearPendingResolved() {
  pending.value = null
  clearPendingBountySkip()
}

function restorePendingFromStorage(): PendingBountySkip | null {
  const stored = readPendingBountySkip()
  if (!stored) return null
  pending.value = stored
  feedback.value = {
    kind: 'unknown',
    title: copy.admin.skipUnknownTitle,
    body: copy.admin.skipUnknownBody,
  }
  return stored
}

function applyOutcome(outcome: BountySkipApplyResult) {
  if (outcome.skipStatus) {
    status.value = outcome.skipStatus
    loadStatus.value = 'ready'
  }

  if (outcome.status === 'ok') {
    clearPendingResolved()
    feedback.value = {
      kind: 'success',
      title: copy.admin.skipSuccess,
      body:
        typeof outcome.result.display?.drink_name === 'string'
          ? String(outcome.result.display.drink_name)
          : typeof outcome.result.display?.display_name === 'string'
            ? String(outcome.result.display.display_name)
            : '',
    }
    void loadStatusOnly()
    return
  }

  if (outcome.status === 'failed') {
    clearPendingResolved()
    const body =
      outcome.code === 'no_reserves'
        ? copy.admin.skipNoReserves
        : outcome.code === 'finale'
          ? copy.admin.skipFinaleBody
          : outcome.code === 'stale'
            ? copy.admin.skipStaleBody
            : outcome.message || copy.admin.skipFailureBody
    feedback.value = {
      kind: 'error',
      title: copy.admin.skipFailureTitle,
      body,
    }
    void loadStatusOnly()
    return
  }

  feedback.value = {
    kind: 'unknown',
    title: copy.admin.skipUnknownTitle,
    body: outcome.message || copy.admin.skipUnknownBody,
  }
}

onMounted(async () => {
  const restored = restorePendingFromStorage()
  await loadStatusOnly()
  if (restored && pending.value) {
    busy.value = true
    try {
      const outcome = await reconcileBountySkip(
        restored.clientRequestId,
        restored.category,
        restored.expectedOfferId,
      )
      applyOutcome(outcome)
    } finally {
      busy.value = false
    }
  }
})

function openConfirm(category: BountySkipCategory) {
  if (locked.value) return
  const row = category === 'cocktail' ? cocktail.value : ingredient.value
  if (!row?.can_skip || !row.offer_id) return
  feedback.value = null
  confirmCategory.value = category
}

async function applyConfirmed() {
  if (!confirmCategory.value || busy.value || pending.value) return
  const category = confirmCategory.value
  const row = category === 'cocktail' ? cocktail.value : ingredient.value
  if (!row?.offer_id) return
  const requestId = newBountySkipRequestId()
  busy.value = true
  confirmCategory.value = null
  feedback.value = null

  persistPending({
    version: 1,
    clientRequestId: requestId,
    category,
    expectedOfferId: row.offer_id,
    cruiseConfigId: status.value?.cruise_config_id ?? null,
    createdAt: new Date().toISOString(),
  })

  try {
    const outcome = await applyBountySkip(category, row.offer_id, requestId)
    applyOutcome(outcome)
  } finally {
    busy.value = false
  }
}

async function reconcileOnly() {
  if (!pending.value || busy.value) return
  busy.value = true
  feedback.value = null
  try {
    const outcome = await reconcileBountySkip(
      pending.value.clientRequestId,
      pending.value.category,
      pending.value.expectedOfferId,
    )
    applyOutcome(outcome)
  } finally {
    busy.value = false
  }
}

async function retrySameSkip() {
  if (!pending.value || busy.value) return
  busy.value = true
  feedback.value = null
  try {
    const outcome = await applyBountySkip(
      pending.value.category,
      pending.value.expectedOfferId,
      pending.value.clientRequestId,
    )
    applyOutcome(outcome)
  } finally {
    busy.value = false
  }
}

function remainingLabel(row: BountySkipCategoryStatus | null) {
  const count = row?.replacements_remaining ?? 0
  return formatCopy(copy.admin.replacementsRemaining, { count })
}

function canAct(row: BountySkipCategoryStatus | null) {
  return Boolean(row?.can_skip && row.offer_id && !locked.value)
}
</script>

<template>
  <section class="mt-8" data-testid="bounty-skip-section">
    <h2 class="font-display text-base font-bold" style="color: #2f3a44">
      {{ copy.admin.bountySkipHeading }}
    </h2>

    <p v-if="loadStatus === 'loading'" class="mt-3 text-sm" style="color: #5c6570">Loading…</p>
    <p v-else-if="loadStatus === 'error'" class="mt-3 text-sm" style="color: #8a2f2f">
      {{ copy.admin.skipFailureBody }}
    </p>

    <div v-else class="mt-4 space-y-4">
      <div
        class="rounded-2xl px-4 py-4"
        style="background: #fff; border: 1px solid #e4ddd3"
        data-testid="skip-cocktail-card"
      >
        <p class="text-xs font-semibold uppercase tracking-wide" style="color: #5c6570">
          {{ copy.admin.bountyTypeCocktail }}
        </p>
        <p class="mt-1 font-semibold" style="color: #2f3a44" data-testid="skip-cocktail-name">
          {{ cocktail?.display_name || copy.admin.noCurrentBounty }}
        </p>
        <p class="mt-1 text-sm" style="color: #5c6570" data-testid="skip-cocktail-remaining">
          {{ remainingLabel(cocktail) }}
        </p>
        <p
          v-if="cocktail && !cocktail.can_skip && cocktail.skip_blocked_reason === 'NO_RESERVES'"
          class="mt-2 text-xs"
          style="color: #8a2f2f"
          data-testid="skip-cocktail-exhausted"
        >
          {{ copy.admin.skipNoReserves }}
        </p>
        <button
          type="button"
          class="mt-3 w-full rounded-full py-3 text-sm font-semibold text-white disabled:opacity-50"
          style="background: #0a5c6b"
          data-testid="skip-cocktail"
          :disabled="!canAct(cocktail)"
          @click="openConfirm('cocktail')"
        >
          {{ copy.admin.skipCurrentCocktail }}
        </button>
      </div>

      <div
        class="rounded-2xl px-4 py-4"
        style="background: #fff; border: 1px solid #e4ddd3"
        data-testid="skip-ingredient-card"
      >
        <p class="text-xs font-semibold uppercase tracking-wide" style="color: #5c6570">
          {{ copy.admin.bountyTypeIngredient }}
        </p>
        <p class="mt-1 font-semibold" style="color: #2f3a44" data-testid="skip-ingredient-name">
          {{ ingredient?.display_name || copy.admin.noCurrentBounty }}
        </p>
        <p class="mt-1 text-sm" style="color: #5c6570" data-testid="skip-ingredient-remaining">
          {{ remainingLabel(ingredient) }}
        </p>
        <p
          v-if="ingredient && !ingredient.can_skip && ingredient.skip_blocked_reason === 'NO_RESERVES'"
          class="mt-2 text-xs"
          style="color: #8a2f2f"
          data-testid="skip-ingredient-exhausted"
        >
          {{ copy.admin.skipNoReserves }}
        </p>
        <button
          type="button"
          class="mt-3 w-full rounded-full py-3 text-sm font-semibold text-white disabled:opacity-50"
          style="background: #0a5c6b"
          data-testid="skip-ingredient"
          :disabled="!canAct(ingredient)"
          @click="openConfirm('ingredient')"
        >
          {{ copy.admin.skipCurrentIngredient }}
        </button>
      </div>
    </div>

    <div
      v-if="feedback"
      class="mt-4 rounded-2xl px-4 py-3"
      :style="
        feedback.kind === 'success'
          ? { background: '#e7f5ef', color: '#14532d' }
          : feedback.kind === 'unknown'
            ? { background: '#fff7ed', color: '#9a3412' }
            : { background: '#fef2f2', color: '#991b1b' }
      "
      data-testid="skip-feedback"
      :data-kind="feedback.kind"
    >
      <p class="text-sm font-semibold">{{ feedback.title }}</p>
      <p v-if="feedback.body" class="mt-1 text-sm">{{ feedback.body }}</p>
      <div v-if="pending" class="mt-3 flex flex-col gap-2">
        <button
          type="button"
          class="rounded-full py-2 text-sm font-semibold"
          style="background: #0a5c6b; color: #fff"
          data-testid="retry-same-skip"
          :disabled="busy"
          @click="retrySameSkip"
        >
          {{ copy.admin.retrySameSkip }}
        </button>
        <button
          type="button"
          class="rounded-full py-2 text-sm font-semibold"
          style="background: transparent; color: inherit; outline: 1px solid currentColor"
          data-testid="reconcile-skip"
          :disabled="busy"
          @click="reconcileOnly"
        >
          {{ copy.admin.refreshSkipStatus }}
        </button>
      </div>
    </div>

    <div
      v-if="confirmCategory"
      class="fixed inset-0 z-50 flex items-end justify-center bg-black/45 px-4 pb-8 sm:items-center"
      data-testid="skip-confirm-modal"
      role="dialog"
      aria-modal="true"
    >
      <div class="w-full max-w-sm rounded-3xl px-5 py-5 shadow-xl" style="background: #fff; color: #2f3a44">
        <h3 class="font-display text-lg font-bold">{{ copy.admin.skipConfirmTitle }}</h3>
        <p class="mt-2 text-sm" style="color: #5c6570">
          {{
            formatCopy(copy.admin.skipConfirmBody, {
              bountyType:
                confirmCategory === 'cocktail'
                  ? copy.admin.bountyTypeCocktail
                  : copy.admin.bountyTypeIngredient,
            })
          }}
        </p>
        <div class="mt-5 flex flex-col gap-2">
          <button
            type="button"
            class="rounded-full py-3 text-sm font-semibold text-white"
            style="background: #0a5c6b"
            data-testid="skip-confirm-apply"
            @click="applyConfirmed"
          >
            {{
              confirmCategory === 'cocktail'
                ? copy.admin.skipCurrentCocktail
                : copy.admin.skipCurrentIngredient
            }}
          </button>
          <button
            type="button"
            class="rounded-full py-3 text-sm font-semibold"
            data-testid="skip-confirm-cancel"
            @click="confirmCategory = null"
          >
            {{ copy.admin.cancel }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>
