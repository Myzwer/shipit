<script setup lang="ts">
import { ref } from 'vue'
import { setGalleryReaction } from '@/lib/gallery/api'
import type { GalleryReactionCounts, GalleryReactionEmoji } from '@/types/gallery'
import { copy } from '@/ui/copy'

const props = defineProps<{
  eventId: string
  reactions: GalleryReactionCounts
  myReaction: GalleryReactionEmoji | null
}>()

const emit = defineEmits<{
  updated: [payload: { my_reaction: GalleryReactionEmoji | null; reactions: GalleryReactionCounts }]
}>()

const busy = ref(false)
const error = ref<string | null>(null)

const options: Array<{ id: GalleryReactionEmoji; glyph: string; label: string }> = [
  { id: 'heart', glyph: '❤️', label: copy.gallery.reactionHeart },
  { id: 'laugh', glyph: '😂', label: copy.gallery.reactionLaugh },
  { id: 'hang_loose', glyph: '🤙', label: copy.gallery.reactionHangLoose },
]

async function toggle(emoji: GalleryReactionEmoji) {
  if (busy.value) return
  const previous = {
    my_reaction: props.myReaction,
    reactions: { ...props.reactions },
  }
  const nextEmoji = props.myReaction === emoji ? null : emoji
  // Optimistic
  const optimistic = { ...props.reactions }
  if (props.myReaction) optimistic[props.myReaction] = Math.max(0, optimistic[props.myReaction] - 1)
  if (nextEmoji) optimistic[nextEmoji] = (optimistic[nextEmoji] ?? 0) + 1
  emit('updated', { my_reaction: nextEmoji, reactions: optimistic })

  busy.value = true
  error.value = null
  try {
    const saved = await setGalleryReaction(props.eventId, nextEmoji)
    emit('updated', saved)
  } catch {
    emit('updated', previous)
    error.value = copy.gallery.reactionFailed
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="mt-3" data-testid="gallery-reactions">
    <div class="flex items-center gap-2">
      <button
        v-for="opt in options"
        :key="opt.id"
        type="button"
        class="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm"
        :class="myReaction === opt.id ? 'ring-2 ring-[var(--theme-primary)]' : ''"
        style="background: var(--theme-page)"
        :aria-label="opt.label"
        :aria-pressed="myReaction === opt.id"
        :data-testid="`gallery-react-${opt.id}`"
        :disabled="busy"
        @click="toggle(opt.id)"
      >
        <span aria-hidden="true">{{ opt.glyph }}</span>
        <span class="font-semibold tabular-nums" style="color: var(--theme-ink)">
          {{ reactions[opt.id] ?? 0 }}
        </span>
      </button>
    </div>
    <p
      v-if="error"
      class="mt-1 text-xs"
      style="color: var(--theme-muted)"
      data-testid="gallery-reaction-error"
    >
      {{ error }}
    </p>
  </div>
</template>
