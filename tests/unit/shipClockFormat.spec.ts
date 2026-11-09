import { describe, expect, it } from 'vitest'
import {
  advanceShipLocal,
  cruiseDayWeekdayName,
  formatPlanDeltaLabel,
  formatShipEarnedBadge,
  formatShipTimeOfDay,
  formatShipWeekdayTime,
  formatUtcOffsetLabel,
  weekdayForShipDate,
} from '@/lib/shipClockFormat'
import { copy } from '@/ui/copy'

describe('shipClockFormat', () => {
  it('formats approved time style', () => {
    expect(formatShipTimeOfDay('2099-01-03T15:05:00')).toBe('3:05 PM')
    expect(formatShipTimeOfDay('2099-01-03T00:00:00')).toBe('12:00 AM')
  })

  it('formats the ship-local weekday from the event date, including overnight', () => {
    expect(weekdayForShipDate('2026-11-03')).toBe('Tuesday')
    expect(formatShipWeekdayTime('2026-11-03T13:00:00')).toBe('Tuesday · 1:00 PM')
    expect(formatShipWeekdayTime('2026-11-03T23:59:00')).toBe('Tuesday · 11:59 PM')
    expect(formatShipWeekdayTime('2026-11-04T00:30:00')).toBe('Wednesday · 12:30 AM')
    expect(formatShipWeekdayTime('2026-11-08T11:21:00')).toBe('Sunday · 11:21 AM')
    expect(formatShipWeekdayTime('not-a-time')).toBe('not-a-time')
  })

  it('formats achievement earned badges from ship-local wall time only', () => {
    expect(formatShipEarnedBadge('2026-11-03T21:18:00')).toBe('EARNED TUESDAY AT 9:18 PM')
    expect(formatShipEarnedBadge('2026-11-03T15:32:00')).toBe('EARNED TUESDAY AT 3:32 PM')
    expect(formatShipEarnedBadge('bad')).toBe('')
  })

  it('formats organizer offset labels', () => {
    expect(formatUtcOffsetLabel(-240)).toBe('UTC−4:00')
    expect(formatUtcOffsetLabel(60)).toBe('UTC+1:00')
  })

  it('advances ship-local visually without timezone conversion', () => {
    expect(advanceShipLocal('2099-01-03T12:00:00', 90_000)).toBe('2099-01-03T12:01:30')
  })

  it('maps cruise days Saturday→Friday', () => {
    expect(cruiseDayWeekdayName(1)).toBe('Saturday')
    expect(cruiseDayWeekdayName(7)).toBe('Friday')
  })

  it('uses approved plan labels and distinguishes schedule off', () => {
    expect(formatPlanDeltaLabel(0, true)).toBe(copy.admin.planNoChange)
    expect(formatPlanDeltaLabel(0, false)).toBe(copy.admin.planDisabled)
    expect(formatPlanDeltaLabel(60, true)).toBe(copy.admin.planPlus1)
    expect(formatPlanDeltaLabel(-120, true)).toBe(copy.admin.planMinus2)
  })
})
