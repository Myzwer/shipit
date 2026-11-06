<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  findPublishRequest,
  listCatalogVersions,
  newCatalogImportRequestId,
  previewPublish,
  publishImport,
  rollbackCatalog,
  stageImport,
  type CatalogVersionSummary,
  type PublishPreview,
} from '@/lib/adminCatalogImport'
import { previewCatalogImport, isReadyToStage, type CatalogPreviewResult } from '@/lib/catalog'
import {
  clearPendingAdminCatalogImport,
  readPendingAdminCatalogImport,
  writePendingAdminCatalogImport,
  type PendingAdminCatalogImport,
} from '@/lib/pendingAdminCatalogImport'
import { copy } from '@/ui/copy'

type Feedback = { kind: 'success' | 'error' | 'unknown'; title: string; body: string }

const paste = ref('')
const localPreview = ref<CatalogPreviewResult | null>(null)
const parseError = ref('')
const serverPreview = ref<PublishPreview | null>(null)
const candidateId = ref<string | null>(null)
const payloadHash = ref<string | null>(null)
const stagedPayload = ref<unknown>(null)
const versions = ref<CatalogVersionSummary[]>([])
const versionsError = ref('')
const busy = ref(false)
const feedback = ref<Feedback | null>(null)
const confirmPublish = ref(false)
const confirmRollbackId = ref<string | null>(null)
const pending = ref<PendingAdminCatalogImport | null>(null)
const rollbackPreview = ref<PublishPreview | null>(null)

const activeVersion = computed(() => versions.value.find((v) => v.is_active) ?? null)
const retiredVersions = computed(() =>
  versions.value.filter((v) => v.status === 'retired' && v.rollback_eligible),
)
const canStage = computed(
  () => Boolean(localPreview.value) && isReadyToStage(localPreview.value!) && !busy.value,
)
const canPublish = computed(
  () =>
    Boolean(candidateId.value && payloadHash.value && serverPreview.value?.safe_to_publish) &&
    !busy.value,
)

async function refreshVersions() {
  versionsError.value = ''
  try {
    versions.value = await listCatalogVersions()
  } catch (err) {
    versionsError.value = err instanceof Error ? err.message : copy.admin.catalogVersionsLoadError
  }
}

onMounted(() => {
  pending.value = readPendingAdminCatalogImport()
  void refreshVersions()
})

function resetStagingState() {
  serverPreview.value = null
  candidateId.value = null
  payloadHash.value = null
  stagedPayload.value = null
  confirmPublish.value = false
  rollbackPreview.value = null
  confirmRollbackId.value = null
}

function runLocalPreview(raw: string) {
  parseError.value = ''
  localPreview.value = null
  resetStagingState()
  feedback.value = null
  const trimmed = raw.trim()
  if (!trimmed) return
  try {
    const parsed = JSON.parse(trimmed) as unknown
    stagedPayload.value = parsed
    localPreview.value = previewCatalogImport(parsed)
  } catch {
    parseError.value = copy.admin.catalogJsonInvalid
  }
}

function onPasteInput() {
  runLocalPreview(paste.value)
}

async function onFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    paste.value = text
    runLocalPreview(text)
  } catch {
    parseError.value = copy.admin.catalogJsonInvalid
  } finally {
    input.value = ''
  }
}

