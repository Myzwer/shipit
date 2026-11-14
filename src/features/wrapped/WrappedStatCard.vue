<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import FramedPhoto from '@/components/shared/FramedPhoto.vue'
import { isFullWidthLayout } from '@/lib/wrapped/layout'
import { fetchShipItPhotoSignedUrl } from '@/lib/shipit/submit'
import { copy } from '@/ui/copy'
import type { WrappedStatCard } from '@/types/wrapped'
import type { SemanticIconKey } from '@/ui/icons'

const props = defineProps<{
  card: WrappedStatCard
}>()

const expanded = ref(false)
const photoUrl = ref<string | null>(null)
const photoLoading = ref(false)
const photoError = ref(false)

const hasExpand = computed(
  () => (props.card.expandableNames?.length ?? 0) > 0,
)

const fullWidth = computed(() => isFullWidthLayout(props.card.layout))

const showCompactIcon = computed(
  () =>
    props.card.layout === 'compact' &&
    props.card.kind === 'number' &&
    Boolean(props.card.icon),
)

const framing = computed(() => {
  const photo = props.card.photo
  if (!photo) return null
  return {
    zoom: Number(photo.crop_zoom ?? 1),
    centerX: Number(photo.crop_center_x ?? 0.5),
    centerY: Number(photo.crop_center_y ?? 0.5),
  }
})

async function loadPhoto() {
  const photoId = props.card.photo?.photo_id
  if (!photoId || props.card.kind !== 'photo') {
    photoUrl.value = null
    return
  }
  photoLoading.value = true
  photoError.value = false
  try {
    photoUrl.value = await fetchShipItPhotoSignedUrl(photoId)
    if (!photoUrl.value) photoError.value = true
  } catch {
    photoError.value = true
    photoUrl.value = null
  } finally {
    photoLoading.value = false
  }
}

onMounted(() => {
  void loadPhoto()
})

watch(
  () => props.card.photo?.photo_id,
  () => {
    void loadPhoto()
  },
)
</script>

<template>
  <article
    class="wrapped-stat-tile"
    :class="{
      'wrapped-stat-tile--compact': card.layout === 'compact',
      'wrapped-stat-tile--text': card.layout === 'text',
      'wrapped-stat-tile--featured': card.layout === 'featured',
      'wrapped-stat-tile--full': fullWidth || card.span === 'full',
      'wrapped-stat-tile--orphan-compact':
        card.layout === 'compact' && card.span === 'full',
    }"
    :style="{
      background:
        card.tone === 'aqua' ? 'var(--theme-gradient-cool)' : 'var(--theme-gradient-warm)',
      color: 'var(--theme-ink)',
    }"
    data-testid="wrapped-stat-card"
    :data-stat-key="card.key"
    :data-layout="card.layout"
    :data-span="card.span"
    :data-available="card.available === false ? 'false' : 'true'"
  >
    <!-- Featured / photo memory -->
    <template v-if="card.kind === 'photo' || card.layout === 'featured'">
      <p class="wrapped-stat-tile__label">{{ card.label }}</p>
      <p class="wrapped-stat-tile__value wrapped-stat-tile__value--text" data-testid="wrapped-stat-value">
        {{ card.value }}
      </p>
      <p v-if="card.copy" class="wrapped-stat-tile__copy">{{ card.copy }}</p>
      <div
        v-if="card.kind === 'photo'"
        class="wrapped-stat-tile__photo"
        style="background: color-mix(in srgb, var(--theme-ink) 8%, transparent)"
      >
        <FramedPhoto
          v-if="photoUrl && card.photo"
          :src="photoUrl"
          :width="card.photo.width ?? 1080"
          :height="card.photo.height ?? 1080"
          :framing="framing"
          class="w-full"
        />
        <div
          v-else-if="photoLoading"
          class="flex h-40 items-center justify-center text-sm"
          style="color: var(--theme-muted)"
        >
          {{ copy.wrapped.loading }}
        </div>
        <div
          v-else
          class="flex h-40 items-center justify-center px-4 text-center text-sm"
          style="color: var(--theme-muted)"
          data-testid="wrapped-photo-fallback"
        >
          {{ copy.wrapped.photoUnavailable }}
        </div>
      </div>
    </template>

    <!-- Full-width text-heavy favorites / days / ties -->
    <template v-else-if="card.layout === 'text'">
      <p class="wrapped-stat-tile__label wrapped-stat-tile__label--chip">
        <span
          class="wrapped-stat-tile__chip"
          style="background: var(--theme-accent)"
        >
          {{ card.chip || card.label }}
        </span>
      </p>
      <p class="wrapped-stat-tile__value wrapped-stat-tile__value--text" data-testid="wrapped-stat-value">
        {{ card.value }}
      </p>
      <p v-if="card.copy" class="wrapped-stat-tile__copy">{{ card.copy }}</p>
      <button
        v-if="hasExpand"
        type="button"
        class="wrapped-stat-tile__expand"
        style="color: var(--theme-primary)"
        @click="expanded = !expanded"
      >
        {{ expanded ? copy.wrapped.hideTies : copy.wrapped.showAllTies }}
      </button>
      <ul
        v-if="expanded && card.expandableNames"
        class="wrapped-stat-tile__ties"
      >
        <li v-for="name in card.expandableNames" :key="name">{{ name }}</li>
      </ul>
    </template>

    <!-- Compact numeric / rank half-tiles -->
    <template v-else-if="card.kind === 'named'">
      <p class="wrapped-stat-tile__label wrapped-stat-tile__label--chip">
        <span
          class="wrapped-stat-tile__chip"
          style="background: var(--theme-accent)"
        >
          {{ card.chip || card.label }}
        </span>
      </p>
      <p class="wrapped-stat-tile__value wrapped-stat-tile__value--number" data-testid="wrapped-stat-value">
        {{ card.value }}
      </p>
      <p v-if="card.copy" class="wrapped-stat-tile__copy">{{ card.copy }}</p>
    </template>

    <template v-else>
      <AppIcon
        v-if="showCompactIcon"
        :name="card.icon as SemanticIconKey"
        style-variant="outline"
        class="wrapped-stat-tile__icon"
      />
      <p class="wrapped-stat-tile__value wrapped-stat-tile__value--number" data-testid="wrapped-stat-value">
        {{ card.value }}
      </p>
      <p class="wrapped-stat-tile__caption">{{ card.label }}</p>
      <p v-if="card.copy" class="wrapped-stat-tile__copy">{{ card.copy }}</p>
    </template>
  </article>
