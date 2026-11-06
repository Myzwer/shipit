/** Persist unresolved Admin Void across refresh. No secrets. */
export const PENDING_ADMIN_VOID_KEY = 'star-princess.admin.pendingVoid.v1'

export interface PendingAdminVoid {
  version: 1
  clientRequestId: string
  submissionId: string
  expectedStatus: string
  reason: string | null
  cruiseConfigId: string | null
  createdAt: string
}

function canUseStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

export function readPendingAdminVoid(
  storage: Storage | null = canUseStorage() ? localStorage : null,
): PendingAdminVoid | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PENDING_ADMIN_VOID_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingAdminVoid
    if (parsed?.version !== 1 || !parsed.clientRequestId || !parsed.submissionId) return null
    if (!parsed.expectedStatus) return null
    return parsed
  } catch {
    return null
  }
}

export function writePendingAdminVoid(
  pending: Omit<PendingAdminVoid, 'version' | 'createdAt'> & { createdAt?: string },
  storage: Storage | null = canUseStorage() ? localStorage : null,
): PendingAdminVoid | null {
  if (!storage) return null
  const record: PendingAdminVoid = {
    version: 1,
    clientRequestId: pending.clientRequestId,
    submissionId: pending.submissionId,
    expectedStatus: pending.expectedStatus,
    reason: pending.reason ?? null,
    cruiseConfigId: pending.cruiseConfigId ?? null,
    createdAt: pending.createdAt ?? new Date().toISOString(),
  }
  storage.setItem(PENDING_ADMIN_VOID_KEY, JSON.stringify(record))
  return record
}

export function clearPendingAdminVoid(
  storage: Storage | null = canUseStorage() ? localStorage : null,
): void {
  if (!storage) return
  storage.removeItem(PENDING_ADMIN_VOID_KEY)
}
