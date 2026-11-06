<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import ReactionBar from '@/features/gallery/ReactionBar.vue'
import { fetchGalleryPhotoSignedUrl } from '@/lib/gallery/api'
import { formatShipTimeOfDay } from '@/lib/shipClockFormat'
import type { GameId } from '@/types/game'
import type { GalleryFeedEvent, GalleryReactionCounts, GalleryReactionEmoji } from '@/types/gallery'
import { copy, formatCopy } from '@/ui/copy'

const props = defineProps<{
  game: GameId
  event: GalleryFeedEvent
}>()

const emit = defineEmits<{
  openPhoto: [payload: { url: string; photoId: string }]
  reactionUpdated: [
    payload: {
      eventId: string
      my_reaction: GalleryReactionEmoji | null
      reactions: GalleryReactionCounts
    },
  ]
}>()

const thumbUrl = ref<string | null>(null)
const localReaction = ref(props.event.my_reaction)
const localCounts = ref({ ...props.event.reactions })

watch(
  () => props.event,
  (e) => {
    localReaction.value = e.my_reaction
    localCounts.value = { ...e.reactions }
  },
)

const title = computed(() => {
  const d = props.event.display
  if (props.event.kind === 'drink_log') return String(d.drink_name ?? 'Drink')
  if (props.event.kind === 'daily') return String(d.title ?? copy.bounty.daily)
  return String(d.title ?? 'Challenge')
})

const subtitle = computed(() => {
  const d = props.event.display
  if (props.event.kind === 'drink_log') return String(d.bar_name ?? '')
  if (props.event.kind === 'daily') return copy.bounty.daily
  return String(d.team_name ?? props.event.owner_team_name ?? '')
})

const byline = computed(() => {
  if (props.event.kind === 'scavenger') {
    const name = props.event.owner_player_name
    if (name) return formatCopy(copy.gallery.submittedBy, { playerName: name })
    return props.event.owner_team_name ?? ''
  }
  return props.event.owner_player_name ?? ''
})

const timeLabel = computed(() => {
  const shipLocal = props.event.created_ship_local
  if (shipLocal) {
    return `${formatShipTimeOfDay(shipLocal)} · ${copy.gallery.shipTime}`
  }
  return copy.gallery.shipTime
})

const captionLabel = computed(() =>
  props.event.caption?.trim() ? props.event.caption.trim() : copy.wizard.noCaption,
)

async function loadThumb() {
  if (!props.event.photo_id) {
    thumbUrl.value = null
    return
  }
  thumbUrl.value = await fetchGalleryPhotoSignedUrl(props.game, props.event.photo_id)
}

async function openPhoto() {
  if (!props.event.photo_id) return
  const url =
    thumbUrl.value ?? (await fetchGalleryPhotoSignedUrl(props.game, props.event.photo_id))
  if (!url) return
  thumbUrl.value = url
  emit('openPhoto', { url, photoId: props.event.photo_id })
}

function onReaction(p: {
  my_reaction: GalleryReactionEmoji | null
  reactions: GalleryReactionCounts
}) {
  localReaction.value = p.my_reaction
  localCounts.value = p.reactions
  emit('reactionUpdated', { eventId: props.event.event_id, ...p })
}

onMounted(() => {
  void loadThumb()
})
</script>

<template>
  <article
    class="rounded-3xl px-4 py-4"
    style="background: var(--theme-card); color: var(--theme-ink)"
    data-testid="gallery-post"
    :data-event-id="event.event_id"
    :data-kind="event.kind"
    :data-submission-id="event.submission_id ?? ''"
  >
    <button
      v-if="event.photo_id && thumbUrl"
      type="button"
      class="block w-full overflow-hidden rounded-2xl"
      :aria-label="copy.gallery.viewFullPhoto"
      data-testid="gallery-post-photo"
      @click="openPhoto"
    >
      <img :src="thumbUrl" alt="" class="aspect-square w-full object-cover" />
    </button>
    <div
      v-else-if="!event.photo_id && game === 'drinkit' && event.kind === 'drink_log'"
      class="flex aspect-square w-full items-center justify-center rounded-2xl text-center text-sm font-semibold uppercase tracking-wide text-white"
      style="background: var(--theme-header)"
      data-testid="gallery-post-placeholder"
    >
      {{ copy.wizard.noPhoto }}
    </div>
    <div
      v-else-if="event.photo_id && !thumbUrl"
      class="aspect-square w-full animate-pulse rounded-2xl"
      style="background: var(--theme-page)"
      data-testid="gallery-post-photo-loading"
    />

    <p class="mt-3 text-xs font-semibold uppercase tracking-wide" style="color: var(--theme-muted)">
      {{ byline }}
    </p>
    <h2 class="font-display mt-1 text-xl font-bold" data-testid="gallery-post-title">{{ title }}</h2>
    <p v-if="subtitle" class="text-sm" style="color: var(--theme-muted)" data-testid="gallery-post-subtitle">
      {{ subtitle }}
    </p>
    <p class="mt-2 text-sm" data-testid="gallery-post-caption">{{ captionLabel }}</p>
    <p class="mt-1 text-xs" style="color: var(--theme-muted)" data-testid="gallery-post-time">
      {{ timeLabel }}
    </p>

    <ReactionBar
      :event-id="event.event_id"
      :reactions="localCounts"
      :my-reaction="localReaction"
      @updated="onReaction"
    />
  </article>
</template>
