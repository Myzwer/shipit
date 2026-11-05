import { beforeEach, describe, expect, it } from 'vitest'
import {
  PENDING_BOUNTY_SKIP_KEY,
  clearPendingBountySkip,
  readPendingBountySkip,
  writePendingBountySkip,
} from '@/lib/pendingBountySkip'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, String(v))
    },
    removeItem: (k) => {
      map.delete(k)
    },
    key: (i) => [...map.keys()][i] ?? null,
  }
}

describe('pendingBountySkip', () => {
  let storage: Storage

  beforeEach(() => {
    storage = memoryStorage()
  })

  it('round-trips same request id for safe retry', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    writePendingBountySkip(
      {
        clientRequestId: id,
        category: 'cocktail',
        expectedOfferId: '22222222-2222-4222-8222-222222222222',
        cruiseConfigId: 'cruise-1',
      },
      storage,
    )
    const read = readPendingBountySkip(storage)
    expect(read?.clientRequestId).toBe(id)
    expect(read?.category).toBe('cocktail')
    expect(storage.getItem(PENDING_BOUNTY_SKIP_KEY)).toBeTruthy()
  })

  it('clear removes record', () => {
    writePendingBountySkip(
      {
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        category: 'ingredient',
        expectedOfferId: '22222222-2222-4222-8222-222222222222',
        cruiseConfigId: null,
      },
      storage,
    )
    clearPendingBountySkip(storage)
    expect(readPendingBountySkip(storage)).toBeNull()
  })
})
