<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '@/components/shared/AppIcon.vue'
import FramedPhoto from '@/components/shared/FramedPhoto.vue'
import ReactionBar from '@/features/gallery/ReactionBar.vue'
import { resolveAchievementIconKey } from '@/lib/achievements/icons'
import {
  achievementAnnouncementTitle,
  isSecretMaskedAnnouncement,
} from '@/lib/gallery/achievementAnnouncement'
import {
  compactCompanionByline,
  formatNaturalNameList,
  sanitizeCompanionNames,
} from '@/lib/gallery/formatCompanionNames'
import { useSignedPhotoUrl } from '@/lib/gallery/useSignedPhotoUrl'
import { DEFAULT_PHOTO_FRAMING, framingFromWire } from '@/lib/media/framing'
import { formatShipWeekdayTime } from '@/lib/shipClockFormat'
import type { GameId } from '@/types/game'
import type { GalleryFeedEvent, GalleryReactionCounts, GalleryReactionEmoji } from '@/types/gallery'
import { copy, formatCopy } from '@/ui/copy'
import type { SemanticIconKey } from '@/ui/icons'
import noImageUrl from '@/assets/gallery/no_image.jpg'

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

const {
  url: thumbUrl,
  state: photoState,
  onPhotoError,
  reload: reloadSignedUrl,
} = useSignedPhotoUrl({
  game: () => props.game,
  photoId: () => props.event.photo_id,
})
const localReaction = ref(props.event.my_reaction)
const localCounts = ref({ ...props.event.reactions })

/** Local presentation only — survive reaction / feed merges keyed by event_id. */
const companionsExpanded = ref(false)
const captionExpanded = ref(false)
const captionNeedsMore = ref(false)
const captionEl = ref<HTMLElement | null>(null)
let captionRo: ResizeObserver | null = null

watch(
  () => props.event,
  (e) => {
    localReaction.value = e.my_reaction
    localCounts.value = { ...e.reactions }
  },
)

const title = computed(() => {
  const d = props.event.display
  if (props.event.kind === 'achievement') {
    return achievementAnnouncementTitle(d)
  }
  if (props.event.kind === 'drink_log') return String(d.drink_name ?? 'Drink')
  if (props.event.kind === 'daily') return String(d.title ?? copy.bounty.daily)
  return String(d.title ?? 'Challenge')
})

const subtitle = computed(() => {
  const d = props.event.display
  if (props.event.kind === 'achievement') {
    if (d.description) return String(d.description)
    // Secret masking intentionally omits description; do not invent masking copy for ordinary awards.
    return d.secret === true ? copy.achievements.unlockedCompact : ''
  }
  if (props.event.kind === 'drink_log') return String(d.bar_name ?? '')
  if (props.event.kind === 'daily') return copy.bounty.daily
  return String(d.team_name ?? props.event.owner_team_name ?? '')
})

const achievementDetail = computed(() => {
  if (props.event.kind !== 'achievement') return ''
  const raw = props.event.display.description
  return raw ? String(raw).trim() : ''
})

const byline = computed(() => {
  if (props.event.kind === 'scavenger' || props.event.kind === 'achievement') {
    const name = props.event.owner_player_name
    if (name) return formatCopy(copy.gallery.submittedBy, { playerName: name })
    return props.event.owner_team_name ?? ''
  }
  return props.event.owner_player_name ?? ''
})

const announcementOwner = computed(() =>
  props.game === 'shipit'
    ? props.event.owner_team_name || props.event.owner_player_name || ''
    : props.event.owner_player_name || props.event.owner_team_name || '',
)

const achievementIcon = computed((): { name: SemanticIconKey; source: 'catalog' | 'unassigned' } => {
  const raw = props.event.display.icon_key
  const masked = isSecretMaskedAnnouncement(props.event.display, title.value)
  const resolved = resolveAchievementIconKey(typeof raw === 'string' ? raw : null, { masked })
  if (resolved.ok) return { name: resolved.icon_key, source: 'catalog' }
  // Intentional secret mask uses the generic award glyph; missing catalog keys share that fallback.
  return { name: 'score.achievement', source: 'unassigned' }
})

const clockLabel = computed(() => {
  const shipLocal = props.event.created_ship_local
  return shipLocal ? formatShipWeekdayTime(shipLocal) : ''
})

const captionText = computed(() => props.event.caption?.trim() ?? '')

/** Ordinary Drink It! drink-log social card (compact byline + caption clamp). */
const isDrinkSocialCard = computed(
  () => props.game === 'drinkit' && props.event.kind === 'drink_log',
)

const companionNames = computed(() => {
  if (!isDrinkSocialCard.value) return []
  return sanitizeCompanionNames(props.event.companion_names, {
    excludeName: props.event.owner_player_name,
  })
})

const companionByline = computed(() => compactCompanionByline(companionNames.value))

