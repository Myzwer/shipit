import { describe, expect, it } from 'vitest'
import {
  countdownPartsFromMs,
  padCountdownUnit,
} from '@/lib/precruise/countdownParts'

describe('countdownPartsFromMs', () => {
  it('breaks remaining time into days/hours/minutes/seconds', () => {
    const ms =
      2 * 86_400_000 + 3 * 3_600_000 + 4 * 60_000 + 5_000
    expect(countdownPartsFromMs(ms)).toEqual({
      days: 2,
      hours: 3,
      minutes: 4,
      seconds: 5,
      totalMs: ms,
      expired: false,
    })
  })

  it('marks zero/negative as expired with zeroed units', () => {
    expect(countdownPartsFromMs(0)).toMatchObject({
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      expired: true,
    })
    expect(countdownPartsFromMs(-1500).expired).toBe(true)
  })
})

describe('padCountdownUnit', () => {
  it('pads single digits', () => {
    expect(padCountdownUnit(0)).toBe('00')
    expect(padCountdownUnit(9)).toBe('09')
    expect(padCountdownUnit(12)).toBe('12')
  })
})
