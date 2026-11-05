<script setup lang="ts">
import { computed, ref } from 'vue'
import PhotoCapture from '@/components/shared/PhotoCapture.vue'
import type { ProcessedImage, StagedPhotoRef } from '@/types/media'
import { copy } from '@/ui/copy'

defineProps<{
  caption: string
}>()

const emit = defineEmits<{
  'update:caption': [value: string]
  continue: []
  staged: [ref: StagedPhotoRef | null]
  localReady: [image: ProcessedImage | null]
}>()

const photoBusy = ref(false)
const hasLocal = ref(false)
const hasStaged = ref(false)

const continueLabel = computed(() =>
  photoBusy.value ? copy.wizard.photoContinueBusy : copy.wizard.photoContinue,
)

const canContinue = computed(() => !photoBusy.value)

function onStaged(ref: StagedPhotoRef | null) {
  hasStaged.value = !!ref
  emit('staged', ref)
}

function onLocal(image: ProcessedImage | null) {
  hasLocal.value = !!image
  emit('localReady', image)
}

function onBusy(busy: boolean) {
  photoBusy.value = busy
}
</script>

<template>
  <section data-testid="wizard-photo-step" class="px-4 pb-28">
    <h2 class="font-display text-xl font-bold" style="color: var(--theme-ink)">
      {{ copy.wizard.photoHeading }}
    </h2>
    <p class="mt-2 text-sm" style="color: var(--theme-muted)">{{ copy.wizard.photoOptional }}</p>

    <div class="mt-6">
      <PhotoCapture
        game="drinkit"
        purpose="drink_log"
        :required="false"
        :auto-stage="true"
        @staged="onStaged"
        @local-ready="onLocal"
        @busy="onBusy"
      />
    </div>

    <p
      v-if="hasStaged"
      class="mt-4 text-sm"
      style="color: var(--theme-muted)"
      data-testid="photo-attach-deferred-note"
    >
      {{ copy.wizard.photoStagedNote }}
    </p>

    <label class="mt-6 block text-sm font-semibold" style="color: var(--theme-ink)">
      {{ copy.wizard.captionLabel }}
      <textarea
        :value="caption"
        rows="3"
        class="mt-1 w-full resize-none rounded-2xl px-4 py-3 font-normal outline-none"
        style="background: var(--theme-card)"
        :placeholder="copy.wizard.captionPlaceholder"
        data-testid="caption-input"
        @input="emit('update:caption', ($event.target as HTMLTextAreaElement).value)"
      />
    </label>

    <button
      type="button"
      class="mt-6 w-full rounded-full py-3 text-sm font-semibold text-white disabled:opacity-60"
      style="background: var(--theme-primary)"
      data-testid="photo-continue"
      :disabled="!canContinue"
      @click="emit('continue')"
    >
      {{ continueLabel }}
    </button>

    <!-- Optional skip path remains: continue with no photo. -->
    <p
      v-if="!hasLocal && !hasStaged"
      class="mt-2 text-center text-xs"
      style="color: var(--theme-muted)"
      data-testid="photo-optional-skip"
    >
      {{ copy.wizard.photoOptional }}
    </p>
  </section>
</template>
