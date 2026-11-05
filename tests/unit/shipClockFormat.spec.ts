import { describe, expect, it } from 'vitest'
import {
  advanceShipLocal,
  cruiseDayWeekdayName,
  formatPlanDeltaLabel,
  formatShipTimeOfDay,
  formatUtcOffsetLabel,
} from '@/lib/shipClockFormat'
import { copy } from '@/ui/copy'

describe('shipClockFormat', () => {
  it('formats approved time style', () => {
    expect(formatShipTimeOfDay('2099-01-03T15:05:00')).toBe('3:05 PM')
    expect(formatShipTimeOfDay('2099-01-03T00:00:00')).toBe('12:00 AM')
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
