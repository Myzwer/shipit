/**
 * Non-destructive square photo framing.
 *
 * Model (size-independent):
 * - zoom >= 1: 1 = cover-fit (crop side = min(width, height))
 * - centerX / centerY in [0, 1]: crop center in image space
 *
 * Rendering uses percentage layout so thumbs of any CSS size match.
 */

export interface PhotoFraming {
  zoom: number
  centerX: number
  centerY: number
}

/** Wire format from RPCs / gallery feed. */
export interface PhotoFramingWire {
  zoom: number
  center_x: number
  center_y: number
}

export const PHOTO_FRAMING_MIN_ZOOM = 1
export const PHOTO_FRAMING_MAX_ZOOM = 4

export const DEFAULT_PHOTO_FRAMING: PhotoFraming = Object.freeze({
  zoom: 1,
  centerX: 0.5,
  centerY: 0.5,
})

export function cloneFraming(framing: PhotoFraming = DEFAULT_PHOTO_FRAMING): PhotoFraming {
  return { zoom: framing.zoom, centerX: framing.centerX, centerY: framing.centerY }
}

/** Normalize wire or local framing into PhotoFraming (unclamped). */
export function normalizeFramingInput(
  input: PhotoFraming | PhotoFramingWire | null | undefined,
): PhotoFraming {
  if (!input) return cloneFraming()
  if ('centerX' in input) {
    return {
      zoom: Number(input.zoom) || 1,
      centerX: Number(input.centerX) || 0.5,
      centerY: Number(input.centerY) || 0.5,
    }
  }
  return {
    zoom: Number(input.zoom) || 1,
    centerX: Number(input.center_x) || 0.5,
    centerY: Number(input.center_y) || 0.5,
  }
}

export function framingFromWire(
  wire: PhotoFramingWire | PhotoFraming | null | undefined,
  width?: number,
  height?: number,
): PhotoFraming {
  const raw = normalizeFramingInput(wire)
  if (width && height) return clampFraming(width, height, raw)
  return raw
}

export function framingToWire(framing: PhotoFraming): PhotoFramingWire {
  return {
    zoom: framing.zoom,
    center_x: framing.centerX,
    center_y: framing.centerY,
  }
}

export function cropSide(width: number, height: number, zoom: number): number {
  const short = Math.min(width, height)
  const z = Math.max(PHOTO_FRAMING_MIN_ZOOM, Math.min(PHOTO_FRAMING_MAX_ZOOM, zoom))
  return short / z
}

export function panLimits(
  width: number,
  height: number,
  zoom: number,
): { minX: number; maxX: number; minY: number; maxY: number } {
  const side = cropSide(width, height, zoom)
  const halfX = side / (2 * width)
  const halfY = side / (2 * height)
  return {
    minX: halfX,
    maxX: 1 - halfX,
    minY: halfY,
    maxY: 1 - halfY,
  }
}

export function clampFraming(
  width: number,
  height: number,
  framing: PhotoFraming,
): PhotoFraming {
  if (!(width > 0) || !(height > 0)) return cloneFraming()
  const zoom = Math.max(
    PHOTO_FRAMING_MIN_ZOOM,
    Math.min(PHOTO_FRAMING_MAX_ZOOM, Number(framing.zoom) || 1),
  )
  const limits = panLimits(width, height, zoom)
  const centerX = Math.min(limits.maxX, Math.max(limits.minX, Number(framing.centerX) || 0.5))
  const centerY = Math.min(limits.maxY, Math.max(limits.minY, Number(framing.centerY) || 0.5))
  return { zoom, centerX, centerY }
}

/**
 * CSS for an absolutely positioned <img> inside a square overflow:hidden frame.
 * Percentages are relative to the frame, so any thumbnail size reproduces the crop.
 */
export function framedImageStyle(
  width: number,
  height: number,
  framing: PhotoFraming,
): Record<string, string> {
  const f = clampFraming(width, height, framing)
  const side = cropSide(width, height, f.zoom)
  const widthPct = (width / side) * 100
  const heightPct = (height / side) * 100
  const leftPct = 50 - f.centerX * widthPct
  const topPct = 50 - f.centerY * heightPct
  return {
    position: 'absolute',
    width: `${widthPct}%`,
    height: `${heightPct}%`,
    left: `${leftPct}%`,
    top: `${topPct}%`,
    maxWidth: 'none',
    maxHeight: 'none',
    objectFit: 'fill',
    pointerEvents: 'none',
    userSelect: 'none',
  }
}

/** Pan by pointer delta in frame CSS pixels. */
export function panFramingByDelta(
  width: number,
  height: number,
  framing: PhotoFraming,
  frameSizePx: number,
  deltaXPx: number,
  deltaYPx: number,
): PhotoFraming {
  if (!(frameSizePx > 0)) return clampFraming(width, height, framing)
  const f = clampFraming(width, height, framing)
  const side = cropSide(width, height, f.zoom)
  // Moving the image right reveals more of the left side → center decreases.
  const next = {
    zoom: f.zoom,
    centerX: f.centerX - (deltaXPx / frameSizePx) * (side / width),
    centerY: f.centerY - (deltaYPx / frameSizePx) * (side / height),
  }
  return clampFraming(width, height, next)
}

/** Zoom about the current crop center (keeps center stable when possible). */
export function zoomFramingAt(
  width: number,
  height: number,
  framing: PhotoFraming,
  nextZoom: number,
): PhotoFraming {
  return clampFraming(width, height, {
    zoom: nextZoom,
    centerX: framing.centerX,
    centerY: framing.centerY,
  })
}
