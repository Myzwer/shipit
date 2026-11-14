<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { signGalleryPhotoCoalesced } from '@/lib/gallery/signedPhotoLifecycle'
import { copy } from '@/ui/copy'
import type { GameId } from '@/types/game'

const props = defineProps<{
  src: string
  photoId?: string
  game?: GameId
  downloadName?: string
}>()

const emit = defineEmits<{
  close: []
}>()

const displaySrc = ref(props.src)
let recoverAttempts = 0
let recovering = false
let stopped = false
/** Heuristic: parent usually opens with a freshly minted (or reused) thumb URL. */
let proactiveTimer: ReturnType<typeof setTimeout> | null = null
const PROACTIVE_MS = 51 * 60_000
const MAX_RECOVER = 3

function clearProactive() {
  if (proactiveTimer) {
    clearTimeout(proactiveTimer)
    proactiveTimer = null
  }
}

function scheduleProactive() {
  clearProactive()
  if (!props.game || !props.photoId) return
  proactiveTimer = setTimeout(() => {
    proactiveTimer = null
    void renew('proactive')
  }, PROACTIVE_MS)
}

async function renew(_reason: 'error' | 'proactive' | 'online' | 'visibility') {
  if (stopped || recovering || !props.game || !props.photoId) return
  if (_reason === 'error' && recoverAttempts >= MAX_RECOVER) return
  recovering = true
  if (_reason === 'error') recoverAttempts += 1
  try {
    const outcome = await signGalleryPhotoCoalesced(props.game, props.photoId)
    if (stopped) return
    if (outcome.ok) {
      displaySrc.value = outcome.url
      recoverAttempts = 0
      scheduleProactive()
    } else if (outcome.permanent) {
      recoverAttempts = MAX_RECOVER
    }
  } finally {
    recovering = false
  }
}

function handlePhotoError() {
  void renew('error')
}

function onOnline() {
  if (recoverAttempts > 0) void renew('online')
}

function onVisibility() {
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  if (recoverAttempts > 0) void renew('visibility')
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

async function download() {
  try {
    const res = await fetch(displaySrc.value)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = props.downloadName || 'gallery-photo.jpg'
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  } catch {
    window.open(displaySrc.value, '_blank', 'noopener')
  }
}

watch(
  () => props.src,
  (next) => {
    displaySrc.value = next
    recoverAttempts = 0
    scheduleProactive()
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('online', onOnline)
  document.addEventListener('visibilitychange', onVisibility)
  scheduleProactive()
})

onUnmounted(() => {
  stopped = true
  clearProactive()
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('online', onOnline)
  document.removeEventListener('visibilitychange', onVisibility)
})
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex flex-col bg-black/95"
    data-testid="gallery-photo-viewer"
    role="dialog"
    aria-modal="true"
    :aria-label="copy.gallery.viewFullPhoto"
  >
    <div class="flex items-center justify-between px-4 py-3">
      <button
        type="button"
        class="rounded-full px-3 py-2 text-sm font-semibold text-white"
        data-testid="gallery-photo-close"
        :aria-label="copy.gallery.closePhoto"
        @click="emit('close')"
      >
        {{ copy.gallery.closePhoto }}
      </button>
      <button
        type="button"
        class="rounded-full px-3 py-2 text-sm font-semibold text-white"
        data-testid="gallery-photo-download"
        :aria-label="copy.gallery.downloadPhoto"
        @click="download"
      >
        {{ copy.gallery.downloadPhoto }}
      </button>
    </div>
    <div class="flex min-h-0 flex-1 items-center justify-center px-3 pb-8">
      <img
        :src="displaySrc"
        alt=""
        class="max-h-full max-w-full object-contain"
        data-testid="gallery-photo-full"
        @error="handlePhotoError"
      />
    </div>
  </div>
</template>
