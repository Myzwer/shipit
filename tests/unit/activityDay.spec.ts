import { describe, expect, it } from 'vitest'
import {
  activityClockMinutesFromShipLocalTime,
  activityDateFromShipLocal,
  matchesAfterHourWindow,
  matchesBeforeHourWindow,
} from '@/lib/activityDay'

describe('activity day boundary (05:00 ship-local)', () => {
  it('orders 11:18 PM earlier than 1:34 AM in the same overnight activity day', () => {
    const evening = activityClockMinutesFromShipLocalTime(23, 18)
    const overnight = activityClockMinutesFromShipLocalTime(1, 34)
    expect(evening).toBeLessThan(overnight)
  })

  it('assigns 4:59 AM to the prior activity calendar date', () => {
    expect(activityDateFromShipLocal('2026-11-10', 4, 59)).toBe('2026-11-09')
    expect(activityDateFromShipLocal('2026-11-10', 4, 59, 59)).toBe('2026-11-09')
  })

  it('begins the next activity day at 5:00 AM', () => {
    expect(activityDateFromShipLocal('2026-11-10', 5, 0)).toBe('2026-11-10')
    expect(activityDateFromShipLocal('2026-11-10', 8, 30)).toBe('2026-11-10')
    expect(activityDateFromShipLocal('2026-11-09', 23, 18)).toBe('2026-11-09')
  })

  it('Early Bird-style before_hour excludes post-midnight clock hours', () => {
    expect(matchesBeforeHourWindow(1, 34, 11)).toBe(false)
    expect(matchesBeforeHourWindow(4, 59, 11)).toBe(false)
    expect(matchesBeforeHourWindow(5, 0, 11)).toBe(true)
    expect(matchesBeforeHourWindow(10, 59, 11)).toBe(true)
    expect(matchesBeforeHourWindow(11, 0, 11)).toBe(false)
  })

  it('Night Owl-style after_hour includes 1:34 AM', () => {
    expect(matchesAfterHourWindow(23, 18, 23)).toBe(true)
    expect(matchesAfterHourWindow(1, 34, 23)).toBe(true)
    expect(matchesAfterHourWindow(4, 59, 23)).toBe(true)
    expect(matchesAfterHourWindow(5, 0, 23)).toBe(false)
    expect(matchesAfterHourWindow(22, 0, 22)).toBe(true)
    expect(matchesAfterHourWindow(21, 59, 22)).toBe(false)
  })
})
