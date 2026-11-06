<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { processImageFile, revokeProcessedPreview, MediaProcessError } from '@/lib/media/processImage'
import {
  abandonPhotoUpload,
  stageProcessedPhoto,
  StagePhotoError,
  type PendingUploadSlot,
} from '@/lib/media/stagePhoto'
import type { PhotoGame, PhotoPurpose, ProcessedImage, StagedPhotoRef } from '@/types/media'
import { copy } from '@/ui/copy'

const props = withDefaults(
  defineProps<{
    game: PhotoGame
    purpose: PhotoPurpose
    required?: boolean
    /** When false, only process locally; enclosing form stages later. Default true. */
    autoStage?: boolean
    disabled?: boolean
  }>(),
  {
    required: false,
    autoStage: true,
    disabled: false,
  },
)

const emit = defineEmits<{
  staged: [ref: StagedPhotoRef | null]
  pending: [slot: PendingUploadSlot | null]
  localReady: [image: ProcessedImage | null]
  busy: [busy: boolean]
  error: [message: string | null]
}>()

const captureInput = ref<HTMLInputElement | null>(null)
const uploadInput = ref<HTMLInputElement | null>(null)

const processed = ref<ProcessedImage | null>(null)
const staged = ref<StagedPhotoRef | null>(null)
const pending = ref<PendingUploadSlot | null>(null)
/** Fresh UUID per selection attempt for idempotent begin. */
const beginRequestId = ref<string | null>(null)
const status = ref<'empty' | 'processing' | 'ready_local' | 'uploading' | 'staged' | 'error'>('empty')
const errorMessage = ref<string | null>(null)
const progressMessage = ref<string | null>(null)
const uploadInFlight = ref(false)

const busy = computed(
  () => status.value === 'processing' || status.value === 'uploading' || uploadInFlight.value,
)

watch(busy, (v) => emit('busy', v))

function clearError() {
  errorMessage.value = null
  emit('error', null)
}

function setError(message: string) {
  errorMessage.value = message
  status.value = 'error'
  emit('error', message)
}

async function abandonSlot(slot: PendingUploadSlot | StagedPhotoRef | null) {
  const id = slot && 'photoId' in slot ? slot.photoId : null
  if (!id) return
  try {
    await abandonPhotoUpload(id)
  } catch {
    /* best-effort — bound photos correctly refuse */
  }
}

async function abandonCurrent() {
  await abandonSlot(pending.value ?? staged.value)
  pending.value = null
  staged.value = null
  beginRequestId.value = null
  emit('pending', null)
  emit('staged', null)
}

function clearLocal(options?: { abandonRemote?: boolean }) {
  revokeProcessedPreview(processed.value)
  processed.value = null
  emit('localReady', null)
  if (options?.abandonRemote !== false) {
    void abandonCurrent()
  } else {
    pending.value = null
    staged.value = null
    beginRequestId.value = null
    emit('pending', null)
    emit('staged', null)
  }
  status.value = 'empty'
  progressMessage.value = null
  clearError()
  if (captureInput.value) captureInput.value.value = ''
  if (uploadInput.value) uploadInput.value.value = ''
}

async function handleFile(file: File | undefined | null) {
  if (!file || props.disabled || busy.value) return
  clearError()

  // Keep prior valid photo until the replacement processes successfully.
  const previousProcessed = processed.value
  const previousStaged = staged.value
  const previousPending = pending.value
  const previousBeginId = beginRequestId.value
  const previousStatus = status.value

  status.value = 'processing'
  progressMessage.value = copy.photo.processing
  try {
    const image = await processImageFile(file)
    // Only now drop the prior reservation.
    if (previousProcessed && previousProcessed !== image) {
      revokeProcessedPreview(previousProcessed)
    }
    if (previousPending || previousStaged) {
      await abandonSlot(previousPending ?? previousStaged)
    }

    beginRequestId.value = crypto.randomUUID()
    pending.value = null
    staged.value = null
    emit('pending', null)
    emit('staged', null)

    processed.value = image
    emit('localReady', image)
    status.value = 'ready_local'
    progressMessage.value = null

    if (props.autoStage) {
      await runStage()
    }
  } catch (err) {
    progressMessage.value = null
    // Restore previous photo on failed replace/retake processing.
    if (previousProcessed) {
      processed.value = previousProcessed
      staged.value = previousStaged
      pending.value = previousPending
      beginRequestId.value = previousBeginId
      status.value = previousStatus === 'staged' ? 'staged' : 'ready_local'
      emit('localReady', previousProcessed)
      emit('staged', previousStaged)
      emit('pending', previousPending)
    } else {
      status.value = 'error'
    }
    if (err instanceof MediaProcessError) {
      setError(err.message)
    } else {
      setError(copy.photo.processFailed)
    }
  }
}

async function runStage() {
  if (!processed.value || uploadInFlight.value) return
  if (staged.value?.status === 'staged') {
    emit('staged', staged.value)
    status.value = 'staged'
    return
  }
  if (offline()) {
    setError(copy.photo.offline)
    return
  }

  if (!beginRequestId.value) beginRequestId.value = crypto.randomUUID()

  uploadInFlight.value = true
  status.value = 'uploading'
  clearError()
  try {
    const result = await stageProcessedPhoto({
      image: processed.value,
      game: props.game,
      purpose: props.purpose,
      existing: staged.value,
      pending: pending.value,
      beginRequestId: beginRequestId.value,
      onPending: (slot) => {
        pending.value = slot
        emit('pending', slot)
      },
      onProgress: (p) => {
        progressMessage.value = p.message
      },
    })
    pending.value = result.pending
    staged.value = result.staged
    status.value = 'staged'
    progressMessage.value = null
    emit('pending', result.pending)
    emit('staged', result.staged)
  } catch (err) {
    progressMessage.value = null
    if (err instanceof StagePhotoError) {
      if (err.code === 'BEGIN_REQUEST_CONSUMED' || err.code === 'PHOTO_ABANDONED') {
        beginRequestId.value = crypto.randomUUID()
        pending.value = null
        emit('pending', null)
      }
      setError(err.message)
    } else {
      setError(copy.photo.uploadFailed)
    }
    // Preserve local image + pending reservation for Retry.
    status.value = 'error'
  } finally {
    uploadInFlight.value = false
  }
}

