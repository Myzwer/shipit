<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import FramedPhoto from '@/components/shared/FramedPhoto.vue'
import PhotoFramingEditor from '@/components/shared/PhotoFramingEditor.vue'
import {
  DEFAULT_PHOTO_FRAMING,
  cloneFraming,
  type PhotoFraming,
} from '@/lib/media/framing'
import { pointsLabel } from '@/lib/bounty/tierLabels'
import { copy } from '@/ui/copy'

const props = defineProps<{
  challengeTitle: string
  locationName?: string | null
  points: number
  playerName: string
  caption: string
  photoPreviewUrl?: string | null
  photoPreviewWidth?: number | null
  photoPreviewHeight?: number | null
  photoFraming?: PhotoFraming | null
  photoStaged?: boolean
  submitting: boolean
  canSubmit: boolean
  locked?: boolean
  submitError?: string | null
  /** Authorized Daily Challenge mode from server — drives honor acknowledgment copy. */
  participationMode?: 'all_hands' | 'bring_a_friend' | null
}>()

const emit = defineEmits<{
  submit: []
  updateFraming: [framing: PhotoFraming]
  editCaption: []
}>()

const framingEditorOpen = ref(false)

const hasPhoto = computed(() => !!props.photoPreviewUrl)
const hasCaption = computed(() => !!props.caption.trim())
const captionText = computed(() => props.caption.trim())
const pointsText = computed(() => pointsLabel(props.points > 0 ? props.points : 50))
const venue = computed(() => props.locationName?.trim() || '')

const resolvedFraming = computed(() =>
  cloneFraming(props.photoFraming ?? DEFAULT_PHOTO_FRAMING),
)

const canEditFraming = computed(
  () =>
    hasPhoto.value &&
    !!props.photoPreviewWidth &&
    !!props.photoPreviewHeight &&
    !props.locked,
)

const unknownPending = computed(() => props.submitError === 'unknown')

const attestCopy = computed(() =>
  props.participationMode === 'all_hands'
    ? copy.daily.attestAllHands
    : copy.daily.attestBringFriend,
)

function openFramingEditor() {
  if (!canEditFraming.value) return
  framingEditorOpen.value = true
}

function onFramingAccept(next: PhotoFraming) {
  framingEditorOpen.value = false
  emit('updateFraming', cloneFraming(next))
}

function onFramingCancel() {
  framingEditorOpen.value = false
}
</script>

