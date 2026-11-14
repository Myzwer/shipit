<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import FramedPhoto from '@/components/shared/FramedPhoto.vue'
import PhotoFramingEditor from '@/components/shared/PhotoFramingEditor.vue'
import {
  DEFAULT_PHOTO_FRAMING,
  cloneFraming,
  type PhotoFraming,
} from '@/lib/media/framing'
import { processImageFile, revokeProcessedPreview, MediaProcessError } from '@/lib/media/processImage'
import {
  abandonPhotoUpload,
  setPhotoFraming,
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
    /**
     * Rehydrate an already-accepted photo when PhotoCapture remounts
     * (e.g. Review → Edit Caption). Preview URL must still be valid.
     */
    restore?: {
      previewUrl: string
      width: number
      height: number
      framing?: PhotoFraming | null
      staged?: StagedPhotoRef | null
    } | null
  }>(),
  {
    required: false,
    autoStage: true,
    disabled: false,
    restore: null,
  },
)

const emit = defineEmits<{
  staged: [ref: StagedPhotoRef | null]
  pending: [slot: PendingUploadSlot | null]
  localReady: [image: ProcessedImage | null]
  framing: [framing: PhotoFraming | null]
  busy: [busy: boolean]
  error: [message: string | null]
}>()

const captureInput = ref<HTMLInputElement | null>(null)
const uploadInput = ref<HTMLInputElement | null>(null)

const processed = ref<ProcessedImage | null>(null)
const staged = ref<StagedPhotoRef | null>(null)
const pending = ref<PendingUploadSlot | null>(null)
const framing = ref<PhotoFraming>(cloneFraming())
/** Fresh UUID per selection attempt for idempotent begin. */
const beginRequestId = ref<string | null>(null)
const status = ref<'empty' | 'processing' | 'ready_local' | 'uploading' | 'staged' | 'error'>('empty')
const errorMessage = ref<string | null>(null)
const progressMessage = ref<string | null>(null)
const uploadInFlight = ref(false)

const editorOpen = ref(false)
const editorMode = ref<'new' | 'adjust'>('new')
const editorImage = ref<ProcessedImage | null>(null)
const editorInitialFraming = ref<PhotoFraming>(cloneFraming())

const busy = computed(
  () =>
    status.value === 'processing' ||
    status.value === 'uploading' ||
    uploadInFlight.value ||
    editorOpen.value,
)

watch(busy, (v) => emit('busy', v))

function applyRestore(snapshot: NonNullable<typeof props.restore>) {
  if (processed.value) return
  const image: ProcessedImage = {
    // Blob is unavailable after remount; Retake/Replace replace it before re-stage.
    blob: new Blob(),
    mimeType: snapshot.staged?.mimeType === 'image/png'
      ? 'image/png'
      : snapshot.staged?.mimeType === 'image/webp'
        ? 'image/webp'
        : 'image/jpeg',
    width: snapshot.width,
    height: snapshot.height,
    byteSize: snapshot.staged?.byteSize ?? 1,
    previewUrl: snapshot.previewUrl,
    originalFilename: null,
  }
  processed.value = image
  framing.value = cloneFraming(snapshot.framing ?? DEFAULT_PHOTO_FRAMING)
  staged.value = snapshot.staged ?? null
  pending.value = snapshot.staged
    ? {
        photoId: snapshot.staged.photoId,
        bucket: snapshot.staged.bucket,
        storagePath: snapshot.staged.storagePath,
        clientRequestId: null,
      }
    : null
  status.value = snapshot.staged ? 'staged' : 'ready_local'
  emit('localReady', image)
  emit('framing', cloneFraming(framing.value))
  emit('staged', staged.value)
  emit('pending', pending.value)
}

watch(
  () => props.restore,
  (snapshot) => {
    if (snapshot?.previewUrl && snapshot.width > 0 && snapshot.height > 0) {
      applyRestore(snapshot)
    }
  },
  { immediate: true },
)

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
  framing.value = cloneFraming()
  emit('localReady', null)
  emit('framing', null)
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

function closeEditor(options?: { revokeDraft?: boolean }) {
  if (options?.revokeDraft && editorImage.value && editorImage.value !== processed.value) {
    revokeProcessedPreview(editorImage.value)
  }
  editorImage.value = null
  editorOpen.value = false
}

async function handleFile(file: File | undefined | null) {
  if (!file || props.disabled || busy.value) return
  clearError()

  status.value = 'processing'
  progressMessage.value = copy.photo.processing
  try {
    const image = await processImageFile(file)
    progressMessage.value = null
    // Keep any previously accepted photo until Use Photo; editor sets busy.
    if (!processed.value) status.value = 'empty'
    else if (staged.value) status.value = 'staged'
    else status.value = 'ready_local'
    editorMode.value = 'new'
    editorImage.value = image
    editorInitialFraming.value = cloneFraming(DEFAULT_PHOTO_FRAMING)
    editorOpen.value = true
  } catch (err) {
    progressMessage.value = null
    status.value = processed.value
      ? staged.value
        ? 'staged'
        : 'ready_local'
      : 'error'
    if (err instanceof MediaProcessError) {
      setError(err.message)
    } else {
      setError(copy.photo.processFailed)
    }
  }
}

