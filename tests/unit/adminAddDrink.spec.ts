import { beforeEach, describe, expect, it, vi } from 'vitest'

const rpc = vi.fn()

vi.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}))

import {
  applyAddDrink,
  exportFilename,
  mapAddDrinkFailCode,
  newAddDrinkRequestId,
  previewAddDrink,
  reconcileAddDrink,
} from '@/lib/adminAddDrink'
import {
  PENDING_ADMIN_ADD_DRINK_KEY,
  clearPendingAdminAddDrink,
  readPendingAdminAddDrink,
  writePendingAdminAddDrink,
} from '@/lib/pendingAdminAddDrink'

const REQ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  }
}

beforeEach(() => {
  rpc.mockReset()
})

describe('adminAddDrink helpers', () => {
  it('mints uuid-shaped request ids', () => {
    const a = newAddDrinkRequestId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(newAddDrinkRequestId()).not.toBe(a)
  })

  it('names the export file with a YYYYMMDD stamp', () => {
    expect(exportFilename(new Date(2026, 10, 6))).toBe('star-princess-game-data-20261106.json')
    expect(exportFilename(new Date(2027, 0, 5))).toBe('star-princess-game-data-20270105.json')
  })

  it('maps ADMIN_REQUIRED to forbidden', () => {
    expect(mapAddDrinkFailCode('ADMIN_REQUIRED')).toBe('forbidden')
    expect(mapAddDrinkFailCode('BARS_REQUIRED')).toBe('bars_required')
    expect(mapAddDrinkFailCode('REQUEST_ID_OPERATION_MISMATCH')).toBe('mismatch')
    expect(mapAddDrinkFailCode('SOMETHING_ELSE')).toBe('error')
  })

  it('sends trimmed, de-duplicated args and defaults kind', async () => {
    rpc.mockResolvedValue({ data: { ok: true, client_request_id: REQ }, error: null })
    const out = await applyAddDrink({
      clientRequestId: REQ,
      displayName: '  Lorem Drink  ',
      barKeys: ['bar-a', 'bar-a', ' bar-b '],
      ingredientKeys: ['lime', ''],
    })
    expect(out.status).toBe('ok')
    expect(rpc).toHaveBeenCalledWith('admin_add_drink', {
      p_client_request_id: REQ,
      p_display_name: 'Lorem Drink',
      p_bar_canonical_keys: ['bar-a', 'bar-b'],
      p_ingredient_canonical_keys: ['lime'],
      p_kind: 'named_cocktail',
    })
  })

  it('treats an RPC transport error on apply as unknown, not failed', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'network down' } })
    const out = await applyAddDrink({
      clientRequestId: REQ,
      displayName: 'Lorem Drink',
      barKeys: ['bar-a'],
      ingredientKeys: [],
    })
    expect(out.status).toBe('unknown')
  })

  it('maps ADMIN_REQUIRED errors to forbidden', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'ADMIN_REQUIRED' } })
    const out = await previewAddDrink({ displayName: 'Lorem', barKeys: ['a'], ingredientKeys: [] })
    expect(out).toMatchObject({ status: 'failed', code: 'forbidden' })
  })

  it('keeps a missing ledger row as unknown on reconcile', async () => {
    rpc.mockResolvedValue({ data: null, error: null })
    const out = await reconcileAddDrink(REQ)
    expect(out.status).toBe('unknown')
    expect(rpc).toHaveBeenCalledWith('admin_find_add_drink_request_by_id', {
      p_client_request_id: REQ,
    })
  })
})

describe('pendingAdminAddDrink', () => {
  it('round-trips and clears', () => {
    const storage = memoryStorage()
    writePendingAdminAddDrink(
      { clientRequestId: REQ, displayName: 'Lorem Drink', barKeys: ['bar-a'], ingredientKeys: ['lime'] },
      storage,
    )
    expect(readPendingAdminAddDrink(storage)).toMatchObject({
      clientRequestId: REQ,
      displayName: 'Lorem Drink',
      kind: 'named_cocktail',
    })
    clearPendingAdminAddDrink(storage)
    expect(storage.getItem(PENDING_ADMIN_ADD_DRINK_KEY)).toBeNull()
  })

  it('rejects malformed records', () => {
    const storage = memoryStorage()
    storage.setItem(PENDING_ADMIN_ADD_DRINK_KEY, '{"version":1}')
    expect(readPendingAdminAddDrink(storage)).toBeNull()
  })
})