</template>

<style scoped>
.wrapped-stat-tile {
  box-shadow: none;
  border-radius: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.wrapped-stat-tile--compact {
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 0.7rem 0.65rem;
  min-height: 0;
  height: 100%;
}

.wrapped-stat-tile--orphan-compact {
  padding-block: 0.65rem;
}

.wrapped-stat-tile--text,
.wrapped-stat-tile--featured {
  align-items: flex-start;
  justify-content: center;
  text-align: left;
  padding: 0.85rem 1.15rem;
  min-height: 0;
  width: 100%;
}

.wrapped-stat-tile__icon {
  font-size: 0.85rem;
  line-height: 1;
  opacity: 0.8;
  margin-bottom: 0.25rem;
}

.wrapped-stat-tile__label {
  margin: 0;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--theme-muted);
}

.wrapped-stat-tile__label--chip {
  color: inherit;
}

.wrapped-stat-tile__chip {
  display: inline-flex;
  max-width: 100%;
  border-radius: 0.375rem;
  padding: 0.15rem 0.45rem;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #fff;
}

.wrapped-stat-tile__value {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 700;
  line-height: 1.1;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.wrapped-stat-tile__value--number {
  margin-top: 0.1rem;
  font-size: 1.85rem;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.wrapped-stat-tile__value--text {
  margin-top: 0.35rem;
  font-size: clamp(1.2rem, 4.8vw, 1.65rem);
  line-height: 1.15;
}

.wrapped-stat-tile__caption {
  margin: 0.3rem 0 0;
  font-size: 0.62rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  line-height: 1.2;
}

.wrapped-stat-tile__copy {
  margin: 0.3rem 0 0;
  font-size: 0.75rem;
  line-height: 1.35;
  color: var(--theme-muted);
}

.wrapped-stat-tile--compact .wrapped-stat-tile__copy {
  max-width: 12ch;
}

.wrapped-stat-tile--text .wrapped-stat-tile__copy,
.wrapped-stat-tile--featured .wrapped-stat-tile__copy {
  max-width: none;
}

.wrapped-stat-tile__expand {
  margin-top: 0.45rem;
  padding: 0;
  border: 0;
  background: transparent;
  font-size: 0.75rem;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
}

.wrapped-stat-tile__ties {
  margin: 0.35rem 0 0;
  padding: 0;
  list-style: none;
  font-size: 0.75rem;
  line-height: 1.4;
}

.wrapped-stat-tile__ties li + li {
  margin-top: 0.15rem;
}

.wrapped-stat-tile__photo {
  margin-top: 0.75rem;
  width: 100%;
  overflow: hidden;
  border-radius: 0.75rem;
}
</style>