async function runStageAndPreview() {
  if (!stagedPayload.value || busy.value) return
  busy.value = true
  feedback.value = null
  confirmPublish.value = false
  try {
    const requestId = newCatalogImportRequestId()
    writePendingAdminCatalogImport({
      action: 'stage',
      clientRequestId: requestId,
      catalogId:
        typeof (stagedPayload.value as { catalog_id?: string }).catalog_id === 'string'
          ? (stagedPayload.value as { catalog_id: string }).catalog_id
          : null,
    })
    pending.value = readPendingAdminCatalogImport()

    const staged = await stageImport(stagedPayload.value, requestId)
    if (staged.status !== 'ok') {
      clearPendingAdminCatalogImport()
      pending.value = null
      feedback.value = {
        kind: staged.status === 'unknown' ? 'unknown' : 'error',
        title: copy.admin.catalogStageFailureTitle,
        body: staged.message,
      }
      return
    }

    candidateId.value = staged.candidateId
    payloadHash.value = staged.payloadHash
    writePendingAdminCatalogImport({
      action: 'publish',
      clientRequestId: requestId,
      catalogId: staged.result.catalog_id ?? null,
      candidateId: staged.candidateId,
      expectedActiveCatalogVersionId: activeVersion.value?.id ?? null,
      expectedPayloadHash: staged.payloadHash,
    })
    pending.value = readPendingAdminCatalogImport()

    const preview = await previewPublish(staged.candidateId)
    if (preview.status !== 'ok') {
      feedback.value = {
        kind: 'error',
        title: copy.admin.catalogPreviewFailureTitle,
        body: preview.message,
      }
      return
    }
    serverPreview.value = preview.preview
    clearPendingAdminCatalogImport()
    pending.value = null
    feedback.value = {
      kind: 'success',
      title: copy.admin.catalogPreviewReadyTitle,
      body: preview.preview.safe_to_publish
        ? copy.admin.catalogPreviewSafeBody
        : copy.admin.catalogPreviewBlockedBody,
    }
  } finally {
    busy.value = false
  }
}

async function runPublish() {
  if (!candidateId.value || !payloadHash.value || busy.value) return
  busy.value = true
  feedback.value = null
  const requestId = newCatalogImportRequestId()
  writePendingAdminCatalogImport({
    action: 'publish',
    clientRequestId: requestId,
    candidateId: candidateId.value,
    expectedActiveCatalogVersionId: activeVersion.value?.id ?? null,
    expectedPayloadHash: payloadHash.value,
  })
  pending.value = readPendingAdminCatalogImport()
  try {
    const result = await publishImport({
      clientRequestId: requestId,
      candidateId: candidateId.value,
      expectedActiveCatalogVersionId: activeVersion.value?.id ?? null,
      expectedPayloadHash: payloadHash.value,
    })
    if (result.status === 'ok') {
      clearPendingAdminCatalogImport()
      pending.value = null
      confirmPublish.value = false
      feedback.value = {
        kind: 'success',
        title: copy.admin.catalogPublishSuccess,
        body: result.result.catalog_id ?? result.result.catalog_version_id ?? '',
      }
      resetStagingState()
      paste.value = ''
      localPreview.value = null
      await refreshVersions()
      return
    }
    if (result.status === 'failed') {
      clearPendingAdminCatalogImport()
      pending.value = null
      feedback.value = {
        kind: 'error',
        title: copy.admin.catalogPublishFailureTitle,
        body: result.message,
      }
      return
    }
    feedback.value = {
      kind: 'unknown',
      title: copy.admin.catalogUnknownTitle,
      body: result.message,
    }
  } finally {
    busy.value = false
  }
}

async function checkPendingStatus() {
  if (!pending.value || busy.value) return
  busy.value = true
  try {
    const result = await findPublishRequest(pending.value.clientRequestId)
    if (result.status === 'ok') {
      clearPendingAdminCatalogImport()
      pending.value = null
      feedback.value = {
        kind: 'success',
        title: copy.admin.catalogPublishSuccess,
        body: result.result.catalog_id ?? '',
      }
      await refreshVersions()
      return
    }
    if (result.status === 'failed') {
      clearPendingAdminCatalogImport()
      pending.value = null
      feedback.value = {
        kind: 'error',
        title: copy.admin.catalogPublishFailureTitle,
        body: result.message,
      }
      return
    }
    feedback.value = {
      kind: 'unknown',
      title: copy.admin.catalogUnknownTitle,
      body: result.message,
    }
  } finally {
    busy.value = false
  }
}

async function prepareRollback(versionId: string) {
  confirmRollbackId.value = versionId
  rollbackPreview.value = null
  feedback.value = {
    kind: 'success',
    title: copy.admin.catalogRollbackConfirmTitle,
    body: copy.admin.catalogRollbackConfirmBody,
  }
}

