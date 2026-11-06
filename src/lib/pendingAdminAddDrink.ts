/** Persist an unresolved Admin Add Drink across refresh. No secrets. */
export const PENDING_ADMIN_ADD_DRINK_KEY = 'star-princess.admin.pendingAddDrink.v1'

export interface PendingAdminAddDrink {
  version: 1
  clientRequestId: string
  displayName: string
  barKeys: string[]
  ingredientKeys: string[]
  kind: string
  createdAt: string
}

type Store = Storage | null

function defaultStorage(): Store {
  return typeof localStorage !== 'undefined' ? localStorage : null
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

export function readPendingAdminAddDrink(storage: Store = defaultStorage()): PendingAdminAddDrink | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(PENDING_ADMIN_ADD_DRINK_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as PendingAdminAddDrink
    if (p?.version !== 1 || !p.clientRequestId || !p.displayName) return null
    if (!isStringArray(p.barKeys) || !isStringArray(p.ingredientKeys)) return null
    return p
  } catch {
    return null
  }
}

export function writePendingAdminAddDrink(
  pending: Omit<PendingAdminAddDrink, 'version' | 'createdAt' | 'kind'> & {
    kind?: string
    createdAt?: string
  },
  storage: Store = defaultStorage(),
): PendingAdminAddDrink | null {
  if (!storage) return null
  // Explicit field pick: nothing else on the input is persisted.
  const record: PendingAdminAddDrink = {
    version: 1,
    clientRequestId: pending.clientRequestId,
    displayName: pending.displayName,
    barKeys: [...pending.barKeys],
    ingredientKeys: [...pending.ingredientKeys],
    kind: pending.kind ?? 'named_cocktail',
    createdAt: pending.createdAt ?? new Date().toISOString(),
  }
  storage.setItem(PENDING_ADMIN_ADD_DRINK_KEY, JSON.stringify(record))
  return record
}

export function clearPendingAdminAddDrink(storage: Store = defaultStorage()): void {
  if (!storage) return
  storage.removeItem(PENDING_ADMIN_ADD_DRINK_KEY)
}
