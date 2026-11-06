<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { copy } from '@/ui/copy'

const props = defineProps<{
  src: string
  downloadName?: string
}>()

const emit = defineEmits<{
  close: []
}>()

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

async function download() {
  try {
    const res = await fetch(props.src)
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
    window.open(props.src, '_blank', 'noopener')
  }
}

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))
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
        :src="src"
        alt=""
        class="max-h-full max-w-full object-contain"
        data-testid="gallery-photo-full"
      />
    </div>
  </div>
</template>