function offline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

function onCaptureChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  void handleFile(input.files?.[0] ?? null)
}

function onUploadChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  void handleFile(input.files?.[0] ?? null)
}

function openCapture() {
  if (props.disabled || busy.value) return
  captureInput.value?.click()
}

function openUpload() {
  if (props.disabled || busy.value) return
  uploadInput.value?.click()
}

function removePhoto() {
  if (busy.value) return
  clearLocal()
}

function retake() {
  if (busy.value) return
  openCapture()
}

function replacePhoto() {
  if (busy.value) return
  openUpload()
}

function retryUpload() {
  if (!processed.value || busy.value) return
  void runStage()
}

onBeforeUnmount(() => {
  // Do not abandon staged remote on unmount — wizard may still hold the id.
  revokeProcessedPreview(processed.value)
})

defineExpose({
  retryUpload,
  removePhoto,
  clearLocal,
  getStaged: () => staged.value,
  getProcessed: () => processed.value,
  status,
})
</script>

<template>
  <div data-testid="photo-capture" class="space-y-4">
    <input
      ref="captureInput"
      type="file"
      accept="image/*,.heic,.heif"
      capture="environment"
      class="sr-only"
      data-testid="photo-capture-input"
      :disabled="disabled || busy"
      @change="onCaptureChange"
    />
    <input
      ref="uploadInput"
      type="file"
      accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
      class="sr-only"
      data-testid="photo-upload-input"
      :disabled="disabled || busy"
      @change="onUploadChange"
    />

    <div v-if="!processed" class="grid grid-cols-2 gap-3">
      <button
        type="button"
        class="rounded-2xl py-4 text-sm font-semibold text-white disabled:opacity-60"
        style="background: var(--theme-primary)"
        data-testid="photo-take"
        :disabled="disabled || busy"
        @click="openCapture"
      >
        {{ copy.photo.takePhoto }}
      </button>
      <button
        type="button"
        class="rounded-2xl py-4 text-sm font-semibold disabled:opacity-60"
        style="background: var(--theme-card); color: var(--theme-ink)"
        data-testid="photo-upload"
        :disabled="disabled || busy"
        @click="openUpload"
      >
        {{ copy.photo.uploadPhoto }}
      </button>
    </div>

    <div
      v-else
      class="overflow-hidden rounded-2xl"
      style="background: var(--theme-card)"
      data-testid="photo-preview-wrap"
    >
      <img
        :src="processed.previewUrl"
        alt=""
        class="mx-auto max-h-72 w-full object-contain"
        data-testid="photo-preview"
      />
      <div class="flex flex-wrap gap-2 px-3 py-3">
        <button
          type="button"
          class="rounded-full px-3 py-2 text-xs font-semibold disabled:opacity-60"
          style="background: var(--theme-header); color: white"
          data-testid="photo-retake"
          :disabled="disabled || busy"
          @click="retake"
        >
          {{ copy.photo.retake }}
        </button>
        <button
          type="button"
          class="rounded-full px-3 py-2 text-xs font-semibold disabled:opacity-60"
          style="background: var(--theme-header); color: white"
          data-testid="photo-replace"
          :disabled="disabled || busy"
          @click="replacePhoto"
        >
          {{ copy.photo.replace }}
        </button>
        <button
          type="button"
          class="rounded-full px-3 py-2 text-xs font-semibold disabled:opacity-60"
          style="color: var(--theme-ink)"
          data-testid="photo-remove"
          :disabled="disabled || busy"
          @click="removePhoto"
        >
          {{ copy.photo.remove }}
        </button>
      </div>
    </div>

    <p
      v-if="progressMessage"
      class="text-sm"
      style="color: var(--theme-muted)"
      data-testid="photo-progress"
      aria-live="polite"
    >
      {{ progressMessage }}
    </p>

    <p
      v-if="status === 'staged'"
      class="text-sm font-semibold"
      style="color: var(--theme-primary)"
      data-testid="photo-staged-ready"
    >
      {{ copy.photo.stagedReady }}
    </p>

    <div
      v-if="errorMessage"
      class="rounded-2xl px-4 py-3 text-sm"
      style="background: var(--theme-card); color: var(--theme-ink)"
      data-testid="photo-error"
      role="alert"
    >
      <p>{{ errorMessage }}</p>
      <button
        v-if="processed && status === 'error'"
        type="button"
        class="mt-2 text-sm font-semibold underline"
        style="color: var(--theme-primary)"
        data-testid="photo-retry"
        :disabled="busy"
        @click="retryUpload"
      >
        {{ copy.photo.retry }}
      </button>
      <p v-if="!processed" class="mt-2 text-xs" style="color: var(--theme-muted)">
        {{ copy.photo.reselectHint }}
      </p>
    </div>

    <p
      v-if="required && !processed && !busy"
      class="text-sm"
      style="color: var(--theme-muted)"
      data-testid="photo-required-hint"
    >
      {{ copy.photo.requiredHint }}
    </p>

    <p class="text-xs" style="color: var(--theme-muted)" data-testid="photo-limits-hint">
      {{ copy.photo.limitsHint }}
    </p>
  </div>
</template>
