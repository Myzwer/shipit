/**
 * Real loop index to show when a settled scroll rests on a cloned end.
 * Null while the scroll is on a real slide, so a gesture is never teleported mid-drag.
 */
export function wrapLoopIndex(loopIndex: number, count: number): number | null {
  if (count < 2) return null
  if (loopIndex <= 0) return count
  if (loopIndex >= count + 1) return 1
  return null
}
