<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import GameShell from '@/components/shared/GameShell.vue'
import GalleryPostCard from '@/features/gallery/GalleryPostCard.vue'
import PhotoViewer from '@/features/gallery/PhotoViewer.vue'
import {
  listGalleryFeed,
  markGallerySeen,
} from '@/lib/gallery/api'
import { countNewerThanTop, mergeGalleryFreshPage } from '@/lib/gallery/feedMerge'
import { useGalleryUnreadStore } from '@/stores/galleryUnread'
import type { GameId } from '@/types/game'
import type {
  GalleryCursor,
  GalleryFeedEvent,
  GalleryFilter,
  GalleryReactionCounts,
  GalleryReactionEmoji,
} from '@/types/gallery'
import { copy, formatCopy } from '@/ui/copy'

const props = defineProps<{
  game: GameId
}>()

const route = useRoute()
const unread = useGalleryUnreadStore()

const filter = ref<GalleryFilter>('everyone')
const events = ref<GalleryFeedEvent[]>([])
const nextCursor = ref<GalleryCursor | null>(null)
const hasMore = ref(false)
const newestEvent = ref<GalleryCursor | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const loadingMore = ref(false)
const refreshing = ref(false)
const refreshError = ref(false)
const pendingNewCount = ref(0)
const pendingNewExact = ref(true)
const viewer = ref<{ url: string; photoId: string } | null>(null)
const inFlight = ref(false)
const pollTimer = ref<ReturnType<typeof setInterval> | null>(null)
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null
/** Bumped on filter/game change so stale responses cannot overwrite newer selection. */
let requestGen = 0

const secondaryFilter = computed(() =>
  props.game === 'drinkit' ? ('mine' as const) : ('team' as const),
)
const secondaryLabel = computed(() =>
  props.game === 'drinkit' ? copy.gallery.myGallery : copy.gallery.myTeam,
)

const emptyCopy = computed(() => {
  if (filter.value === 'everyone') return copy.gallery.emptyEveryone
  if (filter.value === 'mine') return copy.gallery.emptyMine
  return copy.gallery.emptyTeam
})

const newPostsLabel = computed(() => {
  if (!pendingNewExact.value) return copy.gallery.newPostsMany
  return pendingNewCount.value === 1
    ? copy.gallery.newPostSingular
    : formatCopy(copy.gallery.newPostsPlural, { count: pendingNewCount.value })
})

const highlightSubmission = computed(() =>
  typeof route.query.submission === 'string' ? route.query.submission : null,
)

async function loadInitial(opts?: { quiet?: boolean }) {
  const myGen = ++requestGen
  const myFilter = filter.value
  inFlight.value = true
  if (!opts?.quiet) status.value = events.value.length ? 'ready' : 'loading'
  refreshError.value = false
  try {
    const page = await listGalleryFeed({
      game: props.game,
      filter: myFilter,
      limit: 5,
    })
    if (myGen !== requestGen || filter.value !== myFilter) return
    events.value = page.events
    nextCursor.value = page.next_cursor
    hasMore.value = page.has_more
    newestEvent.value = page.newest_event
    status.value = 'ready'
    pendingNewCount.value = 0
    pendingNewExact.value = true
    if (myFilter === 'everyone' && page.newest_event) {
      try {
        await markGallerySeen(props.game, page.newest_event)
        if (myGen !== requestGen || filter.value !== myFilter) return
        unread.setUnread(props.game, false)
      } catch {
        /* failed mark must not clear unread */
      }
    }
    await unread.refresh(props.game)
  } catch {
    if (myGen !== requestGen || filter.value !== myFilter) return
    if (!events.value.length) status.value = 'error'
    else refreshError.value = true
  } finally {
    if (myGen === requestGen) inFlight.value = false
  }
}

async function loadMore() {
  if (!hasMore.value || !nextCursor.value || loadingMore.value || inFlight.value) return
  const myGen = requestGen
  const myFilter = filter.value
  loadingMore.value = true
  inFlight.value = true
  try {
    const page = await listGalleryFeed({
      game: props.game,
      filter: myFilter,
      limit: 5,
      before: nextCursor.value,
    })
    if (myGen !== requestGen || filter.value !== myFilter) return
    const seen = new Set(events.value.map((e) => e.event_id))
    for (const ev of page.events) {
      if (!seen.has(ev.event_id)) events.value.push(ev)
    }
    nextCursor.value = page.next_cursor
    hasMore.value = page.has_more
  } catch {
    if (myGen !== requestGen || filter.value !== myFilter) return
    refreshError.value = true
  } finally {
    if (myGen === requestGen) {
      loadingMore.value = false
      inFlight.value = false
    }
  }
}

