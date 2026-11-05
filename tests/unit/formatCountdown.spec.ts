import { describe, expect, it } from 'vitest'
import { formatRemainingMs, remainingUntilUtc } from '@/lib/bounty/formatCountdown'

describe('formatCountdown', () => {
  it('formats MM:SS and H:MM:SS', () => {
    expect(formatRemainingMs(45_000)).toBe('0:45')
    expect(formatRemainingMs(125_000)).toBe('2:05')
    expect(formatRemainingMs(3_725_000)).toBe('1:02:05')
    expect(formatRemainingMs(-1000)).toBe('0:00')
  })

  it('estimates remaining from server snapshot without device timezone', () => {
    const serverAt = '2026-11-05T17:00:00.000Z'
    const end = '2026-11-05T18:00:00.000Z'
    const fetchedAt = 1_000_000
    // 30 minutes after fetch
    const rem = remainingUntilUtc(end, serverAt, fetchedAt, fetchedAt + 30 * 60_000)
    expect(rem).toBe(30 * 60_000)
  })
})
