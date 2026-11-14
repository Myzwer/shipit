<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { isNotAuthenticatedError } from '@/lib/authFailure'
import { setGalleryReaction } from '@/lib/gallery/api'
import { useSessionStore } from '@/stores/session'
import type { GalleryReactionCounts, GalleryReactionEmoji } from '@/types/gallery'
import { copy } from '@/ui/copy'

const props = withDefaults(
  defineProps<{
    eventId: string
    reactions: GalleryReactionCounts
    myReaction: GalleryReactionEmoji | null
    tone?: 'default' | 'pill'
  }>(),
  { tone: 'default' },
)

const emit = defineEmits<{
  updated: [payload: { my_reaction: GalleryReactionEmoji | null; reactions: GalleryReactionCounts }]
}>()

const router = useRouter()
const session = useSessionStore()

const busy = ref(false)
const error = ref<string | null>(null)
const burst = ref<{ id: GalleryReactionEmoji; token: number } | null>(null)
let burstToken = 0
let burstTimer = 0

const options: Array<{ id: GalleryReactionEmoji; glyph: string; label: string }> = [
  { id: 'heart', glyph: '❤️', label: copy.gallery.reactionHeart },
  { id: 'laugh', glyph: '😂', label: copy.gallery.reactionLaugh },
  { id: 'hang_loose', glyph: '🤙', label: copy.gallery.reactionHangLoose },
]

function motionAllowed(): boolean {
  return (
    typeof window.matchMedia !== 'function' ||
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function playBurst(emoji: GalleryReactionEmoji) {
  if (!motionAllowed()) return
  burstToken += 1
  const token = burstToken
  burst.value = { id: emoji, token }
  window.clearTimeout(burstTimer)
  burstTimer = window.setTimeout(() => {
    if (burst.value?.token === token) burst.value = null
  }, 900)
}

onUnmounted(() => window.clearTimeout(burstTimer))

async function forceReLogin() {
  await session.signOut()
  await router.replace({ name: 'login', query: { reason: 'expired' } })
}

async function toggle(emoji: GalleryReactionEmoji) {
  if (busy.value) return
  busy.value = true
  error.value = null

  const previous = {
    my_reaction: props.myReaction,
    reactions: { ...props.reactions },
  }
  const nextEmoji = props.myReaction === emoji ? null : emoji
  // Optimistic
  const optimistic = { ...props.reactions }
  if (props.myReaction) optimistic[props.myReaction] = Math.max(0, optimistic[props.myReaction] - 1)
  if (nextEmoji) optimistic[nextEmoji] = (optimistic[nextEmoji] ?? 0) + 1
  if (nextEmoji) playBurst(nextEmoji)
  emit('updated', { my_reaction: nextEmoji, reactions: optimistic })

  try {
    const saved = await setGalleryReaction(props.eventId, nextEmoji)
    emit('updated', saved)
  } catch (err) {
    emit('updated', previous)
    if (isNotAuthenticatedError(err)) {
      await forceReLogin()
      return
    }
    error.value = copy.gallery.reactionFailed
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div data-testid="gallery-reactions">
    <div :class="tone === 'pill' ? 'gallery-react-row' : 'mt-3 flex items-center gap-2'">
      <div
        v-for="opt in options"
        :key="opt.id"
        class="gallery-react-slot"
        :class="{ 'is-pill': tone === 'pill' }"
      >
        <button
          type="button"
          :class="
            tone === 'pill'
              ? ['gallery-react-pill', myReaction === opt.id ? 'is-selected' : '']
              : [
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm',
                  myReaction === opt.id ? 'ring-2 ring-[var(--theme-primary)]' : '',
                ]
          "
          :style="tone === 'pill' ? undefined : { background: 'var(--theme-gradient-warm)' }"
          :aria-label="opt.label"
          :aria-pressed="myReaction === opt.id"
          :data-testid="`gallery-react-${opt.id}`"
          :disabled="busy"
          @click="toggle(opt.id)"
        >
          <span class="gallery-react-glyph-wrap">
            <span class="gallery-react-glyph" aria-hidden="true">{{ opt.glyph }}</span>
          </span>
          <span
            class="font-semibold tabular-nums"
            :style="tone === 'pill' ? undefined : { color: 'var(--theme-ink)' }"
          >
            {{ reactions[opt.id] ?? 0 }}
          </span>
        </button>
        <span
          v-if="burst?.id === opt.id"
          :key="`float-${burst.token}`"
          class="gallery-react-float"
          aria-hidden="true"
          data-testid="gallery-react-float"
        >
          <span class="gallery-react-float-glyph" aria-hidden="true">{{ opt.glyph }}</span>
        </span>
      </div>
    </div>
    <p
      v-if="error"
      class="gallery-react-error"
      data-testid="gallery-reaction-error"
    >
      {{ error }}
    </p>
  </div>
</template>
