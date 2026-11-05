/**
 * Persist unresolved Admin Drink It! Pause/Resume across refresh/navigation.
 * Stores request id + desired state only — never passwords or tokens.
 * Database request ledger remains the source of truth.
 */
export const PENDING_DRINKIT_PAUSE_KEY = 'star-princess.admin.pendingDrinkItPause.v1'

export interface PendingDrinkItPause {
  version: 1
  clientRequestId: string
  /** Desired paused state for this operation fingerprint. */
  desiredPaused: boolean
  /** Active cruise config when the request was issued (scope guard). */
  cruiseConfigId: string | null
  createdAt: string
}

export function pauseFingerprint(desiredPaused: boolean): string {
  return `drinkit_paused:${desiredPaused}`
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function readPendingDrinkItPause(
  storage: Storage | null = canUseStorage() ? localStorage : null,
): PendingDrinkItPause | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PENDING_DRINKIT_PAUSE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingDrinkItPause
    if (parsed?.version !== 1 || !parsed.clientRequestId) return null
    if (typeof parsed.desiredPaused !== 'boolean') return null
    return parsed
  } catch {
    return null
  }
}

export function writePendingDrinkItPause(
  pending: Omit<PendingDrinkItPause, 'version' | 'createdAt'> & { createdAt?: string },
  storage: Storage | null = canUseStorage() ? localStorage : null,
): PendingDrinkItPause | null {
  if (!storage) return null
  const record: PendingDrinkItPause = {
    version: 1,
    clientRequestId: pending.clientRequestId,
    desiredPaused: pending.desiredPaused,
    cruiseConfigId: pending.cruiseConfigId ?? null,
    createdAt: pending.createdAt ?? new Date().toISOString(),
  }
  storage.setItem(PENDING_DRINKIT_PAUSE_KEY, JSON.stringify(record))
  return record
}

export function clearPendingDrinkItPause(
  storage: Storage | null = canUseStorage() ? localStorage : null,
): void {
  if (!storage) return
  storage.removeItem(PENDING_DRINKIT_PAUSE_KEY)
}
