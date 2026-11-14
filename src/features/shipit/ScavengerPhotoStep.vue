<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import PhotoCapture from '@/components/shared/PhotoCapture.vue'
import type { PhotoFraming } from '@/lib/media/framing'
import type { ProcessedImage, StagedPhotoRef } from '@/types/media'
import { copy } from '@/ui/copy'

const props = defineProps<{
  caption: string
  locked?: boolean
  focusCaption?: boolean
  hasPhoto: boolean
  restorePhoto?: {
    previewUrl: string
    width: number
    height: number
    framing?: PhotoFraming | null
    staged?: StagedPhotoRef | null
  } | null
}>()

const emit = defineEmits<{
  'update:caption': [value: string]
  continue: []
  staged: [ref: StagedPhotoRef | null]
  localReady: [image: ProcessedImage | null]
  framing: [framing: PhotoFraming | null]
  captionFocused: []
}>()

const photoBusy = ref(false)
const captionInput = ref<HTMLTextAreaElement | null>(null)

const continueLabel = computed(() =>
  photoBusy.value ? copy.wizard.photoContinueBusy : copy.shipit.continueReview,
)

const canContinue = computed(
  () => props.hasPhoto && !photoBusy.value && !props.locked,
)

function onBusy(busy: boolean) {
  photoBusy.value = busy
}

async function focusCaptionField() {
  await nextTick()
  const el = captionInput.value
  if (!el) return
  el.focus()
  const len = el.value.length
  el.setSelectionRange(len, len)
  emit('captionFocused')
}

watch(
  () => props.focusCaption,
  (want) => {
    if (want) void focusCaptionField()
  },
  { immediate: true },
)
</script>

<template>
  <section data-testid="scavenger-capture-step" class="px-4 pb-32 pt-3">
    <h2 class="wizard-prompt">
      {{ copy.wizard.photoHeading }}
    </h2>
    <p class="mt-1.5 text-sm" style="color: var(--theme-muted)" data-testid="scavenger-photo-required">
      {{ copy.shipit.photoRequired }}
    </p>

    <div class="mt-6">
      <PhotoCapture
        game="shipit"
        purpose="scavenger"
        :required="true"
        :auto-stage="true"
        :disabled="locked"
        :restore="restorePhoto"
        @staged="emit('staged', $event)"
        @local-ready="emit('localReady', $event)"
        @framing="emit('framing', $event)"
        @busy="onBusy"
      />
    </div>

    <label class="mt-7 block" style="color: var(--theme-ink)" data-testid="caption-field">
      <span class="font-display text-lg font-bold tracking-tight">
        {{ copy.wizard.captionLabel }}
      </span>
      <span class="text-sm font-medium" style="color: var(--theme-muted)">
        — {{ copy.wizard.captionOptional }}
      </span>
      <textarea
        ref="captionInput"
        :value="caption"
        rows="3"
        class="mt-2 w-full resize-none rounded-2xl bg-white px-4 py-3 text-sm font-normal shadow-sm outline-none"
        :placeholder="copy.wizard.captionPlaceholder"
        data-testid="scavenger-caption"
        :disabled="locked"
        @input="emit('update:caption', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>

    <button
      type="button"
      class="ui-primary-btn mt-5 w-full"
      data-testid="scavenger-continue-review"
      :disabled="!canContinue"
      @click="emit('continue')"
    >
      {{ continueLabel }}
    </button>
  </section>
</template>
