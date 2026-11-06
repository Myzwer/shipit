<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  applyAddDrink,
  deactivateManualOffering,
  listManualOfferings,
  loadAddDrinkOptions,
  newAddDrinkRequestId,
  previewAddDrink,
  reconcileAddDrink,
  type AddDrinkApplyOutcome,
  type AddDrinkPreview,
  type ExportBar,
  type ExportIngredient,
  type ManualOffering,
} from '@/lib/adminAddDrink'
import {
  clearPendingAdminAddDrink,
  readPendingAdminAddDrink,
  writePendingAdminAddDrink,
  type PendingAdminAddDrink,
} from '@/lib/pendingAdminAddDrink'
import { copy } from '@/ui/copy'

type Feedback = { kind: 'success' | 'error' | 'unknown'; title: string; body: string }

const bars = ref<ExportBar[]>([])
const ingredients = ref<ExportIngredient[]>([])
const optionsStatus = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const optionsError = ref('')

const offerings = ref<ManualOffering[]>([])
const offeringsError = ref('')

const name = ref('')
const selectedBars = ref<string[]>([])
const selectedIngredients = ref<string[]>([])
const ingredientSearch = ref('')
const newIngredient = ref('')

const preview = ref<{ data: AddDrinkPreview; signature: string } | null>(null)
const formError = ref('')
const feedback = ref<Feedback | null>(null)
const busy = ref(false)
const pending = ref<PendingAdminAddDrink | null>(null)
const removeConfirmId = ref<string | null>(null)

const locked = computed(() => Boolean(pending.value))

const formSignature = computed(() =>
  JSON.stringify([
    name.value.trim(),
    [...selectedBars.value].sort(),
    [...selectedIngredients.value].sort(),
  ]),
)
const previewIsCurrent = computed(
  () => Boolean(preview.value) && preview.value?.signature === formSignature.value,
)

const ingredientLabels = computed(() => {
  const map = new Map<string, string>()
  for (const i of ingredients.value) map.set(i.canonical_key, i.display_name)
  return map
})

const filteredIngredients = computed(() => {
  const q = ingredientSearch.value.trim().toLowerCase()
  if (!q) return ingredients.value
  return ingredients.value.filter(
    (i) => i.display_name.toLowerCase().includes(q) || i.canonical_key.includes(q),
  )
})

const activeOfferings = computed(() => offerings.value.filter((o) => o.active))

function inputClass() {
  return 'mt-1 min-h-12 w-full rounded-xl border px-3 py-2 text-base disabled:opacity-60'
}

function barLabel(key: string): string {
  return bars.value.find((b) => b.canonical_key === key)?.name ?? key
}

