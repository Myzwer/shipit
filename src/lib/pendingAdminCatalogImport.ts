/**
 * Persist an unresolved Admin catalog stage / publish / rollback across refresh.
 * Stores request ids and expectations only — never the catalog payload or any secret.
 */
export const PENDING_ADMIN_CATALOG_IMPORT_KEY = 'star-princess.admin.pendingCatalogImport.v1'

export type PendingCatalogAction = 'stage' | 'publish' | 'rollback'

export interface PendingAdminCatalogImport {
  version: 1
  action: PendingCatalogAction
  clientRequestId: string
  catalogId: string | null
  candidateId: string | null
  targetCatalogVersionId: string | null
  expectedActiveCatalogVersionId: string | null
  expectedPayloadHash: string | null
  createdAt: string
}

type Store = Storage | null

function defaultStorage(): Store {
  return typeof localStorage !== 'undefined' ? localStorage : null
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null
}

export function readPendingAdminCatalogImport(
  storage: Store = defaultStorage(),
): PendingAdminCatalogImport | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PENDING_ADMIN_CATALOG_IMPORT_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as PendingAdminCatalogImport
    if (p?.version !== 1 || !p.clientRequestId) return null
    if (p.action !== 'stage' && p.action !== 'publish' && p.action !== 'rollback') return null
    return {
      version: 1,
      action: p.action,
      clientRequestId: p.clientRequestId,
      catalogId: strOrNull(p.catalogId),
      candidateId: strOrNull(p.candidateId),
      targetCatalogVersionId: strOrNull(p.targetCatalogVersionId),
      expectedActiveCatalogVersionId: strOrNull(p.expectedActiveCatalogVersionId),
      expectedPayloadHash: strOrNull(p.expectedPayloadHash),
      createdAt: typeof p.createdAt === 'string' ? p.createdAt : new Date(0).toISOString(),
    }
  } catch {
    return null
  }
}

export function writePendingAdminCatalogImport(
  pending: {
    action: PendingCatalogAction
    clientRequestId: string
    catalogId?: string | null
    candidateId?: string | null
    targetCatalogVersionId?: string | null
    expectedActiveCatalogVersionId?: string | null
    expectedPayloadHash?: string | null
    createdAt?: string
  },
  storage: Store = defaultStorage(),
): PendingAdminCatalogImport | null {
  if (!storage) return null
  // Explicit field pick: nothing else on the input is persisted.
  const record: PendingAdminCatalogImport = {
    version: 1,
    action: pending.action,
    clientRequestId: pending.clientRequestId,
    catalogId: pending.catalogId ?? null,
    candidateId: pending.candidateId ?? null,
    targetCatalogVersionId: pending.targetCatalogVersionId ?? null,
    expectedActiveCatalogVersionId: pending.expectedActiveCatalogVersionId ?? null,
    expectedPayloadHash: pending.expectedPayloadHash ?? null,
    createdAt: pending.createdAt ?? new Date().toISOString(),
  }
  storage.setItem(PENDING_ADMIN_CATALOG_IMPORT_KEY, JSON.stringify(record))
  return record
}

export function clearPendingAdminCatalogImport(storage: Store = defaultStorage()): void {
  if (!storage) return
  storage.removeItem(PENDING_ADMIN_CATALOG_IMPORT_KEY)
}
