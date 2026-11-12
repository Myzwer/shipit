/**
 * Presentation-only countdown breakdown. Never authorizes lifecycle.
 */

export interface CountdownParts {
  days: number
  hours: number
  minutes: number
  seconds: number
  totalMs: number
  expired: boolean
}

/** Split remaining ms into whole days / hours / minutes / seconds. */
export function countdownPartsFromMs(ms: number): CountdownParts {
  const totalMs = Math.max(0, Math.floor(ms))
  const totalSec = Math.floor(totalMs / 1000)
  const days = Math.floor(totalSec / 86_400)
  const hours = Math.floor((totalSec % 86_400) / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  return {
    days,
    hours,
    minutes,
    seconds,
    totalMs,
    expired: ms <= 0,
  }
}

/** Pad a countdown unit for display (e.g. 3 → "03"). */
export function padCountdownUnit(value: number): string {
  return String(Math.max(0, value)).padStart(2, '0')
}
