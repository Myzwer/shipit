import { beforeEach, describe, expect, it } from 'vitest'
import {
  PENDING_DRINK_SUBMIT_KEY,
  clearPendingDrinkSubmit,
  clearPendingDrinkSubmitIfOtherPlayer,
  readPendingDrinkSubmit,
  writePendingDrinkSubmit,
} from '@/lib/pendingDrinkSubmit'

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

describe('pendingDrinkSubmit', () => {
  let storage: Storage

  beforeEach(() => {
    storage = memoryStorage()
  })

  it('round-trips exact payload for same-UUID retry', () => {
    const key = '11111111-1111-4111-8111-111111111111'
    const payload = {
      idempotency_key: key,
      bar_canonical_key: 'wake-view',
      drink: { mode: 'generic_beer' },
      companion_player_ids: [],
      bar_eligible_companion_ids: [],
      selected_claims: [],
      caption: null,
      photo_storage_key: null,
    }
    writePendingDrinkSubmit(
      {
        clientRequestId: key,
        playerId: 'player-a',
        cruiseConfigId: 'cruise-1',
        payload,
        summary: { barName: 'Wake View', drinkName: 'Beer' },
      },
      storage,
    )
    const read = readPendingDrinkSubmit(storage)
    expect(read?.clientRequestId).toBe(key)
    expect(read?.payload).toEqual(payload)
    expect(storage.getItem(PENDING_DRINK_SUBMIT_KEY)).toBeTruthy()
  })

  it('rejects mismatched idempotency key in payload', () => {
    storage.setItem(
      PENDING_DRINK_SUBMIT_KEY,
      JSON.stringify({
        version: 1,
        clientRequestId: 'a',
        playerId: 'p',
        cruiseConfigId: null,
        payload: { idempotency_key: 'b' },
        summary: { barName: 'x', drinkName: 'y' },
        createdAt: new Date().toISOString(),
      }),
    )
    expect(readPendingDrinkSubmit(storage)).toBeNull()
  })

  it('clears on account switch', () => {
    writePendingDrinkSubmit(
      {
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        playerId: 'player-a',
        cruiseConfigId: null,
        payload: {
          idempotency_key: '11111111-1111-4111-8111-111111111111',
          bar_canonical_key: 'wake-view',
        },
        summary: { barName: 'Wake View', drinkName: 'Beer' },
      },
      storage,
    )
    clearPendingDrinkSubmitIfOtherPlayer('player-b', storage)
    expect(readPendingDrinkSubmit(storage)).toBeNull()
  })

  it('clear removes record', () => {
    writePendingDrinkSubmit(
      {
        clientRequestId: '11111111-1111-4111-8111-111111111111',
        playerId: 'player-a',
        cruiseConfigId: null,
        payload: { idempotency_key: '11111111-1111-4111-8111-111111111111' },
        summary: { barName: 'Wake View', drinkName: 'Beer' },
      },
      storage,
    )
    clearPendingDrinkSubmit(storage)
    expect(readPendingDrinkSubmit(storage)).toBeNull()
  })
})