const expandedCompanionList = computed(() => formatNaturalNameList(companionNames.value))

const usesPlaceholder = computed(
  () => props.game === 'drinkit' && props.event.kind === 'drink_log' && !props.event.photo_id,
)

async function measureCaptionOverflow() {
  await nextTick()
  const el = captionEl.value
  if (!el || !captionText.value) {
    captionNeedsMore.value = false
    return
  }
  const styles = getComputedStyle(el)
  const lineHeight = Number.parseFloat(styles.lineHeight)
  const lh = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 22
  const threeLineMax = lh * 3 + 2
  if (captionExpanded.value) {
    captionNeedsMore.value = el.scrollHeight > threeLineMax
    return
  }
  captionNeedsMore.value = el.scrollHeight > el.clientHeight + 1
}

function toggleCompanionsExpanded() {
  companionsExpanded.value = !companionsExpanded.value
}

function toggleCaptionExpanded() {
  captionExpanded.value = !captionExpanded.value
  void measureCaptionOverflow()
}

watch(captionText, () => {
  captionExpanded.value = false
  void measureCaptionOverflow()
})

watch(companionNames, (names, prev) => {
  if (JSON.stringify(names) !== JSON.stringify(prev)) {
    companionsExpanded.value = false
  }
})

const framedThumb = computed(() => {
  const w = props.event.photo_width
  const h = props.event.photo_height
  if (!(typeof w === 'number' && w > 0 && typeof h === 'number' && h > 0)) return null
  return {
    width: w,
    height: h,
    framing: framingFromWire(props.event.photo_framing, w, h) ?? DEFAULT_PHOTO_FRAMING,
  }
})

async function openPhoto() {
  if (!props.event.photo_id) return
  if (!thumbUrl.value) {
    await reloadSignedUrl()
  }
  const url = thumbUrl.value
  if (!url) return
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
  void measureCaptionOverflow()
  if (typeof ResizeObserver !== 'undefined') {
    captionRo = new ResizeObserver(() => {
      void measureCaptionOverflow()
    })
    if (captionEl.value) captionRo.observe(captionEl.value)
  }
})

watch(captionEl, (el, prev) => {
  if (!captionRo) return
  if (prev) captionRo.unobserve(prev)
  if (el) captionRo.observe(el)
  void measureCaptionOverflow()
})

onBeforeUnmount(() => {
  captionRo?.disconnect()
  captionRo = null
})
</script>

