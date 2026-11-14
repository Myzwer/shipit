<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  DEFAULT_PHOTO_FRAMING,
  PHOTO_FRAMING_MAX_ZOOM,
  PHOTO_FRAMING_MIN_ZOOM,
  clampFraming,
  cloneFraming,
  framedImageStyle,
  panFramingByDelta,
  zoomFramingAt,
  type PhotoFraming,
} from '@/lib/media/framing'
import { copy } from '@/ui/copy'

const props = defineProps<{
  src: string
  width: number
  height: number
  initialFraming?: PhotoFraming | null
}>()

const emit = defineEmits<{
  accept: [framing: PhotoFraming]
  cancel: []
}>()

const framing = ref<PhotoFraming>(
  clampFraming(props.width, props.height, props.initialFraming ?? DEFAULT_PHOTO_FRAMING),
)
const stageEl = ref<HTMLElement | null>(null)
const frameSize = ref(280)
const preferReducedMotion = ref(false)

type ActivePointer = { id: number; x: number; y: number }
const pointers = ref<Map<number, ActivePointer>>(new Map())
const pinchStart = ref<{ distance: number; zoom: number } | null>(null)
const dragging = ref(false)

const imgStyle = computed(() =>
  framedImageStyle(props.width, props.height, framing.value),
)

watch(
  () => [props.width, props.height, props.initialFraming] as const,
  () => {
    framing.value = clampFraming(
      props.width,
      props.height,
      props.initialFraming ?? framing.value,
    )
  },
)

function measure() {
  const el = stageEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  frameSize.value = Math.min(rect.width, rect.height) || 280
}

function onResize() {
  measure()
}

function setPointer(ev: PointerEvent) {
  pointers.value.set(ev.pointerId, { id: ev.pointerId, x: ev.clientX, y: ev.clientY })
}

function clearPointer(ev: PointerEvent) {
  pointers.value.delete(ev.pointerId)
}

