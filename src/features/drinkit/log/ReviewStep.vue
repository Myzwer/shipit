<script setup lang="ts">
import { computed } from 'vue'
import { copy, formatCopy } from '@/ui/copy'
import type { PreviewPayload, SelectedClaimChoice } from '@/types/drinkLog'

const props = defineProps<{
  drinkName: string
  barName: string
  companionNames: string[]
  caption: string
  photoPreviewUrl?: string | null
  photoStaged?: boolean
  preview: PreviewPayload | null
  previewStatus: 'idle' | 'loading' | 'ready' | 'error'
  selectedClaims: SelectedClaimChoice[]
  submitting: boolean
  showIngredientMismatchLink: boolean
}>()

const emit = defineEmits<{
  toggleClaim: [category: 'cocktail' | 'ingredient' | 'bar']
  submit: []
  retryPreview: []
  openIngredientConfirm: []
}>()

const withLabel = computed(() =>
  props.companionNames.length ? props.companionNames.join(', ') : copy.wizard.justMe,
)

const captionLabel = computed(() =>
  props.caption.trim() ? props.caption.trim() : copy.wizard.noCaption,
)

function rowState(category: 'cocktail' | 'ingredient' | 'bar') {
  const state = props.preview?.categories?.[category]
  if (!state) return { kind: 'unavailable' as const, points: 0, label: copy.wizard.unavailable }
  if (state.status === 'already_claimed') {
    return { kind: 'already_claimed' as const, points: 0, label: copy.wizard.alreadyClaimed }
  }
  if (state.status !== 'eligible') {
    return { kind: 'unavailable' as const, points: 0, label: copy.wizard.unavailable }
  }
  const selected = props.selectedClaims.find((c) => c.category === category)
  const points = selected?.points ?? (Number(state.options?.[0]?.points) || 0)
  if (selected) {
    return { kind: 'selected' as const, points, label: copy.wizard.selected }
  }
  return { kind: 'available' as const, points, label: copy.wizard.available }
}

const categories = [
  { id: 'cocktail' as const, title: copy.bounty.cocktail },
  { id: 'ingredient' as const, title: copy.bounty.ingredient },
  { id: 'bar' as const, title: copy.bounty.bar },
]
</script>

