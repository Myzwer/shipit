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

const props = withDefaults(
  defineProps<{
    open: boolean
    groups: GalleryReactionAuthorGroup[]
    loading?: boolean
    error?: string | null
    /** Game theme on the teleported root so ink/focus tokens resolve. */
    themeClass?: string
  }>(),
  {
    loading: false,
    error: null,
    themeClass: 'theme-drink',
  },
)

const emit = defineEmits<{
  close: []
}>()

const dialogEl = ref<HTMLElement | null>(null)
const closeBtn = ref<HTMLButtonElement | null>(null)
const previouslyFocused = ref<HTMLElement | null>(null)

const displayGroups = computed(() => normalizeReactionAuthorGroups(props.groups))
const populatedGroups = computed(() =>
  displayGroups.value.filter((group) => group.authors.length > 0),
)
const isEmpty = computed(
  () => !props.loading && !props.error && reactionAuthorsAreEmpty(displayGroups.value),
)

interface ScrollSnapshot {
  active: boolean
  scrollY: number
  htmlOverflow: string
  bodyOverflow: string
  bodyPosition: string
  bodyTop: string
  bodyWidth: string
}

const scrollSnapshot: ScrollSnapshot = {
  active: false,
  scrollY: 0,
  htmlOverflow: '',
  bodyOverflow: '',
  bodyPosition: '',
  bodyTop: '',
  bodyWidth: '',
}

function lockBackgroundScroll() {
  if (scrollSnapshot.active || typeof document === 'undefined') return
  const html = document.documentElement
  const body = document.body
  scrollSnapshot.active = true
  scrollSnapshot.scrollY = window.scrollY || 0
  scrollSnapshot.htmlOverflow = html.style.overflow
  scrollSnapshot.bodyOverflow = body.style.overflow
  scrollSnapshot.bodyPosition = body.style.position
  scrollSnapshot.bodyTop = body.style.top
  scrollSnapshot.bodyWidth = body.style.width
  html.style.overflow = 'hidden'
  body.style.overflow = 'hidden'
  body.style.position = 'fixed'
  body.style.top = `-${scrollSnapshot.scrollY}px`
  body.style.width = '100%'
}

function unlockBackgroundScroll() {
  if (!scrollSnapshot.active || typeof document === 'undefined') return
  const html = document.documentElement
  const body = document.body
  const y = scrollSnapshot.scrollY
  html.style.overflow = scrollSnapshot.htmlOverflow
  body.style.overflow = scrollSnapshot.bodyOverflow
  body.style.position = scrollSnapshot.bodyPosition
  body.style.top = scrollSnapshot.bodyTop
  body.style.width = scrollSnapshot.bodyWidth
  scrollSnapshot.active = false
  window.scrollTo(0, y)
}

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
      lockBackgroundScroll()
      previouslyFocused.value =
        document.activeElement instanceof HTMLElement ? document.activeElement : null
      void focusClose()
    } else {
      unlockBackgroundScroll()
      if (previouslyFocused.value) {
        previouslyFocused.value.focus()
        previouslyFocused.value = null
      }
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  if (props.open) lockBackgroundScroll()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  unlockBackgroundScroll()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="dialogEl"
      :class="['reaction-authors-root', themeClass]"
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
              v-for="(group, index) in populatedGroups"
              :key="group.emoji"
              class="reaction-authors-group"
              :class="{ 'is-first': index === 0 }"
              :data-testid="`gallery-reaction-authors-group-${group.emoji}`"
            >
              <h3 class="reaction-authors-group-title">
                <span>{{ reactionAuthorGroupLabel(group.emoji) }}</span>
                <span class="reaction-authors-group-glyph" aria-hidden="true">{{
                  reactionAuthorGlyph(group.emoji)
                }}</span>
              </h3>
              <ul
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
            </section>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/*
  Teleported to body, outside .theme-drink / .theme-ship.
  A gradient token (--theme-gradient-warm) does not resolve there, so the
  previous background computed to transparent and the gallery plus bottom
  nav showed through the card. This fill is the Drink It aqua surface token,
  with a literal fallback so the card stays opaque.
  Overlay sits above header (z-20), bottom nav (z-30), and photo viewer (z-50),
  and below the achievement celebration (z-80).
*/
.reaction-authors-root {
  position: fixed;
  inset: 0;
  z-index: 70;
  isolation: isolate;
  display: grid;
  place-items: center;
  padding-top: max(0.75rem, env(safe-area-inset-top, 0px));
  padding-right: max(0.75rem, env(safe-area-inset-right, 0px));
  padding-bottom: max(0.75rem, env(safe-area-inset-bottom, 0px));
  padding-left: max(0.75rem, env(safe-area-inset-left, 0px));
  pointer-events: auto;
}

.reaction-authors-backdrop {
  position: absolute;
  inset: 0;
  z-index: 0;
  margin: 0;
  border: 0;
  padding: 0;
  background: color-mix(in srgb, var(--color-ink, #1f2933) 58%, transparent);
  cursor: pointer;
}

.reaction-authors-card {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(19rem, 100%);
  max-height: min(
    32rem,
    calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 1.5rem)
  );
  flex-direction: column;
  overflow: hidden;
  border-radius: 1.25rem;
  background-color: #d7f3f1;
  background-color: var(--color-drink-surface, #d7f3f1);
  background-image: none;
  color: var(--theme-ink, var(--color-ink, #1f2933));
  box-shadow: 0 16px 40px rgba(31, 41, 51, 0.32);
}

.reaction-authors-header {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: flex-end;
  padding: 0.35rem 0.45rem 0;
}

.reaction-authors-title {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.reaction-authors-close {
  flex-shrink: 0;
  min-height: 2.75rem;
  min-width: 2.75rem;
  border: 0;
  border-radius: 999px;
  padding: 0.4rem 0.8rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: inherit;
  background: transparent;
  cursor: pointer;
}

.reaction-authors-close:focus-visible {
  outline: 2px solid var(--theme-primary, var(--color-drink-primary, #0a5c6b));
  outline-offset: 2px;
}

.reaction-authors-body {
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
  padding: 0.15rem 1.2rem 1.2rem;
}

.reaction-authors-status {
  margin: 0.85rem 0 0.35rem;
  font-size: 0.95rem;
  line-height: 1.4;
  text-align: center;
  color: var(--theme-muted, var(--color-drink-muted, #5b6770));
}

.reaction-authors-group {
  padding-top: 0.95rem;
  margin-top: 0.85rem;
  border-top: 1px solid rgba(31, 41, 51, 0.42);
}

.reaction-authors-group.is-first {
  margin-top: 0;
  padding-top: 0.15rem;
  border-top: 0;
}

.reaction-authors-group-title {
  margin: 0 0 0.55rem;
  font-size: 1.2rem;
  font-weight: 700;
  line-height: 1.25;
  text-align: center;
}

.reaction-authors-group-glyph {
  margin-left: 0.28rem;
}

.reaction-authors-list {
  margin: 0;
  padding: 0 0.15rem;
  list-style: none;
  text-align: left;
}

.reaction-authors-name {
  padding: 0.18rem 0;
  font-size: 1rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
</style>
