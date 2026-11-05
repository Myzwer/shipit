import { beforeEach, describe, expect, it } from 'vitest'
import {
  PENDING_DRINKIT_PAUSE_KEY,
  clearPendingDrinkItPause,
  pauseFingerprint,
  readPendingDrinkItPause,
  writePendingDrinkItPause,
} from '@/lib/pendingDrinkItPause'

function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, String(v))
    },
    removeItem: (k) => {
      map.delete(k)
    },
    key: (i) => [...map.keys()][i] ?? null,
  }
}

describe('pendingDrinkItPause persistence', () => {
  let storage: Storage

  beforeEach(() => {
    storage = memoryStorage()
  })

  it('round-trips request id and desired state without secrets', () => {
    writePendingDrinkItPause(
      {
        clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        desiredPaused: true,
        cruiseConfigId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      storage,
    )
    const raw = storage.getItem(PENDING_DRINKIT_PAUSE_KEY) ?? ''
    expect(raw).not.toMatch(/password|token|service_role/i)
    const read = readPendingDrinkItPause(storage)
    expect(read?.clientRequestId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(read?.desiredPaused).toBe(true)
    expect(read?.cruiseConfigId).toBe('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
  })

  it('survives clear-and-restore across navigation remount', () => {
    writePendingDrinkItPause(
      {
        clientRequestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        desiredPaused: false,
        cruiseConfigId: null,
      },
      storage,
    )
    expect(readPendingDrinkItPause(storage)?.desiredPaused).toBe(false)
    clearPendingDrinkItPause(storage)
    expect(readPendingDrinkItPause(storage)).toBeNull()
  })

  it('builds fingerprints matching server drinkit_pause_fingerprint', () => {
    expect(pauseFingerprint(true)).toBe('drinkit_paused:true')
    expect(pauseFingerprint(false)).toBe('drinkit_paused:false')
  })
})