<template>
  <section data-testid="wizard-review-step" class="px-4 pb-44">
    <h2 class="font-display text-xl font-bold" style="color: var(--theme-ink)">
      {{ copy.wizard.reviewTitle }}
    </h2>

    <dl class="mt-4 space-y-3 text-sm" style="color: var(--theme-ink)">
      <div class="rounded-2xl px-4 py-3" style="background: var(--theme-card)">
        <dt class="text-xs uppercase tracking-wide" style="color: var(--theme-muted)">
          {{ copy.wizard.labelDrink }}
        </dt>
        <dd class="mt-1 font-semibold" data-testid="review-drink">{{ drinkName }}</dd>
      </div>
      <div class="rounded-2xl px-4 py-3" style="background: var(--theme-card)">
        <dt class="text-xs uppercase tracking-wide" style="color: var(--theme-muted)">
          {{ copy.wizard.labelBar }}
        </dt>
        <dd class="mt-1 font-semibold" data-testid="review-bar">{{ barName }}</dd>
      </div>
      <div class="rounded-2xl px-4 py-3" style="background: var(--theme-card)">
        <dt class="text-xs uppercase tracking-wide" style="color: var(--theme-muted)">
          {{ copy.wizard.labelWith }}
        </dt>
        <dd class="mt-1 font-semibold" data-testid="review-companions">{{ withLabel }}</dd>
      </div>
      <div class="rounded-2xl px-4 py-3" style="background: var(--theme-card)">
        <dt class="text-xs uppercase tracking-wide" style="color: var(--theme-muted)">
          {{ copy.wizard.labelPhoto }}
        </dt>
        <dd class="mt-2">
          <div v-if="photoPreviewUrl" class="max-w-[160px]" data-testid="review-photo-preview">
            <img
              :src="photoPreviewUrl"
              alt=""
              class="aspect-square w-full rounded-xl object-cover"
            />
            <p class="mt-1 text-xs" style="color: var(--theme-muted)">
              {{
                photoStaged ? copy.wizard.photoStagedReview : copy.wizard.photoLocalOnlyReview
              }}
            </p>
          </div>
          <div
            v-else
            class="flex aspect-square w-full max-w-[160px] items-center justify-center rounded-xl text-center text-xs font-semibold uppercase tracking-wide text-white"
            style="background: var(--theme-header)"
            data-testid="review-photo-placeholder"
          >
            {{ copy.wizard.noPhoto }}
          </div>
        </dd>
      </div>
      <div class="rounded-2xl px-4 py-3" style="background: var(--theme-card)">
        <dt class="text-xs uppercase tracking-wide" style="color: var(--theme-muted)">
          {{ copy.wizard.labelCaption }}
        </dt>
        <dd class="mt-1" data-testid="review-caption">{{ captionLabel }}</dd>
      </div>
    </dl>

    <h3 class="mt-6 font-display text-lg font-bold" style="color: var(--theme-ink)">
      {{ copy.wizard.yourBounties }}
    </h3>

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
          class="flex min-h-[4.25rem] w-full items-stretch overflow-hidden text-left transition disabled:opacity-55"
          :style="{
            background:
              rowState(cat.id).kind === 'unavailable' || rowState(cat.id).kind === 'already_claimed'
                ? 'color-mix(in srgb, var(--theme-surface) 55%, var(--theme-card))'
                : 'var(--theme-card)',
            color: 'var(--theme-ink)',
            borderRadius: 'var(--theme-card-radius)',
            boxShadow: 'var(--theme-card-shadow)',
            opacity:
              rowState(cat.id).kind === 'unavailable' || rowState(cat.id).kind === 'already_claimed'
                ? 0.72
                : 1,
          }"
          :disabled="rowState(cat.id).kind === 'unavailable' || rowState(cat.id).kind === 'already_claimed'"
          :data-testid="`bounty-row-${cat.id}`"
          :data-state="rowState(cat.id).kind"
          @click="emit('toggleClaim', cat.id)"
        >
          <span
            class="flex w-11 shrink-0 items-center justify-center"
            :style="{
              background:
                rowState(cat.id).kind === 'selected' ? 'var(--theme-accent)' : 'transparent',
              color:
                rowState(cat.id).kind === 'selected' ? '#fff' : 'var(--theme-muted)',
            }"
            aria-hidden="true"
          >
            <span
              class="flex h-6 w-6 items-center justify-center rounded-md border-2 text-xs font-bold"
              :style="{
                borderColor:
                  rowState(cat.id).kind === 'selected'
                    ? 'rgba(255,255,255,0.85)'
                    : 'color-mix(in srgb, var(--theme-ink) 35%, transparent)',
              }"
            >
              <span v-if="rowState(cat.id).kind === 'selected'">✓</span>
            </span>
          </span>
          <div class="flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-3.5">
            <div class="min-w-0">
              <p
                v-if="rowState(cat.id).kind === 'selected' || rowState(cat.id).kind === 'available'"
                class="text-[0.65rem] font-semibold uppercase tracking-[0.12em]"
                style="color: var(--theme-muted)"
              >
                {{ rowState(cat.id).label }}
              </p>
              <p
                class="font-semibold leading-snug"
                :class="
                  rowState(cat.id).kind === 'selected' || rowState(cat.id).kind === 'available'
                    ? 'mt-0.5'
                    : undefined
                "
                :style="
                  rowState(cat.id).kind === 'unavailable' ||
                  rowState(cat.id).kind === 'already_claimed'
                    ? { color: 'var(--theme-muted)' }
                    : undefined
                "
              >
                {{ cat.title }}
              </p>
              <p
                v-if="rowState(cat.id).kind === 'selected'"
                class="mt-1 text-xs"
                style="color: var(--theme-muted)"
              >
                {{ copy.wizard.tapToDeselect }}
              </p>
            </div>
            <span
              v-if="rowState(cat.id).points"
              class="shrink-0 rounded-full px-3 py-1 text-xs font-semibold text-white"
              style="background: var(--theme-accent)"
            >
              {{
                formatCopy(copy.home.pointsLabel, { points: rowState(cat.id).points })
              }}
            </span>
            <span
              v-else
              class="shrink-0 text-sm font-medium"
              style="color: var(--theme-muted)"
            >
              {{ rowState(cat.id).label }}
            </span>
          </div>
        </button>
      </li>
    </ul>

    <p
      v-if="showIngredientMismatchLink"
      class="mt-5 text-center text-sm"
      style="color: var(--theme-muted)"
    >
      <button
        type="button"
        class="font-medium underline underline-offset-2"
        style="color: var(--theme-primary)"
        data-testid="ingredient-mismatch-link"
        @click="emit('openIngredientConfirm')"
      >
        {{ copy.wizard.ingredientMismatchLink }}
      </button>
    </p>

    <div
      class="pointer-events-none fixed inset-x-0 z-40 px-4 pt-3"
      style="bottom: calc(5.5rem + env(safe-area-inset-bottom)); background: linear-gradient(transparent, var(--theme-page) 35%)"
    >
      <button
        type="button"
        class="pointer-events-auto mx-auto flex w-full max-w-lg items-center justify-center rounded-full py-3 text-sm font-semibold text-white disabled:opacity-60"
        style="background: var(--theme-primary)"
        data-testid="submit-drink"
        :disabled="submitting || previewStatus !== 'ready'"
        @click="emit('submit')"
      >
        {{ submitting ? copy.wizard.submitting : copy.wizard.submitDrink }}
      </button>
    </div>
  </section>
</template>
