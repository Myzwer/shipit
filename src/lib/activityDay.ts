/**
 * Activity-day reporting boundary: 05:00 ship-local through 04:59:59 next morning.
 * Display timestamps stay wall-clock; this is attribution / ordering only.
 */

export const ACTIVITY_DAY_BOUNDARY_HOUR = 5

/** Ship-local wall time as minutes since midnight (0..1439.999…). */
export function shipLocalMinutesSinceMidnight(
  hours: number,
  minutes = 0,
  seconds = 0,
): number {
  return hours * 60 + minutes + seconds / 60
}

/**
 * Chronological position within a 05:00–05:00 activity day.
 * 05:00 → 0; 23:18 → 1098; 01:34 → 1234; 04:59 → 1439.
 */
export function activityClockMinutesFromShipLocalTime(
  hours: number,
  minutes = 0,
  seconds = 0,
): number {
  const sinceMidnight = shipLocalMinutesSinceMidnight(hours, minutes, seconds)
  const boundary = ACTIVITY_DAY_BOUNDARY_HOUR * 60
  if (sinceMidnight >= boundary) return sinceMidnight - boundary
  return sinceMidnight + (24 * 60 - boundary)
}

/** Activity calendar date for a ship-local civil date + time. */
export function activityDateFromShipLocal(
  shipLocalDate: string,
  hours: number,
  minutes = 0,
  seconds = 0,
): string {
  const sinceMidnight = shipLocalMinutesSinceMidnight(hours, minutes, seconds)
  if (sinceMidnight >= ACTIVITY_DAY_BOUNDARY_HOUR * 60) return shipLocalDate
  const d = new Date(`${shipLocalDate}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/** True when wall time is in the Early Bird / morning window [05:00, beforeHour). */
export function matchesBeforeHourWindow(
  hours: number,
  minutes: number,
  beforeHour: number,
  seconds = 0,
): boolean {
  const t = shipLocalMinutesSinceMidnight(hours, minutes, seconds)
  const boundary = ACTIVITY_DAY_BOUNDARY_HOUR * 60
  const end = beforeHour * 60
  return t >= boundary && t < end
}

/** True when wall time is in the Night Owl window [afterHour, 24:00) ∪ [00:00, 05:00). */
export function matchesAfterHourWindow(
  hours: number,
  minutes: number,
  afterHour: number,
  seconds = 0,
): boolean {
  const t = shipLocalMinutesSinceMidnight(hours, minutes, seconds)
  const boundary = ACTIVITY_DAY_BOUNDARY_HOUR * 60
  const start = afterHour * 60
  return t >= start || t < boundary
}
