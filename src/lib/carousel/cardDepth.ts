const NEIGHBOR_OPACITY = 0.35
const NEIGHBOR_SHIFT = 10

/** Opacity and recess follow distance from the centered slide. 0 is front, 1 is a neighbor. */
export function cardDepth(distance: number): {
  opacity: number
  shift: number
  zIndex: number
  shadow: boolean
} {
  const t = Math.min(1, Math.max(0, distance))
  return {
    opacity: 1 - (1 - NEIGHBOR_OPACITY) * t,
    shift: NEIGHBOR_SHIFT * t,
    zIndex: Math.max(1, Math.round((1 - t) * 5)),
    shadow: t < 0.45,
  }
}