async function runRollback() {
  if (!confirmRollbackId.value || busy.value) return
  busy.value = true
  const requestId = newCatalogImportRequestId()
  writePendingAdminCatalogImport({
    action: 'rollback',
    clientRequestId: requestId,
    targetCatalogVersionId: confirmRollbackId.value,
    expectedActiveCatalogVersionId: activeVersion.value?.id ?? null,
  })
  pending.value = readPendingAdminCatalogImport()
  try {
    const result = await rollbackCatalog({
      clientRequestId: requestId,
      targetCatalogVersionId: confirmRollbackId.value,
      expectedActiveCatalogVersionId: activeVersion.value?.id ?? null,
    })
    if (result.status === 'ok') {
      clearPendingAdminCatalogImport()
      pending.value = null
      confirmRollbackId.value = null
      feedback.value = {
        kind: 'success',
        title: copy.admin.catalogRollbackSuccess,
        body: result.result.catalog_id ?? '',
      }
      await refreshVersions()
      return
    }
    if (result.status === 'failed') {
      clearPendingAdminCatalogImport()
      pending.value = null
      feedback.value = {
        kind: 'error',
        title: copy.admin.catalogRollbackFailureTitle,
        body: result.message,
      }
      return
    }
    feedback.value = {
      kind: 'unknown',
      title: copy.admin.catalogUnknownTitle,
      body: result.message,
    }
  } finally {
    busy.value = false
  }
}

function diffLine(label: string, added: number, removed: number) {
  return `${label}: +${added} / −${removed}`
}
</script>