<template>
  <section data-testid="daily-review-step" class="px-4 pb-32 pt-3">
    <h2 class="wizard-prompt text-center" data-testid="daily-review-title">
      {{ copy.daily.reviewTitle }}
    </h2>

    <div class="flex justify-center">
      <p class="daily-review-points" data-testid="daily-review-points">
        {{ pointsText }}
      </p>
    </div>

    <div class="mt-5" data-testid="review-gallery-preview">
      <p class="mb-2 text-xs font-semibold uppercase tracking-wide" style="color: var(--theme-muted)">
        {{ copy.wizard.reviewPostPreview }}
      </p>

      <article class="gallery-drink-post review-gallery-preview-card">
        <div class="gallery-polaroid">
          <div class="review-gallery-photo-wrap relative" data-testid="daily-review-photo">
            <template v-if="hasPhoto">
              <FramedPhoto
                v-if="photoPreviewWidth && photoPreviewHeight"
                :src="photoPreviewUrl!"
                :width="photoPreviewWidth"
                :height="photoPreviewHeight"
                :framing="resolvedFraming"
                frame-class="gallery-polaroid-photo"
                img-test-id="review-photo-image"
              />
              <img
                v-else
                :src="photoPreviewUrl!"
                alt=""
                class="gallery-polaroid-photo"
                data-testid="review-photo-image"
              />
              <button
                v-if="canEditFraming"
                type="button"
                class="review-edit-chip"
                data-testid="review-edit-photo"
                :aria-label="copy.wizard.editPhotoFraming"
                :disabled="locked"
                @click="openFramingEditor"
              >
                <AppIcon name="action.edit" class="text-sm" />
              </button>
            </template>
            <p
              v-else
              class="gallery-polaroid-photo flex items-center justify-center px-4 text-center text-sm"
              style="color: var(--theme-muted)"
              data-testid="daily-review-photo-ready"
            >
              {{ copy.photo.stagedReady }}
            </p>
          </div>

          <div class="gallery-polaroid-meta">
            <p>
              <span class="ui-display-name" data-testid="daily-review-challenge-title">
                {{ challengeTitle }}
              </span>
              <template v-if="venue">
                <span aria-hidden="true"> · </span>
                <span class="ui-display-name" data-testid="daily-review-location">{{ venue }}</span>
              </template>
            </p>
          </div>
          <p v-if="playerName" class="gallery-polaroid-by" data-testid="daily-review-player">
            {{ playerName }}
          </p>

          <div class="review-caption-row" data-testid="review-caption-row">
            <p
              v-if="hasCaption"
              class="gallery-polaroid-caption min-w-0 flex-1"
              data-testid="review-caption"
            >
              {{ captionText }}
            </p>
            <p
              v-else
              class="min-w-0 flex-1 text-sm"
              style="color: var(--theme-muted)"
              data-testid="review-caption"
            >
              {{ copy.wizard.noCaption }}
            </p>
            <button
              v-if="hasCaption"
              type="button"
              class="review-edit-chip review-edit-chip--inline"
              data-testid="review-edit-caption"
              :aria-label="copy.wizard.editCaption"
              :disabled="locked"
              @click="emit('editCaption')"
            >
              <AppIcon name="action.edit" class="text-sm" />
            </button>
            <button
              v-else
              type="button"
              class="review-add-caption-link"
              data-testid="review-add-caption"
              :disabled="locked"
              @click="emit('editCaption')"
            >
              {{ copy.wizard.addCaptionAction }}
            </button>
          </div>

          <p
            v-if="hasPhoto && !photoStaged"
            class="mt-2 text-xs"
            style="color: var(--theme-muted)"
            data-testid="review-photo-local-note"
          >
            {{ copy.wizard.photoLocalOnlyReview }}
          </p>
        </div>
      </article>
    </div>

    <div
      v-if="unknownPending"
      class="mt-5 rounded-2xl px-4 py-3 text-sm"
      style="background: var(--theme-gradient-warm)"
      data-testid="daily-unknown"
    >
      <p class="font-semibold">{{ copy.wizard.unknownTitle }}</p>
      <p class="mt-1" style="color: var(--theme-muted)">{{ copy.wizard.unknownBody }}</p>
      <p class="mt-2 text-xs" style="color: var(--theme-muted)">{{ copy.wizard.resolveBeforeEdit }}</p>
    </div>
    <p
      v-else-if="submitError"
      class="mt-5 text-sm"
      style="color: var(--theme-ink)"
      data-testid="daily-submit-error"
    >
      {{ submitError }}
    </p>

    <p
      class="mt-5 text-sm leading-snug"
      style="color: var(--theme-muted)"
      data-testid="daily-attest-ack"
    >
      {{ attestCopy }}
    </p>

    <button
      type="button"
      class="ui-primary-btn mt-3 w-full"
      data-testid="daily-submit"
      :disabled="!canSubmit"
      @click="emit('submit')"
    >
      {{
        submitting
          ? copy.daily.submitting
          : unknownPending
            ? copy.wizard.retry
            : copy.daily.submit
      }}
      <AppIcon v-if="!submitting && !unknownPending" name="action.next" />
    </button>

    <Teleport to="body">
      <PhotoFramingEditor
        v-if="framingEditorOpen && photoPreviewUrl && photoPreviewWidth && photoPreviewHeight"
        class="theme-drink"
        :src="photoPreviewUrl"
        :width="photoPreviewWidth"
        :height="photoPreviewHeight"
        :initial-framing="resolvedFraming"
        @accept="onFramingAccept"
        @cancel="onFramingCancel"
      />
    </Teleport>
  </section>
</template>

<style scoped>
.daily-review-points {
  margin: 0.85rem auto 0;
  display: inline-flex;
  min-height: 1.7rem;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--theme-accent);
  padding: 0.22rem 0.95rem;
  color: #fff;
  font-size: 0.82rem;
  font-weight: 700;
  line-height: 1;
}
</style>
