/**
 * Persist unresolved Admin Daily Challenge announcement writes across refresh.
 */
const STORAGE_KEY = 'star-princess:pending-daily-announcement:v1'

export type PendingDailyAnnouncement = {
  clientRequestId: string
  dayNumber: number
  announcement: string | null
  cruiseConfigId: string | null
}

export function readPendingDailyAnnouncement(): PendingDailyAnnouncement | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingDailyAnnouncement
    if (
      !parsed?.clientRequestId ||
      typeof parsed.dayNumber !== 'number' ||
      parsed.dayNumber < 1 ||
      parsed.dayNumber > 7
    ) {
      return null
    }
    return {
      clientRequestId: parsed.clientRequestId,
      dayNumber: parsed.dayNumber,
      announcement: parsed.announcement ?? null,
      cruiseConfigId: parsed.cruiseConfigId ?? null,
    }
  } catch {
    return null
  }
}

export function writePendingDailyAnnouncement(pending: PendingDailyAnnouncement): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pending))
}

export function clearPendingDailyAnnouncement(): void {
  localStorage.removeItem(STORAGE_KEY)
}
