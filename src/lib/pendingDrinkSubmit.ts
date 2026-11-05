/**
 * Persist unresolved Drink It! submit across refresh/navigation.
 * Stores idempotency key + exact payload only — never passwords or tokens.
 * Server idempotency remains the source of truth.
 */
export const PENDING_DRINK_SUBMIT_KEY = 'star-princess.drinkit.pendingDrinkSubmit.v1'

export interface PendingDrinkSubmit {
  version: 1
  /** = payload.idempotency_key */
  clientRequestId: string
  /** Scope guard — ignore on account switch. */
  playerId: string
  /** Optional cruise scope. */
  cruiseConfigId: string | null
  /** Exact submit_drink payload for same-UUID retry. */
  payload: Record<string, unknown>
  /** Display-only summary for recovery UI. */
  summary: {
    barName: string
    drinkName: string
  }
  createdAt: string
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function readPendingDrinkSubmit(
  storage: Storage | null = canUseStorage() ? localStorage : null,
): PendingDrinkSubmit | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PENDING_DRINK_SUBMIT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingDrinkSubmit
    if (parsed?.version !== 1) return null
    if (!parsed.clientRequestId || typeof parsed.clientRequestId !== 'string') return null
    if (!parsed.playerId || typeof parsed.playerId !== 'string') return null
    if (!parsed.payload || typeof parsed.payload !== 'object') return null
    if (parsed.payload.idempotency_key !== parsed.clientRequestId) return null
    return parsed
  } catch {
    return null
  }
}

export function writePendingDrinkSubmit(
  pending: Omit<PendingDrinkSubmit, 'version' | 'createdAt'> & { createdAt?: string },
  storage: Storage | null = canUseStorage() ? localStorage : null,
): PendingDrinkSubmit | null {
  if (!storage) return null
  const record: PendingDrinkSubmit = {
    version: 1,
    clientRequestId: pending.clientRequestId,
    playerId: pending.playerId,
    cruiseConfigId: pending.cruiseConfigId ?? null,
    payload: pending.payload,
    summary: pending.summary,
    createdAt: pending.createdAt ?? new Date().toISOString(),
  }
  storage.setItem(PENDING_DRINK_SUBMIT_KEY, JSON.stringify(record))
  return record
}

export function clearPendingDrinkSubmit(
  storage: Storage | null = canUseStorage() ? localStorage : null,
): void {
  if (!storage) return
  storage.removeItem(PENDING_DRINK_SUBMIT_KEY)
}

/** Drop pending if it belongs to a different player (logout / account switch). */
export function clearPendingDrinkSubmitIfOtherPlayer(
  currentPlayerId: string | null,
  storage: Storage | null = canUseStorage() ? localStorage : null,
): void {
  const pending = readPendingDrinkSubmit(storage)
  if (!pending) return
  if (!currentPlayerId || pending.playerId !== currentPlayerId) {
    clearPendingDrinkSubmit(storage)
  }
}
