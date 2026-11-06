/**
 * Persist unresolved Admin roster operations across refresh.
 * Two independent slots: access edits (RPC) and auth ops (create/reset).
 * NEVER stores passwords — only ids and non-secret intent fields.
 */
export const PENDING_ADMIN_ROSTER_ACCESS_KEY = 'star-princess.admin.pendingRosterAccess.v1'
export const PENDING_ADMIN_ROSTER_AUTH_KEY = 'star-princess.admin.pendingRosterAuth.v1'

export interface PendingRosterAccess {
  version: 1
  kind: 'access'
  clientRequestId: string
  playerId: string
  displayName: string | null
  active: boolean
  drinkitEnabled: boolean
  shipitEnabled: boolean
  teamId: string | null
  expectedFingerprint: string
  createdAt: string
}

export interface PendingRosterAuth {
  version: 1
  kind: 'create_player' | 'reset_password'
  clientRequestId: string
  playerId: string | null
  displayName: string | null
  drinkitEnabled: boolean | null
  shipitEnabled: boolean | null
  teamId: string | null
  createdAt: string
}

type Store = Storage | null

function defaultStorage(): Store {
  return typeof localStorage !== 'undefined' ? localStorage : null
}

// --- Access ---------------------------------------------------------------

export function readPendingRosterAccess(storage: Store = defaultStorage()): PendingRosterAccess | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PENDING_ADMIN_ROSTER_ACCESS_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as PendingRosterAccess
    if (p?.version !== 1 || p.kind !== 'access') return null
    if (!p.clientRequestId || !p.playerId || !p.expectedFingerprint) return null
    return p
  } catch {
    return null
  }
}

export function writePendingRosterAccess(
  pending: Omit<PendingRosterAccess, 'version' | 'kind' | 'createdAt'> & { createdAt?: string },
  storage: Store = defaultStorage(),
): PendingRosterAccess | null {
  if (!storage) return null
  const record: PendingRosterAccess = {
    version: 1,
    kind: 'access',
    clientRequestId: pending.clientRequestId,
    playerId: pending.playerId,
    displayName: pending.displayName ?? null,
    active: pending.active,
    drinkitEnabled: pending.drinkitEnabled,
    shipitEnabled: pending.shipitEnabled,
    teamId: pending.teamId ?? null,
    expectedFingerprint: pending.expectedFingerprint,
    createdAt: pending.createdAt ?? new Date().toISOString(),
  }
  storage.setItem(PENDING_ADMIN_ROSTER_ACCESS_KEY, JSON.stringify(record))
  return record
}

export function clearPendingRosterAccess(storage: Store = defaultStorage()): void {
  if (!storage) return
  storage.removeItem(PENDING_ADMIN_ROSTER_ACCESS_KEY)
}

// --- Auth (create / reset) ------------------------------------------------

export function readPendingRosterAuth(storage: Store = defaultStorage()): PendingRosterAuth | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PENDING_ADMIN_ROSTER_AUTH_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as PendingRosterAuth
    if (p?.version !== 1 || !p.clientRequestId) return null
    if (p.kind !== 'create_player' && p.kind !== 'reset_password') return null
    return p
  } catch {
    return null
  }
}

export function writePendingRosterAuth(
  pending: Omit<PendingRosterAuth, 'version' | 'createdAt' | 'playerId' | 'displayName' | 'drinkitEnabled' | 'shipitEnabled' | 'teamId'> &
    Partial<Pick<PendingRosterAuth, 'playerId' | 'displayName' | 'drinkitEnabled' | 'shipitEnabled' | 'teamId' | 'createdAt'>>,
  storage: Store = defaultStorage(),
): PendingRosterAuth | null {
  if (!storage) return null
  // Explicit field pick: anything else on the input (e.g. a stray password) is dropped.
  const record: PendingRosterAuth = {
    version: 1,
    kind: pending.kind,
    clientRequestId: pending.clientRequestId,
    playerId: pending.playerId ?? null,
    displayName: pending.displayName ?? null,
    drinkitEnabled: pending.drinkitEnabled ?? null,
    shipitEnabled: pending.shipitEnabled ?? null,
    teamId: pending.teamId ?? null,
    createdAt: pending.createdAt ?? new Date().toISOString(),
  }
  storage.setItem(PENDING_ADMIN_ROSTER_AUTH_KEY, JSON.stringify(record))
  return record
}

export function clearPendingRosterAuth(storage: Store = defaultStorage()): void {
  if (!storage) return
  storage.removeItem(PENDING_ADMIN_ROSTER_AUTH_KEY)
}
