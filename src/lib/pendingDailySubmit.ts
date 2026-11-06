/**
 * Persist unresolved Drink It! Daily Challenge submit across refresh.
 * Exact payload + UUID only — never passwords/tokens.
 */
export const PENDING_DAILY_SUBMIT_KEY = 'star-princess.drinkit.pendingDailySubmit.v1'

export interface PendingDailySubmit {
  version: 1
  clientRequestId: string
  playerId: string
  cruiseConfigId: string | null
  payload: {
    idempotency_key: string
    challenge_id: string
    photo_id: string
    caption: string | null
  }
  summary: {
    title: string
    points: number
  }
  createdAt: string
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function readPendingDailySubmit(
  storage: Storage | null = canUseStorage() ? localStorage : null,
): PendingDailySubmit | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PENDING_DAILY_SUBMIT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingDailySubmit
    if (parsed?.version !== 1) return null
    if (!parsed.clientRequestId || !parsed.playerId || !parsed.payload) return null
    if (parsed.payload.idempotency_key !== parsed.clientRequestId) return null
    return parsed
  } catch {
    return null
  }
}

export function writePendingDailySubmit(
  pending: Omit<PendingDailySubmit, 'version' | 'createdAt'> & { createdAt?: string },
  storage: Storage | null = canUseStorage() ? localStorage : null,
): PendingDailySubmit | null {
  if (!storage) return null
  const record: PendingDailySubmit = {
    version: 1,
    clientRequestId: pending.clientRequestId,
    playerId: pending.playerId,
    cruiseConfigId: pending.cruiseConfigId ?? null,
    payload: pending.payload,
    summary: pending.summary,
    createdAt: pending.createdAt ?? new Date().toISOString(),
  }
  storage.setItem(PENDING_DAILY_SUBMIT_KEY, JSON.stringify(record))
  return record
}

export function clearPendingDailySubmit(
  storage: Storage | null = canUseStorage() ? localStorage : null,
): void {
  if (!storage) return
  storage.removeItem(PENDING_DAILY_SUBMIT_KEY)
}

export function clearPendingDailySubmitIfOtherPlayer(
  currentPlayerId: string | null,
  storage: Storage | null = canUseStorage() ? localStorage : null,
): void {
  const pending = readPendingDailySubmit(storage)
  if (!pending) return
  if (!currentPlayerId || pending.playerId !== currentPlayerId) {
    clearPendingDailySubmit(storage)
  }
}
