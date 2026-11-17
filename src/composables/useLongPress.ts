import { onUnmounted } from 'vue'

const DEFAULT_MS = 550
const MOVE_TOLERANCE_PX = 12
/** Fallback if the browser never synthesizes a click after a hold. */
const SUPPRESS_FALLBACK_MS = 450

export interface LongPressHandlers {
  onPointerDown: (event: PointerEvent) => void
  onPointerMove: (event: PointerEvent) => void
  onPointerUp: (event: PointerEvent) => void
  onPointerCancel: (event: PointerEvent) => void
  onClickCapture: (event: MouseEvent) => void
  onContextMenu: (event: Event) => void
}

/**
 * Long-press (~550ms) without interfering with short taps or scroll.
 * When the hold fires, the subsequent click is suppressed.
 */
export function useLongPress(
  onLongPress: () => void,
  options?: { ms?: number },
): LongPressHandlers {
  const holdMs = options?.ms ?? DEFAULT_MS
  let timer: number | null = null
  let suppressFallback: number | null = null
  let startX = 0
  let startY = 0
  let activePointer: number | null = null
  let fired = false
  let suppressClick = false

  function clearTimer() {
    if (timer != null) {
      window.clearTimeout(timer)
      timer = null
    }
  }

  function clearSuppressFallback() {
    if (suppressFallback != null) {
      window.clearTimeout(suppressFallback)
      suppressFallback = null
    }
  }

  function armSuppressFallback() {
    clearSuppressFallback()
    suppressFallback = window.setTimeout(() => {
      suppressFallback = null
      suppressClick = false
      fired = false
    }, SUPPRESS_FALLBACK_MS)
  }

  function resetPointer() {
    clearTimer()
    activePointer = null
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    resetPointer()
    clearSuppressFallback()
    fired = false
    suppressClick = false
    activePointer = event.pointerId
    startX = event.clientX
    startY = event.clientY
    timer = window.setTimeout(() => {
      timer = null
      if (activePointer !== event.pointerId) return
      fired = true
      suppressClick = true
      onLongPress()
      armSuppressFallback()
    }, holdMs)
  }

  function onPointerMove(event: PointerEvent) {
    if (activePointer !== event.pointerId || timer == null) return
    const dx = Math.abs(event.clientX - startX)
    const dy = Math.abs(event.clientY - startY)
    if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) {
      resetPointer()
    }
  }

  function onPointerUp(event: PointerEvent) {
    if (activePointer !== event.pointerId) return
    resetPointer()
    if (!fired) {
      suppressClick = false
    }
  }

  function onPointerCancel(event: PointerEvent) {
    if (activePointer !== event.pointerId) return
    const wasFired = fired
    resetPointer()
    if (!wasFired) {
      suppressClick = false
      fired = false
      clearSuppressFallback()
    }
  }

  function onClickCapture(event: MouseEvent) {
    if (!suppressClick) return
    event.preventDefault()
    event.stopImmediatePropagation()
    suppressClick = false
    fired = false
    clearSuppressFallback()
  }

  function onContextMenu(event: Event) {
    event.preventDefault()
  }

  onUnmounted(() => {
    resetPointer()
    clearSuppressFallback()
    suppressClick = false
    fired = false
  })

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onClickCapture,
    onContextMenu,
  }
}
