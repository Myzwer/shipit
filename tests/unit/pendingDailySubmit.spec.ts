import { beforeEach, describe, expect, it } from 'vitest'
import {
  PENDING_DAILY_SUBMIT_KEY,
  clearPendingDailySubmit,
  clearPendingDailySubmitIfOtherPlayer,
  readPendingDailySubmit,
  writePendingDailySubmit,
} from '@/lib/pendingDailySubmit'

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

describe('pendingDailySubmit', () => {
  let storage: Storage

  beforeEach(() => {
    storage = memoryStorage()
  })

  it('persists exact UUID + photo_id payload for recovery after day change', () => {
    const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const payload = {
      idempotency_key: key,
      challenge_id: 'day1-challenge',
      photo_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      caption: 'Day 1',
    }
    writePendingDailySubmit(
      {
        clientRequestId: key,
        playerId: 'player-a',
        cruiseConfigId: null,
        payload,
        summary: { title: 'Day 1 Daily', points: 50 },
      },
      storage,
    )
    const read = readPendingDailySubmit(storage)
    expect(read?.payload).toEqual(payload)
    expect(read?.payload.challenge_id).toBe('day1-challenge')
    expect(storage.getItem(PENDING_DAILY_SUBMIT_KEY)).toBeTruthy()
  })

  it('clears foreign player pending so peers cannot overwrite', () => {
    writePendingDailySubmit(
      {
        clientRequestId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        playerId: 'player-a',
        cruiseConfigId: null,
        payload: {
          idempotency_key: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          challenge_id: 'c1',
          photo_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          caption: null,
        },
        summary: { title: 'T', points: 50 },
      },
      storage,
    )
    clearPendingDailySubmitIfOtherPlayer('player-b', storage)
    expect(readPendingDailySubmit(storage)).toBeNull()
    clearPendingDailySubmit(storage)
  })
})
