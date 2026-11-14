<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import GameShell from '@/components/shared/GameShell.vue'
import AchievementUnlockPopup from '@/features/achievements/AchievementUnlockPopup.vue'
import GalleryPostCard from '@/features/gallery/GalleryPostCard.vue'
import PhotoViewer from '@/features/gallery/PhotoViewer.vue'
import { isNotAuthenticatedError } from '@/lib/authFailure'
import {
  listGalleryFeed,
  markGallerySeen,
} from '@/lib/gallery/api'
import {
  galleryNeedsAnotherPage,
  readShowAchievements,
  visibleGalleryEvents,
  writeShowAchievements,
} from '@/lib/gallery/achievementVisibility'
import { countNewerThanTop, mergeGalleryFreshPage } from '@/lib/gallery/feedMerge'
import { useGalleryUnreadStore } from '@/stores/galleryUnread'
import { useSessionStore } from '@/stores/session'
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
const router = useRouter()
const session = useSessionStore()
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
/** Brief post-submit flash only; never driven by a sticky route query. */
const flashSubmissionId = ref<string | null>(null)
let flashTimer: ReturnType<typeof setTimeout> | null = null
let observer: IntersectionObserver | null = null
/** Bumped on filter/game change so stale responses cannot overwrite newer selection. */
let requestGen = 0

const FLASH_MS = 1400

async function forceReLogin() {
  await session.signOut()
  await router.replace({ name: 'login', query: { reason: 'expired' } })
}

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

function clearSubmissionQuery() {
  if (typeof route.query.submission !== 'string') return
  const nextQuery = { ...route.query }
  delete nextQuery.submission
  void router.replace({ query: nextQuery })
}

function beginSubmissionFlash(submissionId: string) {
  if (flashTimer) {
    clearTimeout(flashTimer)
    flashTimer = null
  }
  flashSubmissionId.value = submissionId
  flashTimer = setTimeout(() => {
    flashSubmissionId.value = null
    flashTimer = null
  }, FLASH_MS)
  clearSubmissionQuery()
}

const showAchievements = ref(readShowAchievements(props.game))
const visibleEvents = computed(() => visibleGalleryEvents(events.value, showAchievements.value))

function onShowAchievementsChange() {
  writeShowAchievements(props.game, showAchievements.value)
  if (!showAchievements.value) void ensureVisiblePage()
}

async function ensureVisiblePage() {
  let guard = 0
  while (
    galleryNeedsAnotherPage({
      showAchievements: showAchievements.value,
      visibleCount: visibleEvents.value.length,
      hasMore: hasMore.value,
    }) &&
    guard < 12
  ) {
    guard += 1
    const before = events.value.length
    await loadMore()
    if (events.value.length === before) break
  }
}

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
  } catch (err) {
    if (myGen !== requestGen || filter.value !== myFilter) return
    if (isNotAuthenticatedError(err)) {
      await forceReLogin()
      return
    }
    if (!events.value.length) status.value = 'error'
    else refreshError.value = true
  } finally {
    if (myGen === requestGen) {
      inFlight.value = false
      void ensureVisiblePage()
    }
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
  } catch (err) {
    if (myGen !== requestGen || filter.value !== myFilter) return
    if (isNotAuthenticatedError(err)) {
      await forceReLogin()
      return
    }
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
  } catch (err) {
    if (myGen !== requestGen || filter.value !== myFilter) return
    if (isNotAuthenticatedError(err)) {
      await forceReLogin()
      return
    }
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
  const inboundSubmission =
    typeof route.query.submission === 'string' ? route.query.submission : null
  if (inboundSubmission) beginSubmissionFlash(inboundSubmission)
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
  if (flashTimer) {
    clearTimeout(flashTimer)
    flashTimer = null
  }
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
  (game) => {
    showAchievements.value = readShowAchievements(game)
    events.value = []
    filter.value = 'everyone'
    pendingNewCount.value = 0
    pendingNewExact.value = true
    void loadInitial()
  },
)

watch(
  () => route.query.submission,
  (submission) => {
    if (typeof submission === 'string' && submission.length > 0) {
      beginSubmissionFlash(submission)
    }
  },
)
</script>

<template>
  <GameShell
    :game="game"
    :title="copy.gallery.heading"
    :show-ship-time="false"
    tone="home"
  >
    <div
      class="px-4 pb-6 pt-3"
      data-testid="gallery-feed"
      :data-game="game"
    >
      <div
        class="gallery-filter-row"
        role="tablist"
        :aria-label="copy.gallery.heading"
        data-testid="gallery-filters"
      >
        <button
          type="button"
          :class="['gallery-filter', filter === 'everyone' ? 'is-active' : '']"
          role="tab"
          :aria-selected="filter === 'everyone'"
          data-testid="gallery-filter-everyone"
          @click="setFilter('everyone')"
        >
          {{ copy.gallery.everyone }}
        </button>
        <button
          type="button"
          :class="['gallery-filter', filter === secondaryFilter ? 'is-active' : '']"
          role="tab"
          :aria-selected="filter === secondaryFilter"
          :data-testid="`gallery-filter-${secondaryFilter}`"
          @click="setFilter(secondaryFilter)"
        >
          {{ secondaryLabel }}
        </button>
      </div>

      <label class="gallery-achieve-toggle">
        <span>{{ copy.gallery.showAchievements }}</span>
        <input
          v-model="showAchievements"
          type="checkbox"
          role="switch"
          class="gallery-switch"
          data-testid="gallery-show-achievements"
          @change="onShowAchievementsChange"
        />
      </label>

      <p
        v-if="refreshError"
        class="mt-3 rounded-2xl px-3 py-2 text-sm"
        style="background: var(--theme-gradient-warm); color: var(--theme-ink)"
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
        <div v-for="n in 3" :key="n" class="gallery-skeleton">
          <div class="gallery-polaroid-photo gallery-polaroid-pending animate-pulse" />
        </div>
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
        v-else-if="!visibleEvents.length && (hasMore || loadingMore)"
        class="mt-8 text-center text-sm"
        style="color: var(--theme-muted)"
        data-testid="gallery-filtering"
      >
        {{ copy.gallery.loadingMore }}
      </div>

      <div
        v-else-if="!visibleEvents.length"
        class="mt-10 text-center text-sm"
        style="color: var(--theme-muted)"
        data-testid="gallery-empty"
      >
        {{ emptyCopy }}
      </div>

      <div v-else class="gallery-feed-list mt-4">
        <template v-for="(ev, index) in visibleEvents" :key="ev.event_id">
          <GalleryPostCard
            :game="game"
            :event="ev"
            :class="
              flashSubmissionId && ev.submission_id === flashSubmissionId
                ? 'gallery-post--flash'
                : ''
            "
            :data-flash="
              flashSubmissionId && ev.submission_id === flashSubmissionId ? '1' : undefined
            "
            @open-photo="viewer = $event"
            @reaction-updated="onReactionUpdated"
          />
          <hr
            v-if="index < visibleEvents.length - 1"
            class="gallery-feed-rule"
            data-testid="gallery-feed-rule"
          />
        </template>
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

    <AchievementUnlockPopup :game="game" />
  </GameShell>
</template>
