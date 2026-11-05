import { beforeEach, describe, expect, it } from 'vitest'
import {
  PENDING_CLOCK_CORRECTION_KEY,
  clearPendingClockCorrection,
  correctionFingerprint,
  readPendingClockCorrection,
  writePendingClockCorrection,
} from '@/lib/pendingClockCorrection'

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

describe('pendingClockCorrection persistence', () => {
  let storage: Storage

  beforeEach(() => {
    storage = memoryStorage()
  })

  it('round-trips request id and intent without secrets', () => {
    writePendingClockCorrection(
      {
        clientRequestId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        intent: { kind: 'plus_1h', deltaMinutes: 60 },
        beforeSnapshot: { at_utc: '2026-01-01T00:00:00Z', offset_minutes: -240 },
      },
      storage,
    )
    const raw = storage.getItem(PENDING_CLOCK_CORRECTION_KEY) ?? ''
    expect(raw).not.toMatch(/password|token|service_role/i)
    const read = readPendingClockCorrection(storage)
    expect(read?.clientRequestId).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')
    expect(read?.intent).toEqual({ kind: 'plus_1h', deltaMinutes: 60 })
  })

  it('survives clear-and-restore pattern used across navigation', () => {
    writePendingClockCorrection(
      {
        clientRequestId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        intent: { kind: 'set_time', targetShipLocal: '2099-01-03T14:00:00' },
      },
      storage,
    )
    // Simulate remount: new read from same storage.
    const again = readPendingClockCorrection(storage)
    expect(again?.intent.kind).toBe('set_time')
    clearPendingClockCorrection(storage)
    expect(readPendingClockCorrection(storage)).toBeNull()
  })

  it('builds fingerprints that match server conventions', () => {
    expect(correctionFingerprint({ kind: 'plus_1h', deltaMinutes: 60 })).toBe('manual_delta:60')
    expect(correctionFingerprint({ kind: 'minus_1h', deltaMinutes: -60 })).toBe('manual_delta:-60')
    expect(
      correctionFingerprint({ kind: 'set_time', targetShipLocal: '2099-01-03T14:00:00' }),
    ).toBe('manual_set:2099-01-03T14:00:00')
  })
})