function ingredientLabel(key: string): string {
  return ingredientLabels.value.get(key) ?? key
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadOptions() {
  optionsStatus.value = 'loading'
  optionsError.value = ''
  try {
    const opts = await loadAddDrinkOptions()
    bars.value = opts.bars
    ingredients.value = opts.ingredients
    optionsStatus.value = 'ready'
  } catch (err) {
    optionsStatus.value = 'error'
    optionsError.value = err instanceof Error ? err.message : copy.admin.addDrinkLoadError
  }
}

async function loadOfferings() {
  offeringsError.value = ''
  try {
    offerings.value = await listManualOfferings()
  } catch (err) {
    offeringsError.value = err instanceof Error ? err.message : copy.admin.addDrinkLoadError
  }
}

async function loadAll() {
  await Promise.all([loadOptions(), loadOfferings()])
}

// ---------------------------------------------------------------------------
// Form
// ---------------------------------------------------------------------------

function resetForm() {
  name.value = ''
  selectedBars.value = []
  selectedIngredients.value = []
  ingredientSearch.value = ''
  newIngredient.value = ''
  preview.value = null
  formError.value = ''
}

function toggle(list: string[], key: string): string[] {
  return list.includes(key) ? list.filter((k) => k !== key) : [...list, key]
}

function toggleBar(key: string) {
  if (locked.value) return
  selectedBars.value = toggle(selectedBars.value, key)
}

function toggleIngredient(key: string) {
  if (locked.value) return
  selectedIngredients.value = toggle(selectedIngredients.value, key)
}

function addNewIngredient() {
  if (locked.value) return
  const key = newIngredient.value.trim()
  if (!key) return
  const lower = key.toLowerCase()
  const existing = ingredients.value.find(
    (i) => i.canonical_key === lower || i.display_name.toLowerCase() === lower,
  )
  const resolved = existing ? existing.canonical_key : key
  if (!selectedIngredients.value.includes(resolved)) {
    selectedIngredients.value = [...selectedIngredients.value, resolved]
  }
  newIngredient.value = ''
}

function validateForm(): string | null {
  const n = name.value.trim()
  if (n.length < 2 || n.length > 120) return copy.admin.addDrinkNameInvalid
  if (!selectedBars.value.length) return copy.admin.addDrinkBarsRequired
  return null
}

async function runPreview() {
  if (busy.value || locked.value) return
  formError.value = ''
  feedback.value = null
  const problem = validateForm()
  if (problem) {
    formError.value = problem
    return
  }
  busy.value = true
  try {
    const outcome = await previewAddDrink({
      displayName: name.value,
      barKeys: selectedBars.value,
      ingredientKeys: selectedIngredients.value,
    })
    if (outcome.status === 'ok') {
      preview.value = { data: outcome.preview, signature: formSignature.value }
    } else {
      preview.value = null
      formError.value = outcome.message
    }
  } finally {
    busy.value = false
  }
}

function editPreview() {
  preview.value = null
}

// ---------------------------------------------------------------------------
// Save / outcomes
// ---------------------------------------------------------------------------

function resolvePending() {
  pending.value = null
  clearPendingAdminAddDrink()
}

async function applyOutcome(outcome: AddDrinkApplyOutcome) {
  if (outcome.status === 'ok') {
    resolvePending()
    resetForm()
    feedback.value = { kind: 'success', title: copy.admin.addDrinkSuccess, body: '' }
    await loadAll()
    return
  }
  if (outcome.status === 'failed') {
    resolvePending()
    feedback.value = {
      kind: 'error',
      title: copy.admin.addDrinkFailureTitle,
      body: outcome.message || copy.admin.addDrinkFailureBody,
    }
    return
  }
  feedback.value = {
    kind: 'unknown',
    title: copy.admin.addDrinkUnknownTitle,
    body: copy.admin.addDrinkUnknownBody,
  }
}

async function save() {
  if (busy.value || locked.value || !previewIsCurrent.value) return
  const clientRequestId = newAddDrinkRequestId()
  const record = {
    clientRequestId,
    displayName: name.value.trim(),
    barKeys: [...selectedBars.value],
    ingredientKeys: [...selectedIngredients.value],
  }
  // Persist BEFORE the network call so a reload cannot drop the lock.
  pending.value = writePendingAdminAddDrink(record)
  busy.value = true
  feedback.value = null
  try {
    await applyOutcome(await applyAddDrink(record))
  } finally {
    busy.value = false
  }
}

/** Check Status — ledger lookup only. Never clears pending unless ok/failed is confirmed. */
async function checkStatus() {
  const p = pending.value
  if (!p || busy.value) return
  busy.value = true
  try {
    await applyOutcome(await reconcileAddDrink(p.clientRequestId))
  } finally {
    busy.value = false
  }
}

/** Retry Same Request — same request id and same intent; never mints a new operation. */
async function retrySame() {
  const p = pending.value
  if (!p || busy.value) return
  busy.value = true
  feedback.value = null
  try {
    await applyOutcome(
      await applyAddDrink({
        clientRequestId: p.clientRequestId,
        displayName: p.displayName,
        barKeys: p.barKeys,
        ingredientKeys: p.ingredientKeys,
      }),
    )
  } finally {
    busy.value = false
  }
}

// ---------------------------------------------------------------------------
// Remove added drink
// ---------------------------------------------------------------------------

async function removeOffering(offeringId: string) {
  if (busy.value) return
  busy.value = true
  feedback.value = null
  try {
    const outcome = await deactivateManualOffering(offeringId)
    removeConfirmId.value = null
    if (outcome.status === 'ok') {
      feedback.value = { kind: 'success', title: copy.admin.removeAddedDrinkSuccess, body: '' }
      await loadAll()
    } else {
      feedback.value = {
        kind: 'error',
        title: copy.admin.removeAddedDrink,
        body: outcome.message || copy.admin.removeAddedDrinkFailure,
      }
    }
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  const stored = readPendingAdminAddDrink()
  if (stored) {
    pending.value = stored
    name.value = stored.displayName
    selectedBars.value = [...stored.barKeys]
    selectedIngredients.value = [...stored.ingredientKeys]
    feedback.value = {
      kind: 'unknown',
      title: copy.admin.addDrinkUnknownTitle,
      body: copy.admin.addDrinkUnknownBody,
    }
  }
  await loadAll()
  if (stored) await checkStatus()
})

const feedbackStyle = computed(() =>
  feedback.value?.kind === 'success'
    ? { background: '#e7f6ef', color: '#1f4d3a' }
    : feedback.value?.kind === 'unknown'
      ? { background: '#fff6e5', color: '#6a4b12' }
      : { background: '#fdeceb', color: '#6b1f1f' },
)
</script>

<template>
  <section class="mt-6 rounded-2xl p-4" style="background: #fff" data-testid="add-drink-section">
    <h2 class="font-display text-base font-bold tracking-wide" style="color: #2f3a44">
      {{ copy.admin.addDrinkSection }}
    </h2>

    <!-- Feedback -->
    <div
      v-if="feedback"
      class="mt-4 rounded-2xl px-4 py-3 text-sm"
      :style="feedbackStyle"
      :data-kind="feedback.kind"
      data-testid="add-drink-feedback"
    >
      <p class="font-semibold">{{ feedback.title }}</p>
      <p v-if="feedback.body" class="mt-1">{{ feedback.body }}</p>
      <div v-if="feedback.kind === 'unknown' && pending" class="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          class="min-h-12 rounded-full px-4 text-sm font-semibold"
          style="background: #e8e2da; color: #2f3a44"
          data-testid="add-drink-check-status"
          :disabled="busy"
          @click="checkStatus"
        >
          {{ copy.admin.checkStatus }}
        </button>
        <button
          type="button"
          class="min-h-12 rounded-full px-4 text-sm font-semibold"
          style="background: #e8e2da; color: #2f3a44"
          data-testid="add-drink-retry-same"
          :disabled="busy"
          @click="retrySame"
        >
          {{ copy.admin.retrySameRequest }}
        </button>
      </div>
    </div>

    <!-- Options loading / error -->
    <p
      v-if="optionsStatus === 'loading' && !bars.length"
      class="mt-4 text-sm"
      style="color: #5a6570"
      data-testid="add-drink-loading"
    >
      {{ copy.admin.addDrinkLoading }}
    </p>
    <div
      v-else-if="optionsStatus === 'error'"
      class="mt-4 rounded-2xl px-4 py-3 text-sm"
      style="background: #fdeceb; color: #6b1f1f"
      data-testid="add-drink-load-error"
    >
      <p>{{ optionsError || copy.admin.addDrinkLoadError }}</p>
      <button
        type="button"
        class="mt-2 min-h-12 font-semibold underline"
        data-testid="add-drink-retry-load"
        @click="loadAll"
      >
        {{ copy.admin.rosterRetryLoad }}
      </button>
    </div>

    <!-- Form -->
    <form
      v-if="optionsStatus === 'ready' || locked"
      class="mt-4 rounded-2xl p-4"
      style="background: #f7f4ef; color: #2f3a44"
      data-testid="add-drink-form"
      @submit.prevent="runPreview"
    >
      <label class="block text-xs font-semibold uppercase tracking-wide" style="color: #5a6570">
        {{ copy.admin.addDrinkName }}
        <input
          v-model="name"
          type="text"
          :class="inputClass()"
          style="border-color: #c9c2b8; color: #2f3a44; background: #fff"
          data-testid="add-drink-name"
          autocomplete="off"
          :disabled="busy || locked"
        />
      </label>

      <fieldset class="mt-4">
        <legend class="text-xs font-semibold uppercase tracking-wide" style="color: #5a6570">
          {{ copy.admin.addDrinkBars }}
        </legend>
        <div class="mt-1 grid gap-2" data-testid="add-drink-bars">
          <label
            v-for="b in bars"
            :key="b.canonical_key"
            class="flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-white px-3 text-sm font-semibold"
            style="border-color: #c9c2b8"
          >
            {{ b.name }}
            <input
              type="checkbox"
              class="h-6 w-6 shrink-0"
              :checked="selectedBars.includes(b.canonical_key)"
              :data-testid="`add-drink-bar-${b.canonical_key}`"
              :disabled="busy || locked"
              @change="toggleBar(b.canonical_key)"
            />
          </label>
          <!-- Pending bars no longer in the list stay visible while locked. -->
          <p
            v-for="k in selectedBars.filter((k) => !bars.some((b) => b.canonical_key === k))"
            :key="k"
            class="rounded-xl border bg-white px-3 py-3 text-sm font-semibold"
            style="border-color: #c9c2b8"
          >
            {{ barLabel(k) }}
          </p>
        </div>
      </fieldset>

      <fieldset class="mt-4">
        <legend class="text-xs font-semibold uppercase tracking-wide" style="color: #5a6570">
          {{ copy.admin.addDrinkIngredients }}
        </legend>

        <div
          v-if="selectedIngredients.length"
          class="mt-2 flex flex-wrap gap-2"
          data-testid="add-drink-selected-ingredients"
        >
          <button
            v-for="k in selectedIngredients"
            :key="k"
            type="button"
            class="min-h-12 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-60"
            style="background: #2f3a44"
            :disabled="busy || locked"
            :aria-label="`${ingredientLabel(k)} ✕`"
            @click="toggleIngredient(k)"
          >
            {{ ingredientLabel(k) }} ✕
          </button>
        </div>
        <p v-else class="mt-1 text-xs" style="color: #5a6570">
          {{ copy.admin.addDrinkNoIngredients }}
        </p>

        <input
          v-model="ingredientSearch"
          type="search"
          :class="inputClass()"
          style="border-color: #c9c2b8; color: #2f3a44; background: #fff"
          :placeholder="copy.admin.addDrinkIngredientSearch"
          :aria-label="copy.admin.addDrinkIngredientSearch"
          data-testid="add-drink-ingredient-search"
          autocomplete="off"
          :disabled="busy || locked"
        />

        <div
          class="mt-2 grid max-h-64 gap-2 overflow-y-auto"
          data-testid="add-drink-ingredients"
        >
          <label
            v-for="i in filteredIngredients"
            :key="i.canonical_key"
            class="flex min-h-12 items-center justify-between gap-3 rounded-xl border bg-white px-3 text-sm font-semibold"
            style="border-color: #c9c2b8"
          >
            {{ i.display_name }}
            <input
              type="checkbox"
              class="h-6 w-6 shrink-0"
              :checked="selectedIngredients.includes(i.canonical_key)"
              :data-testid="`add-drink-ingredient-${i.canonical_key}`"
              :disabled="busy || locked"
              @change="toggleIngredient(i.canonical_key)"
            />
          </label>
        </div>

        <label
          class="mt-3 block text-xs font-semibold uppercase tracking-wide"
          style="color: #5a6570"
        >
          {{ copy.admin.addDrinkNewIngredient }}
          <div class="mt-1 grid grid-cols-[1fr_auto] gap-2">
            <input
              v-model="newIngredient"
              type="text"
              class="min-h-12 w-full rounded-xl border px-3 py-2 text-base disabled:opacity-60"
              style="border-color: #c9c2b8; color: #2f3a44; background: #fff"
              data-testid="add-drink-new-ingredient"
              autocomplete="off"
              :disabled="busy || locked"
              @keydown.enter.prevent="addNewIngredient"
            />
            <button
              type="button"
              class="min-h-12 rounded-full px-5 text-sm font-semibold disabled:opacity-50"
              style="background: #e8e2da; color: #2f3a44"
              data-testid="add-drink-new-ingredient-add"
              :disabled="busy || locked || !newIngredient.trim()"
              @click="addNewIngredient"
            >
              {{ copy.admin.addDrinkNewIngredientAction }}
            </button>
          </div>
        </label>
      </fieldset>

      <p
        v-if="formError"
        class="mt-3 text-sm font-semibold"
        style="color: #8b2e2e"
        data-testid="add-drink-form-error"
      >
        {{ formError }}
      </p>

      <!-- Preview card -->
      <div
        v-if="preview && previewIsCurrent"
        class="mt-4 rounded-2xl p-4"
        style="background: #fff"
        data-testid="add-drink-preview"
      >
        <p class="font-semibold">{{ copy.admin.addDrinkPreviewTitle }}</p>
        <p class="mt-2 text-base font-semibold">{{ preview.data.display_name }}</p>
        <ul class="mt-2 grid gap-1 text-sm">
          <li v-for="b in preview.data.bars" :key="b.canonical_key">
            {{ b.name ?? b.canonical_key }}
          </li>
        </ul>
        <ul
          v-if="preview.data.ingredients.length"
          class="mt-2 flex flex-wrap gap-2 text-xs font-semibold"
        >
          <li
            v-for="i in preview.data.ingredients"
            :key="i.canonical_key"
            class="rounded-full px-3 py-1"
            style="background: #e8e2da; color: #2f3a44"
          >
            {{ i.display_name ?? i.canonical_key }}
            <span v-if="i.will_create" style="color: #0a5c6b">
              · {{ copy.admin.addDrinkWillCreate }}
            </span>
          </li>
        </ul>
        <p class="mt-3 text-xs" style="color: #5a6570" data-testid="add-drink-no-rotation">
          {{ copy.admin.addDrinkNoRotation }}
        </p>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            class="min-h-12 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
            style="background: #0a5c6b"
            data-testid="add-drink-save"
            :disabled="busy || locked"
            @click="save"
          >
            {{ copy.admin.addDrinkSaveAction }}
          </button>
          <button
            type="button"
            class="min-h-12 rounded-full px-5 text-sm font-semibold disabled:opacity-50"
            style="background: #e8e2da; color: #2f3a44"
            data-testid="add-drink-edit"
            :disabled="busy"
            @click="editPreview"
          >
            {{ copy.admin.addDrinkEditAction }}
          </button>
        </div>
      </div>

      <button
        v-else
        type="submit"
        class="mt-4 min-h-12 w-full rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
        style="background: #0a5c6b"
        data-testid="add-drink-preview-run"
        :disabled="busy || locked"
      >
        {{ copy.admin.addDrinkPreviewAction }}
      </button>
    </form>

    <!-- Added drinks -->
    <h3 class="mt-6 font-semibold" style="color: #2f3a44">{{ copy.admin.addedDrinksTitle }}</h3>
    <p
      v-if="offeringsError"
      class="mt-2 text-sm"
      style="color: #6b1f1f"
      data-testid="add-drink-offerings-error"
    >
      {{ offeringsError }}
    </p>
    <p
      v-else-if="!activeOfferings.length"
      class="mt-2 text-sm"
      style="color: #5a6570"
      data-testid="add-drink-offerings-empty"
    >
      {{ copy.admin.addedDrinksEmpty }}
    </p>
    <ul v-else class="mt-2 grid gap-2" data-testid="add-drink-offerings">
      <li
        v-for="o in activeOfferings"
        :key="o.offering_id"
        class="rounded-2xl p-3"
        style="background: #f7f4ef; color: #2f3a44"
        data-testid="add-drink-offering-row"
        :data-offering-id="o.offering_id"
      >
        <p class="font-semibold">{{ o.display_name }}</p>
        <p class="text-xs" style="color: #5a6570">{{ o.bar_name ?? o.bar_canonical_key }}</p>
        <p v-if="o.ingredients.length" class="mt-1 text-xs" style="color: #5a6570">
          {{ o.ingredients.map((i) => i.display_name ?? i.canonical_key).join(', ') }}
        </p>

        <div
          v-if="removeConfirmId === o.offering_id"
          class="mt-3 rounded-2xl p-3"
          style="background: #fff3f0"
          data-testid="add-drink-remove-confirm"
        >
          <p class="font-semibold">{{ copy.admin.removeAddedDrinkConfirmTitle }}</p>
          <p class="mt-1 text-xs" style="color: #5a6570">
            {{ copy.admin.removeAddedDrinkConfirmBody }}
          </p>
          <div class="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              class="min-h-12 rounded-full px-4 text-sm font-semibold text-white disabled:opacity-50"
              style="background: #8b2e2e"
              data-testid="add-drink-remove-yes"
              :disabled="busy"
              @click="removeOffering(o.offering_id)"
            >
              {{ copy.admin.removeAddedDrink }}
            </button>
            <button
              type="button"
              class="min-h-12 rounded-full px-4 text-sm font-semibold disabled:opacity-50"
              style="background: #e8e2da; color: #2f3a44"
              data-testid="add-drink-remove-cancel"
              :disabled="busy"
              @click="removeConfirmId = null"
            >
              {{ copy.admin.cancel }}
            </button>
          </div>
        </div>
        <button
          v-else
          type="button"
          class="mt-3 min-h-12 w-full rounded-full px-4 text-sm font-semibold disabled:opacity-50"
          style="background: #e8e2da; color: #2f3a44"
          data-testid="add-drink-remove"
          :disabled="busy"
          @click="removeConfirmId = o.offering_id"
        >
          {{ copy.admin.removeAddedDrink }}
        </button>
      </li>
    </ul>
  </section>
</template>