function pinchDistance(): number | null {
  if (pointers.value.size < 2) return null
  const pts = [...pointers.value.values()]
  const a = pts[0]!
  const b = pts[1]!
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function onPointerDown(ev: PointerEvent) {
  ev.preventDefault()
  stageEl.value?.setPointerCapture(ev.pointerId)
  setPointer(ev)
  if (pointers.value.size === 2) {
    const d = pinchDistance()
    if (d && d > 0) {
      pinchStart.value = { distance: d, zoom: framing.value.zoom }
    }
    dragging.value = false
  } else if (pointers.value.size === 1) {
    pinchStart.value = null
    dragging.value = true
  }
}

function onPointerMove(ev: PointerEvent) {
  if (!pointers.value.has(ev.pointerId)) return
  ev.preventDefault()
  const prev = pointers.value.get(ev.pointerId)!
  const dx = ev.clientX - prev.x
  const dy = ev.clientY - prev.y
  setPointer(ev)

  if (pointers.value.size >= 2 && pinchStart.value) {
    const d = pinchDistance()
    if (d && pinchStart.value.distance > 0) {
      const ratio = d / pinchStart.value.distance
      framing.value = zoomFramingAt(
        props.width,
        props.height,
        framing.value,
        pinchStart.value.zoom * ratio,
      )
    }
    return
  }

  if (dragging.value && pointers.value.size === 1) {
    framing.value = panFramingByDelta(
      props.width,
      props.height,
      framing.value,
      frameSize.value,
      dx,
      dy,
    )
  }
}

function onPointerUp(ev: PointerEvent) {
  clearPointer(ev)
  try {
    stageEl.value?.releasePointerCapture(ev.pointerId)
  } catch {
    /* already released */
  }
  if (pointers.value.size < 2) pinchStart.value = null
  if (pointers.value.size === 0) dragging.value = false
}

function onWheel(ev: WheelEvent) {
  ev.preventDefault()
  const factor = ev.deltaY > 0 ? 0.92 : 1.08
  framing.value = zoomFramingAt(
    props.width,
    props.height,
    framing.value,
    framing.value.zoom * factor,
  )
}

function onKeydown(ev: KeyboardEvent) {
  if (ev.key === 'Escape') {
    ev.preventDefault()
    emit('cancel')
    return
  }
  const step = ev.shiftKey ? 0.04 : 0.02
  const zoomStep = ev.shiftKey ? 0.15 : 0.08
  let next = cloneFraming(framing.value)
  if (ev.key === 'ArrowLeft') next.centerX -= step
  else if (ev.key === 'ArrowRight') next.centerX += step
  else if (ev.key === 'ArrowUp') next.centerY -= step
  else if (ev.key === 'ArrowDown') next.centerY += step
  else if (ev.key === '+' || ev.key === '=') next.zoom += zoomStep
  else if (ev.key === '-' || ev.key === '_') next.zoom -= zoomStep
  else return
  ev.preventDefault()
  framing.value = clampFraming(props.width, props.height, next)
}

function accept() {
  emit(
    'accept',
    clampFraming(props.width, props.height, framing.value),
  )
}

onMounted(() => {
  preferReducedMotion.value =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  measure()
  window.addEventListener('resize', onResize)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div
    class="photo-framing-editor fixed inset-0 z-[80] flex flex-col"
    role="dialog"
    aria-modal="true"
    aria-labelledby="photo-framing-title"
    data-testid="photo-framing-editor"
    @touchmove.prevent
  >
    <div
      class="mx-auto flex min-h-0 w-full max-w-md flex-1 flex-col px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]"
    >
      <header class="shrink-0 pb-3 pt-1 text-center">
        <h2
          id="photo-framing-title"
          class="font-display text-lg font-bold text-white"
        >
          {{ copy.photo.framingTitle }}
        </h2>
        <p class="mt-1 text-xs text-white/75" data-testid="photo-framing-hint">
          {{ copy.photo.framingHint }}
        </p>
      </header>

      <div class="photo-framing-workspace flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <div
          ref="stageEl"
          class="photo-framing-stage relative aspect-square w-full max-h-[min(72vh,100%)] max-w-[min(100%,72vh)] touch-none select-none"
          data-testid="photo-framing-stage"
          :class="preferReducedMotion ? '' : 'photo-framing-stage--live'"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @wheel.prevent="onWheel"
        >
          <img
            :src="src"
            alt=""
            class="photo-framing-image"
            :style="imgStyle"
            draggable="false"
            data-testid="photo-framing-image"
          />
          <div
            class="photo-framing-window"
            aria-hidden="true"
            data-testid="photo-framing-mask"
          />
        </div>
      </div>

      <p class="sr-only" aria-live="polite">
        Zoom {{ framing.zoom.toFixed(2) }} of {{ PHOTO_FRAMING_MAX_ZOOM }}.
        Minimum {{ PHOTO_FRAMING_MIN_ZOOM }}.
      </p>

      <div class="mt-4 flex shrink-0 flex-col gap-2">
        <button
          type="button"
          class="rounded-full py-3.5 text-sm font-semibold text-white"
          style="background: var(--theme-primary)"
          data-testid="photo-framing-use"
          @click="accept"
        >
          {{ copy.photo.usePhoto }}
        </button>
        <button
          type="button"
          class="rounded-full py-3 text-sm font-semibold text-white/90"
          data-testid="photo-framing-cancel"
          @click="emit('cancel')"
        >
          {{ copy.photo.framingCancel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.photo-framing-editor {
  /* Solid scrim so Teleport-to-body still reads as a full overlay
     even when theme CSS variables are not on <body>. */
  background: rgb(18 14 16 / 0.92);
  color: var(--theme-ink, #1c1418);
}

.photo-framing-workspace {
  /* Keep dimmed out-of-crop pixels visible but clipped to the card. */
  border-radius: 1rem;
}

.photo-framing-stage {
  touch-action: none;
  overflow: visible;
}

.photo-framing-image {
  will-change: left, top, width, height;
}

.photo-framing-stage--live .photo-framing-image {
  transition: none;
}

.photo-framing-window {
  pointer-events: none;
  position: absolute;
  inset: 0;
  border: 1.5px solid rgb(255 255 255 / 0.9);
  border-radius: 0.2rem;
  /* Darken everything outside the square while leaving the crop bright. */
  box-shadow: 0 0 0 9999px rgb(0 0 0 / 0.55);
}
</style>
