/**
 * Pending Admin bounty-schedule initialization (lost-response recovery).
 * Mirrors pause/skip pending shape — no credentials stored.
 */

export type PendingBountyScheduleInit = {
  clientRequestId: string
  cruiseConfigId: string | null
  seed: string | null
}

const STORAGE_KEY = 'star-princess.admin.bountyScheduleInit.pending'

export function scheduleInitFingerprint(seed: string | null | undefined): string {
  return `initialize_bounty_schedule:${seed ?? ''}`
}

export function readPendingBountyScheduleInit(): PendingBountyScheduleInit | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingBountyScheduleInit
    if (!parsed?.clientRequestId || typeof parsed.clientRequestId !== 'string') return null
    return {
      clientRequestId: parsed.clientRequestId,
      cruiseConfigId: typeof parsed.cruiseConfigId === 'string' ? parsed.cruiseConfigId : null,
      seed: typeof parsed.seed === 'string' ? parsed.seed : null,
    }
  } catch {
    return null
  }
}

export function writePendingBountyScheduleInit(next: PendingBountyScheduleInit): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
}

export function clearPendingBountyScheduleInit(): void {
  localStorage.removeItem(STORAGE_KEY)
}