async function pollFresh() {
  if (document.visibilityState === 'hidden') return
  if (inFlight.value || refreshing.value) return
  const myFilter = filter.value
  if (myFilter !== 'everyone') return
  const myGen = requestGen
  refreshing.value = true
  try {
    const page = await listGalleryFeed({
      game: props.game,
      filter: 'everyone',
      limit: 5,
    })
    if (myGen !== requestGen || filter.value !== myFilter) return

    const topId = events.value[0]?.event_id
    const freshTop = page.events[0]?.event_id
    const { count, exact } = countNewerThanTop(page.events, topId)
    const hasNewer = Boolean(freshTop && topId && freshTop !== topId)

    if (hasNewer) {
      const nearTop = window.scrollY < 80
      if (nearTop) {
        // Preserve older loaded pages; refresh reaction counts on overlap.
        const hadOlder = events.value.length > page.events.length
        const prevCursor = nextCursor.value
        const prevHasMore = hasMore.value
        events.value = mergeGalleryFreshPage(events.value, page)
        if (hadOlder) {
          nextCursor.value = prevCursor
          hasMore.value = prevHasMore
        } else {
          nextCursor.value = page.next_cursor
          hasMore.value = page.has_more
        }
        newestEvent.value = page.newest_event
        pendingNewCount.value = 0
        pendingNewExact.value = true
        if (page.newest_event) {
          try {
            await markGallerySeen(props.game, page.newest_event)
            if (myGen !== requestGen || filter.value !== myFilter) return
            unread.setUnread(props.game, false)
          } catch {
            /* ignore */
          }
        }
      } else {
        pendingNewCount.value = Math.max(count, 1)
        pendingNewExact.value = exact
        newestEvent.value = page.newest_event
      }
    } else if (!topId && page.events.length) {
      events.value = page.events
      nextCursor.value = page.next_cursor
      hasMore.value = page.has_more
      newestEvent.value = page.newest_event
    } else if (topId && page.events.length) {
      // Same top: still refresh reaction counts on the first page overlap.
      events.value = mergeGalleryFreshPage(events.value, page)
      newestEvent.value = page.newest_event
    }
    await unread.refresh(props.game)
  } catch {
    if (myGen !== requestGen || filter.value !== myFilter) return
    refreshError.value = true
  } finally {
    if (myGen === requestGen) refreshing.value = false
  }
}

async function openNewPosts() {
  pendingNewCount.value = 0
  pendingNewExact.value = true
  await loadInitial({ quiet: true })
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function setFilter(next: GalleryFilter) {
  if (filter.value === next) return
  filter.value = next
  events.value = []
  nextCursor.value = null
  hasMore.value = false
  pendingNewCount.value = 0
  pendingNewExact.value = true
  void loadInitial()
}

function onReactionUpdated(payload: {
  eventId: string
  my_reaction: GalleryReactionEmoji | null
  reactions: GalleryReactionCounts
}) {
  const row = events.value.find((e) => e.event_id === payload.eventId)
  if (!row) return
  row.my_reaction = payload.my_reaction
  row.reactions = payload.reactions
}

function onVisibility() {
  if (document.visibilityState === 'visible') void pollFresh()
}

function startPolling() {
  stopPolling()
  pollTimer.value = setInterval(() => {
    void pollFresh()
  }, 25_000)
}

function stopPolling() {
  if (pollTimer.value) {
    clearInterval(pollTimer.value)
    pollTimer.value = null
  }
}

onMounted(async () => {
  await loadInitial()
  startPolling()
  document.addEventListener('visibilitychange', onVisibility)
  observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((e) => e.isIntersecting)) void loadMore()
    },
    { rootMargin: '200px' },
  )
  if (sentinel.value) observer.observe(sentinel.value)
})

onUnmounted(() => {
  stopPolling()
  document.removeEventListener('visibilitychange', onVisibility)
  observer?.disconnect()
})

watch(sentinel, (el, _, onCleanup) => {
  if (!observer) return
  if (el) observer.observe(el)
  onCleanup(() => {
    if (el) observer?.unobserve(el)
  })
})

watch(
  () => props.game,
  () => {
    events.value = []
    filter.value = 'everyone'
    pendingNewCount.value = 0
    pendingNewExact.value = true
    void loadInitial()
  },
)
</script>