<template>
  <section class="mt-6 rounded-2xl p-4" style="background: #fff" data-testid="catalog-import-section">
    <h2 class="font-display text-base font-bold tracking-wide" style="color: #2f3a44">
      {{ copy.admin.catalogImportSection }}
    </h2>
    <p class="mt-2 text-sm" style="color: #5a6570" data-testid="catalog-import-note">
      {{ copy.admin.catalogImportNote }}
    </p>
    <p class="mt-2 text-sm" style="color: #8a5a00" data-testid="catalog-import-export-distinction">
      {{ copy.admin.catalogImportExportDistinction }}
    </p>

    <div
      v-if="feedback"
      class="mt-4 rounded-2xl px-4 py-3 text-sm"
      :style="
        feedback.kind === 'success'
          ? { background: '#e7f6ef', color: '#1f4d3a' }
          : feedback.kind === 'unknown'
            ? { background: '#fff6e5', color: '#6b4a10' }
            : { background: '#fdeceb', color: '#6b1f1f' }
      "
      :data-kind="feedback.kind"
      data-testid="catalog-import-feedback"
    >
      <p class="font-semibold">{{ feedback.title }}</p>
      <p v-if="feedback.body" class="mt-1 break-words">{{ feedback.body }}</p>
      <div v-if="pending" class="mt-3 grid gap-2">
        <button
          type="button"
          class="min-h-12 rounded-full px-4 text-sm font-semibold text-white"
          style="background: #0a5c6b"
          data-testid="catalog-import-check-status"
          :disabled="busy"
          @click="checkPendingStatus"
        >
          {{ copy.admin.checkStatus }}
        </button>
      </div>
    </div>

    <div class="mt-4 rounded-xl px-3 py-2 text-sm" style="background: #f3f1ec; color: #2f3a44">
      <p class="font-semibold">{{ copy.admin.catalogCurrentVersion }}</p>
      <p v-if="versionsError" class="mt-1" data-testid="catalog-versions-error">{{ versionsError }}</p>
      <p v-else-if="activeVersion" class="mt-1 break-all" data-testid="catalog-active-version">
        {{ activeVersion.catalog_id }}
        <span class="opacity-70">({{ activeVersion.status }})</span>
      </p>
      <p v-else class="mt-1" data-testid="catalog-active-version-empty">
        {{ copy.admin.catalogNoActiveVersion }}
      </p>
    </div>

    <label class="mt-4 block text-sm font-semibold" style="color: #2f3a44">
      {{ copy.admin.catalogUploadLabel }}
      <input
        type="file"
        accept="application/json,.json"
        class="mt-1 block w-full text-sm"
        data-testid="catalog-import-file"
        :disabled="busy || Boolean(pending)"
        @change="onFileChange"
      />
    </label>

    <label class="mt-4 block text-sm font-semibold" style="color: #2f3a44">
      {{ copy.admin.catalogPasteLabel }}
      <textarea
        v-model="paste"
        rows="6"
        class="mt-1 min-h-28 w-full rounded-xl border px-3 py-2 font-mono text-xs disabled:opacity-60"
        data-testid="catalog-import-paste"
        :disabled="busy || Boolean(pending)"
        @input="onPasteInput"
      />
    </label>

    <p v-if="parseError" class="mt-2 text-sm" style="color: #6b1f1f" data-testid="catalog-parse-error">
      {{ parseError }}
    </p>

    <div
      v-if="localPreview"
      class="mt-4 rounded-xl border px-3 py-2 text-sm"
      style="border-color: #d9d3c8; color: #2f3a44"
      data-testid="catalog-local-preview"
    >
      <p class="font-semibold">{{ copy.admin.catalogLocalPreviewTitle }}</p>
      <p class="mt-1">{{ copy.admin.catalogReadiness }}: {{ localPreview.readiness }}</p>
      <p class="mt-1">
        {{ copy.admin.catalogShortages }}:
        cocktail {{ localPreview.shortages.cocktailShortage }}, ingredient
        {{ localPreview.shortages.ingredientShortage }}
      </p>
      <ul
        v-if="localPreview.schemaErrors?.length || localPreview.crossReferenceErrors?.length"
        class="mt-2 list-disc pl-5"
        data-testid="catalog-local-errors"
      >
        <li v-for="(e, i) in [...(localPreview.schemaErrors ?? []), ...(localPreview.crossReferenceErrors ?? [])].slice(0, 8)" :key="i">
          {{ e.code }}: {{ e.message }}
        </li>
      </ul>
    </div>

    <button
      type="button"
      class="mt-4 min-h-12 w-full rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
      style="background: #0a5c6b"
      data-testid="catalog-stage-preview"
      :disabled="!canStage || Boolean(pending)"
      @click="runStageAndPreview"
    >
      {{ busy ? copy.admin.catalogStagingAction : copy.admin.catalogStagePreviewAction }}
    </button>

    <div
      v-if="serverPreview"
      class="mt-4 rounded-xl border px-3 py-2 text-sm"
      style="border-color: #d9d3c8; color: #2f3a44"
      data-testid="catalog-server-preview"
    >
      <p class="font-semibold">{{ copy.admin.catalogServerPreviewTitle }}</p>
      <p class="mt-1" data-testid="catalog-safe-to-publish">
        {{ copy.admin.catalogSafeToPublish }}:
        {{ serverPreview.safe_to_publish ? copy.admin.yes : copy.admin.no }}
      </p>
      <ul class="mt-2 space-y-1" data-testid="catalog-diff-summary">
        <li>{{ diffLine('Bars', serverPreview.diff.bars.added_count, serverPreview.diff.bars.removed_count) }}</li>
        <li>
          {{
            diffLine(
              'Offerings',
              serverPreview.diff.offerings.added_count,
              serverPreview.diff.offerings.removed_count,
            )
          }}
        </li>
        <li>
          {{
            diffLine(
              'Cocktail candidates',
              serverPreview.diff.cocktail_candidates.added_count,
              serverPreview.diff.cocktail_candidates.removed_count,
            )
          }}
        </li>
        <li>
          {{
            diffLine(
              'Ingredient candidates',
              serverPreview.diff.ingredient_candidates.added_count,
              serverPreview.diff.ingredient_candidates.removed_count,
            )
          }}
        </li>
      </ul>
      <ul
        v-if="serverPreview.blockers.length"
        class="mt-3 list-disc pl-5"
        style="color: #6b1f1f"
        data-testid="catalog-blockers"
      >
        <li v-for="(b, i) in serverPreview.blockers" :key="i">{{ b.code }}: {{ b.message }}</li>
      </ul>
      <ul
        v-if="serverPreview.warnings.length"
        class="mt-3 list-disc pl-5"
        style="color: #6b4a10"
        data-testid="catalog-warnings"
      >
        <li v-for="(w, i) in serverPreview.warnings" :key="i">{{ w.code }}: {{ w.message }}</li>
      </ul>

      <button
        v-if="!confirmPublish"
        type="button"
        class="mt-4 min-h-12 w-full rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
        style="background: #0a5c6b"
        data-testid="catalog-publish-prepare"
        :disabled="!canPublish"
        @click="confirmPublish = true"
      >
        {{ copy.admin.catalogPublishAction }}
      </button>
      <div v-else class="mt-4 grid gap-2" data-testid="catalog-publish-confirm">
        <p class="text-sm" style="color: #6b1f1f">{{ copy.admin.catalogPublishConfirmBody }}</p>
        <button
          type="button"
          class="min-h-12 rounded-full px-5 text-sm font-semibold text-white disabled:opacity-50"
          style="background: #8b1e1e"
          data-testid="catalog-publish-confirm-yes"
          :disabled="busy"
          @click="runPublish"
        >
          {{ copy.admin.catalogPublishConfirmAction }}
        </button>
        <button
          type="button"
          class="min-h-12 rounded-full px-5 text-sm font-semibold"
          style="background: #eeeae3; color: #2f3a44"
          data-testid="catalog-publish-confirm-cancel"
          :disabled="busy"
          @click="confirmPublish = false"
        >
          {{ copy.admin.cancel }}
        </button>
      </div>
    </div>

    <div class="mt-6" data-testid="catalog-rollback-section">
      <h3 class="font-display text-sm font-bold tracking-wide" style="color: #2f3a44">
        {{ copy.admin.catalogRollbackTitle }}
      </h3>
      <p class="mt-1 text-sm" style="color: #5a6570">{{ copy.admin.catalogRollbackNote }}</p>
      <ul v-if="retiredVersions.length" class="mt-3 grid gap-2">
        <li
          v-for="v in retiredVersions"
          :key="v.id"
          class="rounded-xl border px-3 py-2 text-sm"
          style="border-color: #d9d3c8"
          data-testid="catalog-rollback-row"
        >
          <p class="break-all font-semibold" style="color: #2f3a44">{{ v.catalog_id }}</p>
          <button
            type="button"
            class="mt-2 min-h-12 w-full rounded-full px-4 text-sm font-semibold text-white disabled:opacity-50"
            style="background: #0a5c6b"
            data-testid="catalog-rollback-prepare"
            :disabled="busy || Boolean(pending)"
            @click="prepareRollback(v.id)"
          >
            {{ copy.admin.catalogRollbackPrepare }}
          </button>
        </li>
      </ul>
      <p v-else class="mt-2 text-sm" style="color: #5a6570" data-testid="catalog-rollback-empty">
        {{ copy.admin.catalogRollbackEmpty }}
      </p>
      <div v-if="confirmRollbackId" class="mt-3 grid gap-2" data-testid="catalog-rollback-confirm">
        <button
          type="button"
          class="min-h-12 rounded-full px-5 text-sm font-semibold text-white"
          style="background: #8b1e1e"
          data-testid="catalog-rollback-confirm-yes"
          :disabled="busy"
          @click="runRollback"
        >
          {{ copy.admin.catalogRollbackConfirmAction }}
        </button>
        <button
          type="button"
          class="min-h-12 rounded-full px-5 text-sm font-semibold"
          style="background: #eeeae3; color: #2f3a44"
          data-testid="catalog-rollback-confirm-cancel"
          :disabled="busy"
          @click="confirmRollbackId = null"
        >
          {{ copy.admin.cancel }}
        </button>
      </div>
    </div>
  </section>
</template>
