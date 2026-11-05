/**
 * Persist unresolved Admin clock corrections across refresh/navigation.
 * Stores only request id + intent metadata — never passwords or tokens.
 */
import type { ManualCorrectionIntent, ShipClockState } from '@/types/shipClock'

export const PENDING_CLOCK_CORRECTION_KEY = 'star-princess.admin.pendingClockCorrection.v1'

export interface PendingClockCorrection {
  version: 1
  clientRequestId: string
  intent: ManualCorrectionIntent
  beforeSnapshot?: Pick<ShipClockState, 'at_utc' | 'offset_minutes' | 'ship_local' | 'lifecycle'>
  createdAt: string
}

export function correctionFingerprint(intent: ManualCorrectionIntent): string | null {
  if (intent.kind === 'plus_1h' || intent.kind === 'minus_1h') {
    if (intent.deltaMinutes !== 60 && intent.deltaMinutes !== -60) return null
    return `manual_delta:${intent.deltaMinutes}`
  }
  if (intent.kind === 'set_time') {
    if (!intent.targetShipLocal) return null
    return `manual_set:${intent.targetShipLocal.replace(' ', 'T')}`
  }
  return null
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function readPendingClockCorrection(
  storage: Storage | null = canUseStorage() ? localStorage : null,
): PendingClockCorrection | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PENDING_CLOCK_CORRECTION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingClockCorrection
    if (parsed?.version !== 1 || !parsed.clientRequestId || !parsed.intent?.kind) return null
    if (!correctionFingerprint(parsed.intent)) return null
    return parsed
  } catch {
    return null
  }
}

export function writePendingClockCorrection(
  pending: Omit<PendingClockCorrection, 'version' | 'createdAt'> & { createdAt?: string },
  storage: Storage | null = canUseStorage() ? localStorage : null,
): PendingClockCorrection | null {
  if (!storage) return null
  const record: PendingClockCorrection = {
    version: 1,
    clientRequestId: pending.clientRequestId,
    intent: pending.intent,
    beforeSnapshot: pending.beforeSnapshot,
    createdAt: pending.createdAt ?? new Date().toISOString(),
  }
  storage.setItem(PENDING_CLOCK_CORRECTION_KEY, JSON.stringify(record))
  return record
}

export function clearPendingClockCorrection(
  storage: Storage | null = canUseStorage() ? localStorage : null,
): void {
  if (!storage) return
  storage.removeItem(PENDING_CLOCK_CORRECTION_KEY)
}
