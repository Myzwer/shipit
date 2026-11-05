/**
 * Presentation-only countdown helpers. Never authorize eligibility.
 */

/** Format remaining ms as `M:SS` or `H:MM:SS` (mockup style). */
export function formatRemainingMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Remaining time until a server UTC instant, using the last server snapshot
 * plus elapsed wall ms since fetch (visual only).
 */
export function remainingUntilUtc(
  targetUtc: string,
  serverAtUtc: string,
  fetchedAtMs: number,
  nowMs = Date.now(),
): number {
  const target = Date.parse(targetUtc)
  const serverAt = Date.parse(serverAtUtc)
  if (!Number.isFinite(target) || !Number.isFinite(serverAt)) return 0
  const estimatedNowUtcMs = serverAt + (nowMs - fetchedAtMs)
  return target - estimatedNowUtcMs
}
