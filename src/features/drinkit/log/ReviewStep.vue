<script setup lang="ts">
import { computed, ref } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import FramedPhoto from '@/components/shared/FramedPhoto.vue'
import PhotoFramingEditor from '@/components/shared/PhotoFramingEditor.vue'
import { eligibilityReasonLabel } from '@/lib/drinkLog/eligibilityCopy'
import {
  DEFAULT_PHOTO_FRAMING,
  cloneFraming,
  type PhotoFraming,
} from '@/lib/media/framing'
import { copy, formatCopy } from '@/ui/copy'
import type { PreviewPayload, SelectedClaimChoice } from '@/types/drinkLog'
import noImageUrl from '@/assets/gallery/no_image.jpg'

const props = defineProps<{
  drinkName: string
  barName: string
  companionNames: string[]
  playerName: string
  caption: string
  photoPreviewUrl?: string | null
  photoPreviewWidth?: number | null
  photoPreviewHeight?: number | null
  photoFraming?: PhotoFraming | null
  photoStaged?: boolean
  preview: PreviewPayload | null
  previewStatus: 'idle' | 'loading' | 'ready' | 'error'
  selectedClaims: SelectedClaimChoice[]
  submitting: boolean
  showIngredientMismatchLink: boolean
  /** When true, photo framing edits are locked (pending unknown submit). */
  locked?: boolean
}>()

const emit = defineEmits<{
  toggleClaim: [category: 'cocktail' | 'ingredient' | 'bar']
  submit: []
  retryPreview: []
  openIngredientConfirm: []
  updateFraming: [framing: PhotoFraming]
  editCaption: []
  addPhoto: []
}>()

const framingEditorOpen = ref(false)

const withLabel = computed(() =>
  props.companionNames.length ? props.companionNames.join(', ') : copy.wizard.justMe,
)

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

function rowState(category: 'cocktail' | 'ingredient' | 'bar') {
  const state = props.preview?.categories?.[category]
  if (!state) {
    return {
      kind: 'unavailable' as const,
      points: 0,
      label: copy.wizard.unavailable,
      reason: copy.wizard.reasonGenericUnavailable,
    }
  }
  if (state.status === 'already_claimed') {
    return {
      kind: 'already_claimed' as const,
      points: 0,
      label: copy.wizard.alreadyClaimed,
      reason: eligibilityReasonLabel(state.reason ?? 'category_used_today'),
    }
  }
  if (state.status !== 'eligible') {
    return {
      kind: 'unavailable' as const,
      points: 0,
      label: copy.wizard.unavailable,
      reason: eligibilityReasonLabel(state.reason),
    }
  }
  const selected = props.selectedClaims.find((c) => c.category === category)
  const points = selected?.points ?? (Number(state.options?.[0]?.points) || 0)
  if (selected) {
    return { kind: 'selected' as const, points, label: copy.wizard.selected, reason: null }
  }
  return { kind: 'available' as const, points, label: copy.wizard.available, reason: null }
}

const claimsNeedPhoto = computed(
  () => props.selectedClaims.length > 0 && !props.photoStaged,
)

const canSubmit = computed(
  () => !props.submitting && props.previewStatus === 'ready' && !claimsNeedPhoto.value,
)

