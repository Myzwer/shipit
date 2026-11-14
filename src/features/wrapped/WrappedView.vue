<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AccountSection from '@/components/shared/AccountSection.vue'
import GameShell from '@/components/shared/GameShell.vue'
import PhotoViewer from '@/features/gallery/PhotoViewer.vue'
import WrappedAllStatsSection from '@/features/wrapped/WrappedAllStatsSection.vue'
import WrappedFeatureCarousel from '@/features/wrapped/WrappedFeatureCarousel.vue'
import WrappedLeaderboardSection from '@/features/wrapped/WrappedLeaderboardSection.vue'
import { fetchMyWrapped, revealMyWrapped, WrappedApiError } from '@/lib/wrapped/api'
import {
  buildDrinkItFeatureSlides,
  buildShipItFeatureSlides,
} from '@/lib/wrapped/buildFeatureSlides'
import { buildWrappedIntroSlide } from '@/lib/wrapped/buildIntroSlide'
import { inventoryIdsForGame } from '@/lib/wrapped/inventory'
import {
  buildPhotoHighlights,
  fetchGalleryEventsWithMeta,
  type WrappedPhotoHighlight,
} from '@/lib/wrapped/photoHighlights'
import { useAwardsModeStore } from '@/stores/awardsMode'
import { copy } from '@/ui/copy'
import type { GameId } from '@/types/game'
import type { WrappedPayload } from '@/types/wrapped'
import type { WrappedFeatureSlide } from '@/types/wrappedPlanC'

const props = defineProps<{
  game: GameId
}>()

const router = useRouter()
const awardsMode = useAwardsModeStore()

const status = ref<'loading' | 'ready' | 'error' | 'not_available'>('loading')
const errorMessage = ref<string | null>(null)
const payload = ref<WrappedPayload | null>(null)
const justRevealed = ref(false)
const preferReducedMotion = ref(false)
const photoHighlights = ref<WrappedPhotoHighlight[]>([])
const photoPoolComplete = ref(true)
const photosLoading = ref(false)
const viewer = ref<{ url: string; photoId: string } | null>(null)

const sections = computed(() => payload.value?.sections ?? null)

const inventoryMismatch = computed(() => {
  if (!sections.value) return false
  const expected = inventoryIdsForGame(props.game)
  const got = [
    ...sections.value.personal.map((e) => e.spec_id),
    ...sections.value.global.map((e) => e.spec_id),
    ...sections.value.collective.map((e) => e.spec_id),
  ]
  return expected.length !== got.length || expected.some((id, i) => id !== got[i])
})

const featureSlides = computed<WrappedFeatureSlide[]>(() => {
  if (!sections.value) return []
  const opts = { photoPoolComplete: photoPoolComplete.value }
  const stories =
    props.game === 'drinkit'
      ? buildDrinkItFeatureSlides(sections.value, photoHighlights.value, opts)
      : buildShipItFeatureSlides(sections.value, photoHighlights.value, opts)
  // Intro is always first; story eligibility / tone alternation stay unchanged.
  return [buildWrappedIntroSlide(), ...stories]
})

const leaderboardSource = computed(() => payload.value?.leaderboard ?? [])

async function loadPhotos() {
  photosLoading.value = true
  try {
    const result = await fetchGalleryEventsWithMeta(props.game)
    photoHighlights.value = buildPhotoHighlights(result.events)
    photoPoolComplete.value = !result.truncated
  } catch {
    photoHighlights.value = []
    photoPoolComplete.value = false
  } finally {
    photosLoading.value = false
  }
}

/** Persist reveal without blocking the carousel (replaces the old start gate). */
async function ensureRevealed(alreadyRevealed: boolean) {
  if (alreadyRevealed) return
  try {
    const res = await revealMyWrapped(props.game)
    if (res.ok && payload.value) {
      payload.value = {
        ...payload.value,
        revealed: true,
        revealed_at_utc: res.revealed_at_utc ?? payload.value.revealed_at_utc,
      }
    }
  } catch {
    // Results still render; reveal can retry on next visit.
  }
}

async function load() {
  status.value = 'loading'
  errorMessage.value = null
  try {
    await awardsMode.refresh()
    if (!awardsMode.isAwardsMode) {
      status.value = 'not_available'
      return
    }
    const res = await fetchMyWrapped(props.game)
    if (!res.ok) {
      if (res.code === 'WRAPPED_NOT_AVAILABLE') {
        status.value = 'not_available'
        return
      }
      if (res.code === 'GAME_MEMBERSHIP_REQUIRED') {
        void router.replace({
          name: 'access-denied',
          query: { game: props.game },
        })
        return
      }
      status.value = 'error'
      errorMessage.value = res.message ?? res.code ?? copy.wrapped.loadFailed
      return
    }
    payload.value = res
    status.value = 'ready'
    if (!res.revealed) justRevealed.value = true
    void ensureRevealed(Boolean(res.revealed))
    void loadPhotos()
  } catch (err) {
    status.value = 'error'
    errorMessage.value =
      err instanceof WrappedApiError ? err.message : copy.wrapped.loadFailed
  }
}

