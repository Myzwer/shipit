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
import { resolveShipItChallengeIcon } from '@/lib/shipit/challengeIcons'
import { SHIPIT_CATEGORY_OPTIONS } from '@/lib/shipit/api'
import type { ShipItChallengeCard } from '@/types/shipit'
import { copy, formatCopy } from '@/ui/copy'
import type { SemanticIconKey } from '@/ui/icons'

const props = defineProps<{
  challenge: ShipItChallengeCard
  playerName: string
  teamName: string
  caption: string
  photoPreviewUrl?: string | null
  photoPreviewWidth?: number | null
  photoPreviewHeight?: number | null
  photoFraming?: PhotoFraming | null
  photoStaged?: boolean
  submitting: boolean
  locked?: boolean
  submitError?: string | null
  canSubmit?: boolean
}>()

const emit = defineEmits<{
  submit: []
  retry: []
  updateFraming: [framing: PhotoFraming]
  editCaption: []
  editPhoto: []
}>()

const framingEditorOpen = ref(false)

const hasPhoto = computed(() => !!props.photoPreviewUrl)
const hasCaption = computed(() => !!props.caption.trim())
const captionText = computed(() => props.caption.trim())

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

const challengeIcon = computed<SemanticIconKey>(
  () => resolveShipItChallengeIcon(props.challenge.canonical_key).icon_key,
)

const categoryLabel = computed(() => {
  const match = SHIPIT_CATEGORY_OPTIONS.find((o) => o.value === props.challenge.category)
  return match?.label ?? props.challenge.category
})

const unknownPending = computed(() => props.submitError === 'unknown')

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
  <section data-testid="scavenger-review-step" class="px-4 pb-32 pt-3">
    <h2 class="wizard-prompt">
      {{ copy.wizard.reviewTitle }}
    </h2>

    <div class="mt-5" data-testid="review-gallery-preview">
      <p class="mb-2 text-xs font-semibold uppercase tracking-wide" style="color: var(--theme-muted)">
        {{ copy.wizard.reviewPostPreview }}
      </p>

      <article class="gallery-drink-post review-gallery-preview-card">
        <div class="gallery-polaroid">
          <div class="review-gallery-photo-wrap relative" data-testid="scavenger-review-photo">
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
              data-testid="scavenger-review-photo-ready"
            >
              {{ copy.photo.stagedReady }}
            </p>
          </div>

          <div class="gallery-polaroid-meta">
            <p>
              <span class="ui-display-name" data-testid="review-preview-challenge">
                {{ challenge.title }}
              </span>
            </p>
          </div>
          <p
            v-if="playerName || teamName"
            class="gallery-polaroid-by"
            data-testid="scavenger-review-team"
          >
            <template v-if="playerName && teamName">{{ playerName }} · {{ teamName }}</template>
            <template v-else>{{ playerName || teamName }}</template>
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

    <h3
      class="font-display mt-6 text-center text-[1.65rem] font-bold"
      style="color: var(--theme-ink)"
      data-testid="selected-challenge-heading"
    >
      {{ copy.shipit.selectedChallenge }}
    </h3>

    <div
      class="challenge-card challenge-card--available mt-3 flex w-full items-center gap-3 px-3 py-2.5 text-left"
      data-testid="selected-challenge-card"
      role="group"
      :aria-label="copy.shipit.selectedChallenge"
    >
      <span
        class="challenge-card__icon challenge-card__icon--available flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
        :data-challenge-icon="challengeIcon"
        aria-hidden="true"
      >
        <AppIcon :name="challengeIcon" style-variant="solid" class="text-[0.85rem]" />
      </span>
      <span class="challenge-card__body min-w-0 flex-1">
        <span class="challenge-card__title block text-[0.98rem] font-bold leading-snug">
          {{ challenge.title }}
        </span>
        <span class="challenge-card__desc mt-0.5 block text-[0.82rem] leading-snug">
          {{ challenge.instructions }}
        </span>
        <span
          class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.75rem] font-semibold"
          style="color: var(--theme-primary)"
        >
          <span data-testid="selected-challenge-category">{{ categoryLabel }}</span>
          <span aria-hidden="true">·</span>
          <span data-testid="scavenger-review-points">
            {{ formatCopy(copy.shipit.pointsLabel, { points: challenge.points }) }}
          </span>
        </span>
      </span>
    </div>

    <p
      class="mt-2.5 text-center text-sm leading-snug"
      style="color: var(--theme-muted)"
      data-testid="team-wide-completion-note"
    >
      {{ copy.shipit.teamWideCompletion }}
    </p>

    <div
      v-if="unknownPending"
      class="mt-5 rounded-2xl px-4 py-3 text-sm"
      style="background: var(--theme-gradient-warm)"
      data-testid="scavenger-unknown"
    >
      <p class="font-semibold">{{ copy.wizard.unknownTitle }}</p>
      <p class="mt-1" style="color: var(--theme-muted)">{{ copy.wizard.unknownBody }}</p>
      <p class="mt-2 text-xs" style="color: var(--theme-muted)">{{ copy.wizard.resolveBeforeEdit }}</p>
    </div>
    <p
      v-else-if="submitError"
      class="mt-5 text-sm"
      style="color: var(--theme-ink)"
      data-testid="scavenger-submit-error"
    >
      {{ submitError }}
    </p>

    <button
      type="button"
      class="ui-primary-btn mt-5 w-full"
      data-testid="scavenger-submit"
      :disabled="submitting || (unknownPending ? false : !canSubmit)"
      @click="unknownPending ? emit('retry') : emit('submit')"
    >
      {{
        submitting
          ? copy.shipit.submitting
          : unknownPending
            ? copy.wizard.retry
            : copy.shipit.submit
      }}
      <AppIcon v-if="!submitting && !unknownPending" name="action.next" />
    </button>

    <button
      v-if="!locked || !unknownPending"
      type="button"
      class="mt-3 w-full text-sm font-semibold underline"
      style="color: var(--theme-primary)"
      data-testid="scavenger-edit"
      @click="emit('editPhoto')"
    >
      {{ copy.shipit.editPhoto }}
    </button>

    <Teleport to="body">
      <PhotoFramingEditor
        v-if="framingEditorOpen && photoPreviewUrl && photoPreviewWidth && photoPreviewHeight"
        class="theme-ship"
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
.challenge-card {
  min-height: 2.85rem;
  border-radius: var(--theme-card-radius, 1.15rem);
  box-shadow: var(--theme-card-shadow, var(--shadow-card));
  color: var(--theme-ink);
}

.challenge-card--available {
  background: var(--theme-gradient-cool);
}

.challenge-card__icon--available {
  background: color-mix(in srgb, var(--theme-primary) 16%, transparent);
  color: var(--theme-primary);
}

.challenge-card__title {
  color: var(--theme-ink);
}

.challenge-card__desc {
  color: var(--theme-muted);
}
</style>