<template>
  <GameShell :game="game" :title="copy.gallery.heading" :show-switch="false">
    <div class="px-4 pb-28 pt-4" data-testid="gallery-feed" :data-game="game">
      <h1
        class="font-display text-center text-2xl font-bold uppercase tracking-wide"
        style="color: var(--theme-ink)"
        data-testid="gallery-heading"
      >
        {{ copy.gallery.heading }}
      </h1>

      <div
        class="mt-4 flex justify-center gap-2"
        role="tablist"
        :aria-label="copy.gallery.heading"
        data-testid="gallery-filters"
      >
        <button
          type="button"
          class="rounded-full px-4 py-2 text-sm font-semibold"
          :style="
            filter === 'everyone'
              ? { background: 'var(--theme-primary)', color: '#fff' }
              : { background: 'var(--theme-card)', color: 'var(--theme-ink)' }
          "
          role="tab"
          :aria-selected="filter === 'everyone'"
          data-testid="gallery-filter-everyone"
          @click="setFilter('everyone')"
        >
          {{ copy.gallery.everyone }}
        </button>
        <button
          type="button"
          class="rounded-full px-4 py-2 text-sm font-semibold"
          :style="
            filter === secondaryFilter
              ? { background: 'var(--theme-primary)', color: '#fff' }
              : { background: 'var(--theme-card)', color: 'var(--theme-ink)' }
          "
          role="tab"
          :aria-selected="filter === secondaryFilter"
          :data-testid="`gallery-filter-${secondaryFilter}`"
          @click="setFilter(secondaryFilter)"
        >
          {{ secondaryLabel }}
        </button>
      </div>

      <p
        v-if="refreshError"
        class="mt-3 rounded-2xl px-3 py-2 text-sm"
        style="background: var(--theme-card); color: var(--theme-ink)"
        data-testid="gallery-refresh-error"
      >
        {{ copy.gallery.refreshFailedDetail }}
        <button
          type="button"
          class="ml-2 font-semibold underline"
          style="color: var(--theme-primary)"
          data-testid="gallery-refresh-retry"
          @click="loadInitial({ quiet: true })"
        >
          {{ copy.gallery.retry }}
        </button>
      </p>

      <div
        v-if="status === 'loading'"
        class="mt-6 space-y-4"
        data-testid="gallery-skeletons"
        :aria-label="copy.gallery.loading"
      >
        <div
          v-for="n in 3"
          :key="n"
          class="h-64 animate-pulse rounded-3xl"
          style="background: var(--theme-card)"
        />
      </div>

      <div v-else-if="status === 'error'" class="mt-8 text-center" data-testid="gallery-error">
        <p class="font-semibold" style="color: var(--theme-ink)">{{ copy.gallery.loadFailedTitle }}</p>
        <p class="mt-1 text-sm" style="color: var(--theme-muted)">{{ copy.gallery.loadFailedDetail }}</p>
        <button
          type="button"
          class="mt-4 rounded-full px-5 py-2 text-sm font-semibold text-white"
          style="background: var(--theme-primary)"
          data-testid="gallery-retry"
          @click="loadInitial()"
        >
          {{ copy.gallery.retry }}
        </button>
      </div>

      <div
        v-else-if="!events.length"
        class="mt-10 text-center text-sm"
        style="color: var(--theme-muted)"
        data-testid="gallery-empty"
      >
        {{ emptyCopy }}
      </div>

      <div v-else class="mt-6 space-y-4">
        <GalleryPostCard
          v-for="ev in events"
          :key="ev.event_id"
          :game="game"
          :event="ev"
          :class="
            highlightSubmission && ev.submission_id === highlightSubmission
              ? 'ring-2 ring-[var(--theme-primary)]'
              : ''
          "
          @open-photo="viewer = $event"
          @reaction-updated="onReactionUpdated"
        />
        <p
          v-if="loadingMore"
          class="py-3 text-center text-sm"
          style="color: var(--theme-muted)"
          data-testid="gallery-loading-more"
        >
          {{ copy.gallery.loadingMore }}
        </p>
        <p
          v-else-if="!hasMore"
          class="py-4 text-center text-sm font-semibold uppercase tracking-wide"
          style="color: var(--theme-muted)"
          data-testid="gallery-end"
        >
          {{ copy.gallery.endOfPosts }}
        </p>
        <div ref="sentinel" class="h-4" aria-hidden="true" data-testid="gallery-sentinel" />
      </div>
    </div>

    <button
      v-if="pendingNewCount > 0"
      type="button"
      class="fixed left-1/2 z-40 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg"
      style="top: max(1rem, env(safe-area-inset-top)); background: var(--theme-primary)"
      data-testid="gallery-new-posts"
      :data-exact="pendingNewExact ? '1' : '0'"
      @click="openNewPosts"
    >
      {{ newPostsLabel }}
    </button>

    <PhotoViewer
      v-if="viewer"
      :src="viewer.url"
      :download-name="`gallery-${viewer.photoId}.jpg`"
      @close="viewer = null"
    />
  </GameShell>
</template>
