import type { ShipClockState } from '@/types/shipClock'

const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const

/** Parse ship-local wall `YYYY-MM-DDTHH:MM[:SS]` (timezone-less). */
export function parseShipLocal(shipLocal: string): {
  date: string
  hours: number
  minutes: number
  seconds: number
} | null {
  const m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(shipLocal)
  if (!m) return null
  return {
    date: m[1],
    hours: Number(m[2]),
    minutes: Number(m[3]),
    seconds: Number(m[4] ?? '0'),
  }
}

/** Display like `12:34 PM` (approved time style). */
export function formatShipTimeOfDay(shipLocal: string): string {
  const p = parseShipLocal(shipLocal)
  if (!p) return shipLocal
  const period = p.hours >= 12 ? 'PM' : 'AM'
  const h12 = p.hours % 12 === 0 ? 12 : p.hours % 12
  return `${h12}:${String(p.minutes).padStart(2, '0')} ${period}`
}

export function formatShipDateTime(shipLocal: string): string {
  const p = parseShipLocal(shipLocal)
  if (!p) return shipLocal
  return `${p.date} · ${formatShipTimeOfDay(shipLocal)}`
}

export function weekdayForShipDate(shipDate: string): string {
  // Interpret as UTC noon calendar date to avoid TZ shifting the weekday.
  const d = new Date(`${shipDate}T12:00:00Z`)
  return WEEKDAYS[d.getUTCDay()] ?? ''
}

/** `Cruise Day {n}: {weekday}` when cruise day is known. */
export function formatCruiseDayLabel(state: Pick<ShipClockState, 'cruise_day' | 'ship_date'>): string | null {
  if (state.cruise_day == null || !state.ship_date) return null
  return `Cruise Day ${state.cruise_day}: ${weekdayForShipDate(state.ship_date)}`
}

/** Organizer-facing offset label, e.g. `UTC−4:00` / `UTC+1:00`. */
export function formatUtcOffsetLabel(offsetMinutes: number): string {
  const sign = offsetMinutes <= 0 ? '−' : '+'
  const abs = Math.abs(offsetMinutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  return `UTC${sign}${h}:${String(m).padStart(2, '0')}`
}

export function formatPlanDeltaLabel(deltaMinutes: number, enabled: boolean): string {
  if (!enabled) return 'Schedule off'
  if (deltaMinutes === 0) return 'No change'
  if (deltaMinutes === -120) return '−2 hours'
  if (deltaMinutes === -60) return '−1 hour'
  if (deltaMinutes === 60) return '+1 hour'
  if (deltaMinutes === 120) return '+2 hours'
  return `${deltaMinutes} min`
}

/**
 * Advance a ship-local wall string by elapsed real milliseconds using a frozen offset.
 * Visual-only — never used for eligibility.
 */
export function advanceShipLocal(shipLocal: string, elapsedMs: number): string {
  const p = parseShipLocal(shipLocal)
  if (!p) return shipLocal
  const base = Date.UTC(
    Number(p.date.slice(0, 4)),
    Number(p.date.slice(5, 7)) - 1,
    Number(p.date.slice(8, 10)),
    p.hours,
    p.minutes,
    p.seconds,
  )
  const next = new Date(base + elapsedMs)
  const y = next.getUTCFullYear()
  const mo = String(next.getUTCMonth() + 1).padStart(2, '0')
  const da = String(next.getUTCDate()).padStart(2, '0')
  const hh = String(next.getUTCHours()).padStart(2, '0')
  const mm = String(next.getUTCMinutes()).padStart(2, '0')
  const ss = String(next.getUTCSeconds()).padStart(2, '0')
  return `${y}-${mo}-${da}T${hh}:${mm}:${ss}`
}

export function cruiseDayWeekdayName(dayNumber: number): string {
  // Day 1 = Saturday … Day 7 = Friday
  const names = ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday']
  return names[dayNumber - 1] ?? `Day ${dayNumber}`
}