async function onEditorAccept(next: PhotoFraming) {
  const draft = editorImage.value
  if (!draft) {
    closeEditor()
    return
  }

  if (editorMode.value === 'adjust') {
    framing.value = cloneFraming(next)
    emit('framing', cloneFraming(next))
    if (staged.value?.photoId) {
      try {
        const saved = await setPhotoFraming(staged.value.photoId, framing.value)
        framing.value = saved
        staged.value = { ...staged.value, framing: cloneFraming(saved) }
        emit('staged', staged.value)
        emit('framing', cloneFraming(saved))
      } catch (err) {
        if (err instanceof StagePhotoError) setError(err.message)
        else setError(copy.photo.uploadFailed)
      }
    }
    closeEditor()
    return
  }

  // New / replace: commit draft, abandon prior remote, then stage.
  const previousProcessed = processed.value
  const previousPending = pending.value
  const previousStaged = staged.value

  if (previousProcessed && previousProcessed !== draft) {
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

  processed.value = draft
  framing.value = cloneFraming(next)
  emit('localReady', draft)
  emit('framing', cloneFraming(next))
  status.value = 'ready_local'
  closeEditor()

  if (props.autoStage) {
    await runStage()
  }
}

function onEditorCancel() {
  // Discard draft only; keep any previously accepted photo + framing.
  closeEditor({ revokeDraft: editorMode.value === 'new' })
  if (!processed.value) {
    status.value = 'empty'
  } else if (staged.value) {
    status.value = 'staged'
  } else {
    status.value = 'ready_local'
  }
  if (captureInput.value) captureInput.value.value = ''
  if (uploadInput.value) uploadInput.value.value = ''
}

async function runStage() {
  if (!processed.value || uploadInFlight.value) return
  if (staged.value?.status === 'staged') {
    try {
      const saved = await setPhotoFraming(staged.value.photoId, framing.value)
      framing.value = saved
      staged.value = { ...staged.value, framing: cloneFraming(saved) }
      emit('staged', staged.value)
      emit('framing', cloneFraming(saved))
      status.value = 'staged'
    } catch (err) {
      if (err instanceof StagePhotoError) setError(err.message)
      else setError(copy.photo.uploadFailed)
      status.value = 'error'
    }
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
      framing: framing.value,
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
    if (result.staged.framing) {
      framing.value = cloneFraming(result.staged.framing)
    }
    status.value = 'staged'
    progressMessage.value = null
    emit('pending', result.pending)
    emit('staged', result.staged)
    emit('framing', cloneFraming(framing.value))
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

function adjustPhoto() {
  if (props.disabled || busy.value || !processed.value) return
  editorMode.value = 'adjust'
  editorImage.value = processed.value
  editorInitialFraming.value = cloneFraming(framing.value)
  editorOpen.value = true
}

function retryUpload() {
  if (!processed.value || busy.value) return
  void runStage()
}

// Intentionally no unmount revoke: Review (and sibling claim/review screens)
// keep wizard.photoPreviewUrl after PhotoCapture unmounts. clearLocal /
// successful replace still revoke; do not abandon staged remote on unmount.

defineExpose({
  retryUpload,
  removePhoto,
  clearLocal,
  getStaged: () => staged.value,
  getProcessed: () => processed.value,
  getFraming: () => cloneFraming(framing.value),
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
        style="background: var(--theme-gradient-cool); color: var(--theme-ink)"
        data-testid="photo-upload"
        :disabled="disabled || busy"
        @click="openUpload"
      >
        {{ copy.photo.uploadPhoto }}
      </button>
    </div>

    <div
      v-else
      class="photo-capture-preview mx-auto w-full max-w-[17.5rem] overflow-hidden rounded-2xl"
      data-testid="photo-preview-wrap"
    >
      <FramedPhoto
        :src="processed.previewUrl"
        :width="processed.width"
        :height="processed.height"
        :framing="framing"
        frame-class="photo-capture-preview-photo"
        img-test-id="photo-preview"
      />
      <div
        class="photo-capture-actions px-3 py-2"
        style="background: var(--theme-gradient-cool)"
        data-testid="photo-preview-controls"
      >
        <div class="photo-capture-action-row" role="group" aria-label="Photo actions">
          <button
            type="button"
            class="photo-capture-action"
            data-testid="photo-adjust"
            :disabled="disabled || busy"
            @click="adjustPhoto"
          >
            {{ copy.photo.adjustPhoto }}
          </button>
          <span class="photo-capture-action-sep" aria-hidden="true">·</span>
          <button
            type="button"
            class="photo-capture-action"
            data-testid="photo-retake"
            :disabled="disabled || busy"
            @click="retake"
          >
            {{ copy.photo.retake }}
          </button>
          <span class="photo-capture-action-sep" aria-hidden="true">·</span>
          <button
            type="button"
            class="photo-capture-action"
            data-testid="photo-replace"
            :disabled="disabled || busy"
            @click="replacePhoto"
          >
            {{ copy.photo.replace }}
          </button>
        </div>
        <button
          type="button"
          class="photo-capture-action photo-capture-action--remove"
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

    <!-- Screen-reader / test hook only — the preview itself signals success. -->
    <p
      v-if="status === 'staged'"
      class="sr-only"
      data-testid="photo-staged-ready"
    >
      {{ copy.photo.stagedReady }}
    </p>

    <div
      v-if="errorMessage"
      class="rounded-2xl px-4 py-3 text-sm"
      style="background: var(--theme-gradient-warm); color: var(--theme-ink)"
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

    <Teleport to="body">
      <PhotoFramingEditor
        v-if="editorOpen && editorImage"
        :class="game === 'shipit' ? 'theme-ship' : 'theme-drink'"
        :src="editorImage.previewUrl"
        :width="editorImage.width"
        :height="editorImage.height"
        :initial-framing="editorInitialFraming"
        @accept="onEditorAccept"
        @cancel="onEditorCancel"
      />
    </Teleport>
  </div>
</template>
