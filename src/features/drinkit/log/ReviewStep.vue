<script setup lang="ts">
import { computed } from 'vue'
import { copy } from '@/ui/copy'
import type { PreviewPayload, SelectedClaimChoice } from '@/types/drinkLog'

const props = defineProps<{
  drinkName: string
  barName: string
  companionNames: string[]
  caption: string
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
          <div
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

    <ul v-else class="mt-3 space-y-2" data-testid="review-bounties">
      <li v-for="cat in categories" :key="cat.id">
        <button
          type="button"
          class="flex w-full items-center justify-between rounded-2xl px-4 py-4 text-left disabled:opacity-60"
          :style="
            rowState(cat.id).kind === 'selected'
              ? { background: 'var(--theme-primary)', color: '#fff' }
              : { background: 'var(--theme-card)', color: 'var(--theme-ink)' }
          "
          :disabled="rowState(cat.id).kind === 'unavailable' || rowState(cat.id).kind === 'already_claimed'"
          :data-testid="`bounty-row-${cat.id}`"
          :data-state="rowState(cat.id).kind"
          @click="emit('toggleClaim', cat.id)"
        >
          <div>
            <p class="text-xs font-semibold uppercase tracking-wide">{{ rowState(cat.id).label }}</p>
            <p class="mt-1 font-semibold">{{ cat.title }}</p>
            <p
              v-if="rowState(cat.id).kind === 'selected'"
              class="mt-1 text-xs opacity-90"
            >
              {{ copy.wizard.tapToDeselect }}
            </p>
          </div>
          <p v-if="rowState(cat.id).points" class="font-display text-lg font-bold tabular-nums">
            {{ rowState(cat.id).points }}
          </p>
        </button>
      </li>
    </ul>

    <p v-if="showIngredientMismatchLink" class="mt-4 text-center text-xs" style="color: var(--theme-muted)">
      <button
        type="button"
        class="underline"
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
