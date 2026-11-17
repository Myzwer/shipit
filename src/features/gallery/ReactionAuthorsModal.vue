<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  normalizeReactionAuthorGroups,
  reactionAuthorGlyph,
  reactionAuthorGroupLabel,
  reactionAuthorsAreEmpty,
  type GalleryReactionAuthorGroup,
} from '@/lib/gallery/reactionAuthors'
import { copy } from '@/ui/copy'

const props = defineProps<{
  open: boolean
  groups: GalleryReactionAuthorGroup[]
  loading?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  close: []
}>()

const dialogEl = ref<HTMLElement | null>(null)
const closeBtn = ref<HTMLButtonElement | null>(null)
const previouslyFocused = ref<HTMLElement | null>(null)

const displayGroups = computed(() => normalizeReactionAuthorGroups(props.groups))
const isEmpty = computed(
  () => !props.loading && !props.error && reactionAuthorsAreEmpty(displayGroups.value),
)

function onClose() {
  emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    onClose()
    return
  }
  if (e.key !== 'Tab' || !dialogEl.value) return
  const focusable = dialogEl.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  )
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (e.shiftKey && active === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && active === last) {
    e.preventDefault()
    first.focus()
  }
}

async function focusClose() {
  await nextTick()
  closeBtn.value?.focus()
}

watch(
  () => props.open,
  (isOpen) => {
    if (isOpen) {
      previouslyFocused.value =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      void focusClose()
    } else if (previouslyFocused.value) {
      previouslyFocused.value.focus()
      previouslyFocused.value = null
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="dialogEl"
      class="reaction-authors-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reaction-authors-title"
      data-testid="gallery-reaction-authors-modal"
    >
      <button
        type="button"
        class="reaction-authors-backdrop"
        :aria-label="copy.gallery.reactionAuthorsClose"
        data-testid="gallery-reaction-authors-backdrop"
        @click="onClose"
      />
      <div class="reaction-authors-card" data-testid="gallery-reaction-authors-card">
        <div class="reaction-authors-header">
          <h2 id="reaction-authors-title" class="reaction-authors-title">
            {{ copy.gallery.reactionAuthorsTitle }}
          </h2>
          <button
            ref="closeBtn"
            type="button"
            class="reaction-authors-close"
            data-testid="gallery-reaction-authors-close"
            :aria-label="copy.gallery.reactionAuthorsClose"
            @click="onClose"
          >
            {{ copy.gallery.reactionAuthorsClose }}
          </button>
        </div>

        <div class="reaction-authors-body" data-testid="gallery-reaction-authors-body">
          <p
            v-if="loading"
            class="reaction-authors-status"
            data-testid="gallery-reaction-authors-loading"
          >
            {{ copy.gallery.reactionAuthorsLoading }}
          </p>
          <p
            v-else-if="error"
            class="reaction-authors-status"
            data-testid="gallery-reaction-authors-error"
          >
            {{ error }}
          </p>
          <p
            v-else-if="isEmpty"
            class="reaction-authors-status"
            data-testid="gallery-reaction-authors-empty"
          >
            {{ copy.gallery.reactionAuthorsEmpty }}
          </p>
          <template v-else>
            <section
              v-for="(group, index) in displayGroups"
              :key="group.emoji"
              class="reaction-authors-group"
              :class="{ 'is-first': index === 0 }"
              :data-testid="`gallery-reaction-authors-group-${group.emoji}`"
            >
              <h3 class="reaction-authors-group-title">
                <span aria-hidden="true">{{ reactionAuthorGlyph(group.emoji) }}</span>
                {{ reactionAuthorGroupLabel(group.emoji) }}
              </h3>
              <ul
                v-if="group.authors.length"
                class="reaction-authors-list"
                :data-testid="`gallery-reaction-authors-list-${group.emoji}`"
              >
                <li
                  v-for="name in group.authors"
                  :key="`${group.emoji}-${name}`"
                  class="reaction-authors-name"
                >
                  {{ name }}
                </li>
              </ul>
              <p
                v-else
                class="reaction-authors-none"
                :data-testid="`gallery-reaction-authors-none-${group.emoji}`"
              >
                {{ copy.gallery.reactionAuthorsNone }}
              </p>
            </section>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.reaction-authors-root {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 1rem 1rem 1.5rem;
}

@media (min-width: 640px) {
  .reaction-authors-root {
    align-items: center;
  }
}

.reaction-authors-backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.45);
  cursor: pointer;
}

.reaction-authors-card {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  max-width: 22rem;
  max-height: min(70vh, 32rem);
  flex-direction: column;
  overflow: hidden;
  border-radius: 1.25rem;
  background: var(--theme-gradient-warm);
  color: var(--theme-ink);
  box-shadow: 0 16px 36px rgba(40, 24, 12, 0.28);
}

.reaction-authors-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1rem 0.65rem;
  border-bottom: 1px solid color-mix(in srgb, var(--theme-ink) 12%, transparent);
}

.reaction-authors-title {
  margin: 0;
  font-family: var(--font-display, inherit);
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1.25;
}

.reaction-authors-close {
  flex-shrink: 0;
  min-height: 2.5rem;
  min-width: 2.75rem;
  border-radius: 999px;
  padding: 0.45rem 0.85rem;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--theme-ink);
  background: transparent;
}

.reaction-authors-close:focus-visible {
  outline: 2px solid var(--theme-primary);
  outline-offset: 2px;
}

.reaction-authors-body {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 0.35rem 1rem 1.1rem;
}

.reaction-authors-status {
  margin: 0.75rem 0 0.35rem;
  font-size: 0.9rem;
  line-height: 1.4;
  color: var(--theme-muted);
}

.reaction-authors-group {
  padding: 0.75rem 0 0.15rem;
  border-top: 1px solid color-mix(in srgb, var(--theme-ink) 10%, transparent);
}

.reaction-authors-group.is-first {
  border-top: 0;
}

.reaction-authors-group-title {
  margin: 0 0 0.4rem;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.3;
}

.reaction-authors-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.reaction-authors-name {
  padding: 0.28rem 0;
  font-size: 0.95rem;
  line-height: 1.35;
}

.reaction-authors-none {
  margin: 0;
  font-size: 0.85rem;
  color: var(--theme-muted);
}
</style>