<template>
  <article
    v-if="event.kind === 'achievement'"
    class="gallery-award-post"
    data-testid="gallery-post"
    :data-event-id="event.event_id"
    :data-kind="event.kind"
    :data-submission-id="event.submission_id ?? ''"
  >
    <div class="gallery-award-meta">
      <p>
        <span data-testid="gallery-achievement-owner">{{ announcementOwner }}</span>
        {{ copy.achievements.earned }}
      </p>
      <time
        v-if="clockLabel"
        data-testid="gallery-post-time"
        :datetime="event.created_ship_local ?? undefined"
      >
        {{ clockLabel }}
      </time>
    </div>
    <div class="gallery-award" data-testid="gallery-achievement-card">
      <AppIcon
        :name="achievementIcon.name"
        style-variant="solid"
        class="gallery-award-icon"
        data-testid="gallery-achievement-icon"
        :data-icon-source="achievementIcon.source"
        :data-icon-key="typeof event.display.icon_key === 'string' ? event.display.icon_key : ''"
      />
      <div>
        <h2 class="font-display ui-display-name" data-testid="gallery-post-title">{{ title }}</h2>
        <p v-if="achievementDetail" class="gallery-award-desc" data-testid="gallery-post-subtitle">
          {{ achievementDetail }}
        </p>
      </div>
    </div>
    <ReactionBar
      tone="pill"
      :event-id="event.event_id"
      :reactions="localCounts"
      :my-reaction="localReaction"
      @updated="onReaction"
    />
  </article>

  <article
    v-else
    class="gallery-photo-post"
    data-testid="gallery-post"
    :data-event-id="event.event_id"
    :data-kind="event.kind"
    :data-submission-id="event.submission_id ?? ''"
  >
    <div class="gallery-polaroid">
      <button
        v-if="event.photo_id && thumbUrl"
        type="button"
        class="gallery-polaroid-hit"
        :aria-label="copy.gallery.viewFullPhoto"
        data-testid="gallery-post-photo"
        @click="openPhoto"
      >
        <FramedPhoto
          v-if="framedThumb"
          :src="thumbUrl"
          :width="framedThumb.width"
          :height="framedThumb.height"
          :framing="framedThumb.framing"
          frame-class="gallery-polaroid-photo"
          @error="onPhotoError"
        />
        <img
          v-else
          :src="thumbUrl"
          alt=""
          class="gallery-polaroid-photo"
          @error="onPhotoError"
        />
      </button>
      <div
        v-else-if="event.photo_id && photoState === 'error'"
        class="gallery-polaroid-photo gallery-polaroid-error"
        data-testid="gallery-post-photo-error"
      >
        {{ copy.gallery.loadFailedDetail }}
      </div>
      <div
        v-else-if="event.photo_id"
        class="gallery-polaroid-photo gallery-polaroid-pending animate-pulse"
        data-testid="gallery-post-photo-loading"
      />
      <img
        v-else-if="usesPlaceholder"
        :src="noImageUrl"
        class="gallery-polaroid-photo"
        :alt="copy.wizard.noPhoto"
        data-testid="gallery-post-placeholder"
      />

      <div class="gallery-polaroid-meta">
        <p>
          <span
            data-testid="gallery-post-title"
            :class="event.kind === 'drink_log' ? 'ui-display-name' : ''"
          >
            {{ title }}
          </span>
          <template v-if="subtitle">
            <span aria-hidden="true"> · </span>
            <span
              data-testid="gallery-post-subtitle"
              :class="event.kind === 'drink_log' ? 'ui-display-name' : ''"
            >
              {{ subtitle }}
            </span>
          </template>
        </p>
        <time
          v-if="clockLabel"
          data-testid="gallery-post-time"
          :datetime="event.created_ship_local ?? undefined"
        >
          {{ clockLabel }}
        </time>
      </div>
      <div v-if="isDrinkSocialCard && byline" class="gallery-polaroid-social">
        <p class="gallery-polaroid-byline" data-testid="gallery-post-byline">
          <span class="gallery-polaroid-byline-author">{{ byline }}</span>
          <template v-if="companionByline.mode === 'one'">
            <span class="gallery-polaroid-byline-sep" aria-hidden="true"> · </span>
            <span class="gallery-polaroid-byline-with" data-testid="gallery-post-companions">
              {{ copy.gallery.withCompanionPrefix }} {{ companionByline.name }}
            </span>
          </template>
          <template v-else-if="companionByline.mode === 'two'">
            <span class="gallery-polaroid-byline-sep" aria-hidden="true"> · </span>
            <span class="gallery-polaroid-byline-with" data-testid="gallery-post-companions">
              {{ copy.gallery.withCompanionPrefix }}
              {{ formatNaturalNameList(companionByline.names) }}
            </span>
          </template>
          <template v-else-if="companionByline.mode === 'many'">
            <span class="gallery-polaroid-byline-sep" aria-hidden="true"> · </span>
            <span class="gallery-polaroid-byline-with" data-testid="gallery-post-companions">
              <template v-if="!companionsExpanded">
                {{ copy.gallery.withCompanionPrefix }} {{ companionByline.first }}
                <button
                  type="button"
                  class="gallery-polaroid-inline-control"
                  data-testid="gallery-companions-more"
                  :aria-expanded="false"
                  :aria-label="
                    formatCopy(copy.gallery.moreCompanionsAria, {
                      count: companionByline.remaining,
                    })
                  "
                  @click="toggleCompanionsExpanded"
                >
                  {{ formatCopy(copy.gallery.moreCompanions, { count: companionByline.remaining }) }}
                </button>
              </template>
              <template v-else>
                {{ copy.gallery.withCompanionPrefix }} {{ expandedCompanionList }}
                <button
                  type="button"
                  class="gallery-polaroid-inline-control"
                  data-testid="gallery-companions-less"
                  :aria-expanded="true"
                  :aria-label="copy.gallery.lessCompanionsAria"
                  @click="toggleCompanionsExpanded"
                >
                  {{ copy.gallery.lessCompanions }}
                </button>
              </template>
            </span>
          </template>
        </p>

        <div v-if="captionText" class="gallery-polaroid-caption-block">
          <p
            ref="captionEl"
            class="gallery-polaroid-caption"
            :class="{ 'is-clamped': !captionExpanded }"
            data-testid="gallery-post-caption"
          >
            {{ captionText }}
          </p>
          <button
            v-if="captionNeedsMore || captionExpanded"
            type="button"
            class="gallery-polaroid-caption-toggle"
            data-testid="gallery-caption-toggle"
            :aria-expanded="captionExpanded"
            @click="toggleCaptionExpanded"
          >
            {{ captionExpanded ? copy.gallery.showLess : copy.gallery.readMore }}
          </button>
        </div>
      </div>
      <template v-else>
        <p v-if="byline" class="gallery-polaroid-by">{{ byline }}</p>
        <p v-if="captionText" class="gallery-polaroid-caption" data-testid="gallery-post-caption">
          {{ captionText }}
        </p>
      </template>
    </div>

    <ReactionBar
      tone="pill"
      :event-id="event.event_id"
      :reactions="localCounts"
      :my-reaction="localReaction"
      @updated="onReaction"
    />
  </article>
</template>