onMounted(() => {
  preferReducedMotion.value = window.matchMedia(
    '(prefers-reduced-motion: reduce)',
  ).matches
  awardsMode.ensureStarted()
  void load()
})

watch(
  () => props.game,
  () => {
    justRevealed.value = false
    photoHighlights.value = []
    photoPoolComplete.value = true
    viewer.value = null
    void load()
  },
)
</script>

<template>
  <GameShell
    :game="game"
    :title="copy.wrapped.heading"
    :show-ship-time="false"
    :content-inset="false"
  >
    <div
      v-if="status === 'loading'"
      class="px-4 py-16 text-center text-sm"
      style="color: var(--theme-muted)"
      data-testid="wrapped-loading"
    >
      {{ copy.wrapped.loading }}
    </div>

    <div
      v-else-if="status === 'not_available'"
      class="mx-4 mt-8 rounded-2xl px-4 py-6 text-center"
      style="background: var(--theme-gradient-warm); color: var(--theme-ink)"
      data-testid="wrapped-not-available"
    >
      <p class="font-semibold">{{ copy.wrapped.notAvailableTitle }}</p>
      <p class="mt-2 text-sm" style="color: var(--theme-muted)">
        {{ copy.wrapped.notAvailableDetail }}
      </p>
      <button
        type="button"
        class="mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white"
        style="background: var(--theme-primary)"
        @click="router.push(game === 'drinkit' ? '/drinkit' : '/shipit')"
      >
        {{ copy.wrapped.backToGame }}
      </button>
    </div>

    <div
      v-else-if="status === 'error'"
      class="mx-4 mt-8 rounded-2xl px-4 py-6 text-center"
      style="background: var(--theme-gradient-warm); color: var(--theme-ink)"
      data-testid="wrapped-error"
    >
      <p class="font-semibold">{{ copy.wrapped.unavailableTitle }}</p>
      <p class="mt-2 text-sm" style="color: var(--theme-muted)">
        {{ errorMessage || copy.wrapped.loadFailed }}
      </p>
      <button
        type="button"
        class="mt-4 rounded-full px-4 py-2 text-sm font-semibold text-white"
        style="background: var(--theme-primary)"
        data-testid="wrapped-retry"
        @click="load"
      >
        {{ copy.home.retryLoad }}
      </button>
    </div>

    <div
      v-else-if="sections"
      class="pb-8"
      data-testid="wrapped-results"
      data-plan="c"
      :data-game="game"
      :data-inventory-ok="inventoryMismatch ? 'false' : 'true'"
      :data-photos-loading="photosLoading ? 'true' : 'false'"
      :class="
        justRevealed && !preferReducedMotion
          ? 'wrapped-reveal-anim'
          : undefined
      "
    >
      <WrappedFeatureCarousel
        :slides="featureSlides"
        :game="game"
        @open-photo="viewer = $event"
      />

      <WrappedLeaderboardSection
        :game="game"
        :rows="leaderboardSource"
      />

      <WrappedAllStatsSection
        :game="game"
        :sections="sections"
      />

      <section
        class="mx-3 mt-4 rounded-2xl px-4 py-6 text-center"
        style="background: var(--theme-gradient-cool); color: var(--theme-ink)"
        data-testid="wrapped-ending"
      >
        <h2 class="font-display text-2xl font-bold">{{ copy.wrapped.wrapHeading }}</h2>
        <p class="mt-2 text-sm" style="color: var(--theme-muted)">
          {{ copy.wrapped.wrapBody }}
        </p>
      </section>

      <!-- Post-finale Home is remapped to Wrapped; restore Log Out (+ Admin) here. -->
      <div class="mx-3" data-testid="wrapped-account-utility">
        <AccountSection :show-team="game === 'shipit'" surface="mint" />
      </div>
    </div>

    <PhotoViewer
      v-if="viewer"
      :src="viewer.url"
      :download-name="`wrapped-${viewer.photoId}.jpg`"
      @close="viewer = null"
    />
  </GameShell>
</template>

<style scoped>
@media (prefers-reduced-motion: no-preference) {
  .wrapped-reveal-anim {
    animation: wrapped-fade-in 0.55s ease-out 1;
  }
}

@keyframes wrapped-fade-in {
  from {
    opacity: 0;
    transform: translateY(0.5rem);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
