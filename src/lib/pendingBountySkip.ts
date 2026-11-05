/**
 * Persist unresolved Admin bounty Skip across refresh/navigation.
 * Stores request id + category + expected offer — never passwords or tokens.
 */
export const PENDING_BOUNTY_SKIP_KEY = 'star-princess.admin.pendingBountySkip.v1'

export interface PendingBountySkip {
  version: 1
  clientRequestId: string
  category: 'cocktail' | 'ingredient'
  expectedOfferId: string
  cruiseConfigId: string | null
  createdAt: string
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function readPendingBountySkip(
  storage: Storage | null = canUseStorage() ? localStorage : null,
): PendingBountySkip | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PENDING_BOUNTY_SKIP_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingBountySkip
    if (parsed?.version !== 1 || !parsed.clientRequestId) return null
    if (parsed.category !== 'cocktail' && parsed.category !== 'ingredient') return null
    if (!parsed.expectedOfferId) return null
    return parsed
  } catch {
    return null
  }
}

export function writePendingBountySkip(
  pending: Omit<PendingBountySkip, 'version' | 'createdAt'> & { createdAt?: string },
  storage: Storage | null = canUseStorage() ? localStorage : null,
): PendingBountySkip | null {
  if (!storage) return null
  const record: PendingBountySkip = {
    version: 1,
    clientRequestId: pending.clientRequestId,
    category: pending.category,
    expectedOfferId: pending.expectedOfferId,
    cruiseConfigId: pending.cruiseConfigId ?? null,
    createdAt: pending.createdAt ?? new Date().toISOString(),
  }
  storage.setItem(PENDING_BOUNTY_SKIP_KEY, JSON.stringify(record))
  return record
}

export function clearPendingBountySkip(
  storage: Storage | null = canUseStorage() ? localStorage : null,
): void {
  if (!storage) return
  storage.removeItem(PENDING_BOUNTY_SKIP_KEY)
}
