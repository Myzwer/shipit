<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import FramedPhoto from '@/components/shared/FramedPhoto.vue'
import { fetchGalleryPhotoSignedUrl } from '@/lib/gallery/api'
import { copy } from '@/ui/copy'
import type { GameId } from '@/types/game'
import type { WrappedPhotoSlide } from '@/types/wrappedPlanC'

const props = defineProps<{
  slide: WrappedPhotoSlide
  game: GameId
  sequenceLabel: string
}>()

const emit = defineEmits<{
  open: [payload: { url: string; photoId: string }]
}>()

const photoUrl = ref<string | null>(null)
const loading = ref(false)
const errored = ref(false)
const dragGuard = ref(false)
let pointerStartX = 0

const gradient = computed(() =>
  props.slide.tone === 'warm'
    ? 'var(--theme-gradient-warm)'
    : 'var(--theme-gradient-cool)',
)

const framing = computed(() => {
  const photo = props.slide.photo
  return {
    zoom: Number(photo.crop_zoom ?? 1),
    centerX: Number(photo.crop_center_x ?? 0.5),
    centerY: Number(photo.crop_center_y ?? 0.5),
  }
})

async function loadPhoto() {
  const photoId = props.slide.photo.photo_id
  if (!photoId) {
    photoUrl.value = null
    return
  }
  loading.value = true
  errored.value = false
  try {
    photoUrl.value = await fetchGalleryPhotoSignedUrl(props.game, photoId)
    if (!photoUrl.value) errored.value = true
  } catch {
    photoUrl.value = null
    errored.value = true
  } finally {
    loading.value = false
  }
}

function onPointerDown(e: PointerEvent) {
  pointerStartX = e.clientX
  dragGuard.value = false
}

function onPointerMove(e: PointerEvent) {
  if (Math.abs(e.clientX - pointerStartX) > 10) dragGuard.value = true
}

function onActivate() {
  if (dragGuard.value || !photoUrl.value) return
  emit('open', { url: photoUrl.value, photoId: props.slide.photo.photo_id })
}

onMounted(() => {
  void loadPhoto()
})

watch(
  () => props.slide.photo.photo_id,
  () => {
    void loadPhoto()
  },
)
</script>

<template>
  <article
    class="photo-card"
    :style="{ background: gradient }"
    data-testid="wrapped-photo-card"
    :data-slide-id="slide.id"
  >
    <p class="photo-card__eyebrow">{{ sequenceLabel }} — {{ slide.eyebrow }}</p>
    <h3 class="photo-card__headline">{{ slide.headline }}</h3>
    <p v-if="slide.subhead" class="photo-card__subhead">{{ slide.subhead }}</p>

    <button
      type="button"
      class="photo-card__polaroid"
      :disabled="!photoUrl"
      data-testid="wrapped-photo-polaroid"
      :aria-label="copy.gallery.viewFullPhoto"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @click="onActivate"
    >
      <div class="photo-card__frame">
        <FramedPhoto
          v-if="photoUrl"
          :src="photoUrl"
          :width="slide.photo.width ?? 1080"
          :height="slide.photo.height ?? 1080"
          :framing="framing"
          class="w-full"
        />
        <div
          v-else-if="loading"
          class="photo-card__fallback"
          data-testid="wrapped-photo-loading"
        >
          …
        </div>
        <div
          v-else
          class="photo-card__fallback"
          data-testid="wrapped-photo-fallback"
        >
          {{ copy.wrapped.photoUnavailable }}
        </div>
      </div>
      <p v-if="slide.caption" class="photo-card__caption">{{ slide.caption }}</p>
    </button>
  </article>
</template>

<style scoped>
.photo-card {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 100%;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 0.9rem 1rem 1.15rem;
  border-radius: 1.65rem;
  color: var(--theme-ink);
  box-shadow: 0 14px 26px rgba(80, 50, 20, 0.16);
  text-align: center;
}

.photo-card__eyebrow {
  margin: 0;
  align-self: flex-start;
  font-size: 0.92rem;
  font-weight: 500;
  font-style: italic;
  line-height: 1.25;
  color: var(--theme-ink);
}

.photo-card__headline {
  margin: 0.5rem 0 0;
  max-width: 17rem;
  font-family: var(--font-display);
  font-size: clamp(1.38rem, 4.8cqi, 1.52rem);
  font-weight: 800;
  line-height: 1.18;
}

.photo-card__subhead {
  margin: 0.3rem 0 0;
  max-width: 17rem;
  font-size: 1.02rem;
  line-height: 1.4;
}

.photo-card__polaroid {
  display: flex;
  /* Substantial square; breathing room from intro without oversized panels. */
  width: min(100%, 14.75rem);
  margin-top: 1.05rem;
  flex: 0 0 auto;
  flex-direction: column;
  border: 0;
  background: #fff;
  padding: 0.65rem 0.65rem 0.5rem;
  border-radius: 0.2rem;
  box-shadow: 0 8px 18px rgba(40, 30, 20, 0.18);
  color: inherit;
  text-align: left;
}

.photo-card__polaroid:disabled {
  cursor: default;
}

.photo-card__frame {
  overflow: hidden;
  background: color-mix(in srgb, var(--theme-ink) 8%, #fff);
  aspect-ratio: 1;
}

.photo-card__fallback {
  display: flex;
  height: 100%;
  min-height: 12rem;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  font-size: 0.85rem;
  color: var(--theme-muted);
}

.photo-card__caption {
  margin: 0.75rem 0 0.2rem;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  font-size: 0.88rem;
  line-height: 1.28;
  color: var(--theme-ink);
}
</style>