const categories = [
  { id: 'cocktail' as const, title: copy.bounty.cocktail },
  { id: 'ingredient' as const, title: copy.bounty.ingredient },
  { id: 'bar' as const, title: copy.bounty.bar },
]

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
  <section data-testid="wizard-review-step" class="px-4 pb-32 pt-3">
    <h2 class="wizard-prompt">
      {{ copy.wizard.reviewTitle }}
    </h2>

    <ul class="wizard-summary">
      <li>
        <AppIcon name="theme.drink-it" class="mt-0.5 shrink-0" />
        <span class="ui-display-name" data-testid="review-drink">{{ drinkName }}</span>
      </li>
      <li>
        <AppIcon name="score.bar" class="mt-0.5 shrink-0" />
        <span class="ui-display-name" data-testid="review-bar">{{ barName }}</span>
      </li>
      <li>
        <AppIcon name="score.friends" class="mt-0.5 shrink-0" />
        <span data-testid="review-companions">{{ withLabel }}</span>
      </li>
    </ul>

    <div class="mt-5" data-testid="review-gallery-preview">
      <p class="mb-2 text-xs font-semibold uppercase tracking-wide" style="color: var(--theme-muted)">
        {{ copy.wizard.reviewPostPreview }}
      </p>

      <article class="gallery-drink-post review-gallery-preview-card">
        <div class="gallery-polaroid">
          <div class="review-gallery-photo-wrap relative" data-testid="review-photo-preview">
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
            <template v-else>
              <img
                :src="noImageUrl"
                class="gallery-polaroid-photo"
                :alt="copy.wizard.noPhoto"
                data-testid="review-photo-placeholder"
              />
              <button
                type="button"
                class="review-add-photo-link"
                data-testid="review-add-photo"
                :disabled="locked"
                @click="emit('addPhoto')"
              >
                {{ copy.wizard.addPhotoAction }}
              </button>
            </template>
          </div>

          <div class="gallery-polaroid-meta">
            <p>
              <span class="ui-display-name" data-testid="review-preview-drink">{{ drinkName }}</span>
              <template v-if="barName">
                <span aria-hidden="true"> · </span>
                <span class="ui-display-name" data-testid="review-preview-bar">{{ barName }}</span>
              </template>
            </p>
          </div>
          <p v-if="playerName" class="gallery-polaroid-by" data-testid="review-preview-player">
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

    <h3 class="font-display mt-6 text-center text-[1.65rem] font-bold" style="color: var(--theme-ink)">
      {{ copy.wizard.yourBounties }}
    </h3>

    <p v-if="showIngredientMismatchLink" class="mt-1 text-center text-sm">
      <button
        type="button"
        class="underline underline-offset-2"
        style="color: var(--theme-ink)"
        data-testid="ingredient-mismatch-link"
        @click="emit('openIngredientConfirm')"
      >
        {{ copy.wizard.ingredientMismatchLink }}
      </button>
    </p>

    <p v-if="previewStatus === 'loading'" class="mt-3 text-sm" style="color: var(--theme-muted)">
      Loading…
    </p>
    <div v-else-if="previewStatus === 'error'" class="mt-3">
      <p class="text-sm" style="color: var(--theme-ink)">{{ copy.bounty.unavailableDetail }}</p>
      <button
        type="button"
        class="mt-2 text-sm font-semibold underline"
        style="color: var(--theme-primary)"
        data-testid="preview-retry"
        @click="emit('retryPreview')"
      >
        {{ copy.wizard.retry }}
      </button>
    </div>

    <ul v-else class="mt-3 space-y-2.5" data-testid="review-bounties">
      <li v-for="cat in categories" :key="cat.id">
        <button
          type="button"
          class="wizard-bounty"
          :class="
            rowState(cat.id).kind === 'unavailable' || rowState(cat.id).kind === 'already_claimed'
              ? 'is-muted'
              : ''
          "
          :disabled="rowState(cat.id).kind === 'unavailable' || rowState(cat.id).kind === 'already_claimed'"
          :data-testid="`bounty-row-${cat.id}`"
          :data-state="rowState(cat.id).kind"
          :aria-description="rowState(cat.id).reason || undefined"
          @click="emit('toggleClaim', cat.id)"
        >
          <span v-if="rowState(cat.id).kind === 'selected'" class="wizard-bounty-rail">
            <AppIcon name="status.selected" style-variant="solid" />
            <span>{{ rowState(cat.id).label }}</span>
          </span>
          <span class="wizard-bounty-main">
            <span class="flex min-w-0 items-center gap-2">
              <AppIcon
                v-if="rowState(cat.id).kind !== 'selected'"
                :name="rowState(cat.id).kind === 'available' ? 'status.unselected' : 'status.completed'"
                class="shrink-0 text-lg"
              />
              <span class="min-w-0">
                <span class="block font-semibold leading-snug">{{ cat.title }}</span>
                <span
                  v-if="rowState(cat.id).reason"
                  class="mt-0.5 block text-sm font-medium leading-snug"
                  style="color: var(--theme-muted)"
                  data-testid="bounty-row-reason"
                >
                  {{ rowState(cat.id).reason }}
                </span>
                <span v-if="rowState(cat.id).kind === 'selected'" class="sr-only">
                  {{ copy.wizard.tapToDeselect }}
                </span>
              </span>
            </span>
            <span v-if="rowState(cat.id).points" class="wizard-points">
              {{ formatCopy(copy.home.pointsLabel, { points: rowState(cat.id).points }) }}
            </span>
            <span v-else class="shrink-0 text-sm font-medium">
              {{ rowState(cat.id).label }}
            </span>
          </span>
        </button>
      </li>
    </ul>

    <p
      v-if="claimsNeedPhoto"
      class="mt-4 rounded-2xl px-4 py-3 text-sm font-medium leading-snug"
      style="background: var(--theme-gradient-warm); color: var(--theme-ink)"
      role="status"
      data-testid="review-photo-required"
    >
      {{ copy.wizard.photoRequiredForClaim }}
      <button
        type="button"
        class="mt-2 block font-semibold underline underline-offset-2"
        style="color: var(--theme-primary)"
        data-testid="review-add-photo"
        @click="emit('addPhoto')"
      >
        {{ copy.wizard.addPhotoAction }}
      </button>
    </p>

    <button
      type="button"
      class="ui-primary-btn mt-5 w-full"
      data-testid="submit-drink"
      :disabled="!canSubmit"
      @click="emit('submit')"
    >
      {{ submitting ? copy.wizard.submitting : copy.wizard.submitDrink }}
      <AppIcon v-if="!submitting" name="action.next" />
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
