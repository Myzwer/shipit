<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import FramedPhoto from '@/components/shared/FramedPhoto.vue'
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
    class="flex min-h-[9.5rem] flex-col rounded-2xl px-3 py-3 shadow-sm"
    :style="{
      background:
        card.tone === 'aqua' ? 'var(--theme-gradient-cool)' : 'var(--theme-gradient-warm)',
      color: 'var(--theme-ink)',
    }"
    data-testid="wrapped-stat-card"
    :data-stat-key="card.key"
    :data-available="card.available === false ? 'false' : 'true'"
  >
    <template v-if="card.kind === 'photo'">
      <p class="text-xs font-bold uppercase tracking-wide" style="color: var(--theme-muted)">
        {{ card.label }}
      </p>
      <p class="font-display mt-1 text-2xl font-bold leading-tight break-words">
        {{ card.value }}
      </p>
      <p v-if="card.copy" class="mt-1 text-xs" style="color: var(--theme-muted)">
        {{ card.copy }}
      </p>
      <div
        class="mt-3 overflow-hidden rounded-xl"
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

    <template v-else-if="card.kind === 'named'">
      <span
        class="inline-flex w-fit rounded-md px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-wide text-white"
        style="background: var(--theme-accent)"
      >
        {{ card.chip || card.label }}
      </span>
      <p class="font-display mt-2 text-2xl font-bold leading-tight break-words">
        {{ card.value }}
      </p>
      <p
        v-if="card.copy"
        class="mt-auto pt-2 text-xs leading-snug"
        style="color: var(--theme-muted)"
      >
        {{ card.copy }}
      </p>
      <p
        v-else
        class="mt-1 text-xs font-semibold"
        style="color: var(--theme-muted)"
      >
        {{ card.label }}
      </p>
      <button
        v-if="hasExpand"
        type="button"
        class="mt-2 text-left text-xs font-semibold underline"
        style="color: var(--theme-primary)"
        @click="expanded = !expanded"
      >
        {{ expanded ? copy.wrapped.hideTies : copy.wrapped.showAllTies }}
      </button>
      <ul v-if="expanded && card.expandableNames" class="mt-1 space-y-0.5 text-xs">
        <li v-for="name in card.expandableNames" :key="name">{{ name }}</li>
      </ul>
    </template>

    <template v-else>
      <AppIcon
        :name="card.icon as SemanticIconKey"
        style-variant="outline"
        class="text-lg opacity-80"
      />
      <p
        class="font-display mt-1 text-4xl font-bold leading-none tabular-nums break-words"
        data-testid="wrapped-stat-value"
      >
        {{ card.value }}
      </p>
      <p class="mt-1 text-sm font-semibold">{{ card.label }}</p>
      <p class="mt-auto pt-2 text-xs leading-snug" style="color: var(--theme-muted)">
        {{ card.copy }}
      </p>
    </template>
  </article>
</template>
