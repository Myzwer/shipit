import { describe, expect, it } from 'vitest'
import { deriveHomeBoardPhase } from '@/lib/bounty/boardPhase'
import type { ShipClockState } from '@/types/shipClock'

const clock = (shipLocal: string): ShipClockState => ({
  configured: true,
  at_utc: '2026-11-05T17:00:00.000Z',
  offset_minutes: -240,
  ship_local: shipLocal,
  ship_date: shipLocal.slice(0, 10),
  cruise_day: 1,
  lifecycle: 'active',
  games: {
    drinkit: { status: 'active', paused: false, finalized_at_utc: null },
    shipit: { status: 'active', paused: false, finalized_at_utc: null },
  },
})

describe('deriveHomeBoardPhase claimed rotating cards', () => {
  it('keeps mid-day active when both Cocktail and Ingredient are already claimed', () => {
    const phase = deriveHomeBoardPhase({
      fetchStatus: 'ready',
      clock: clock('2099-01-03T15:00:00'),
      cocktail: {
        status: 'already_claimed',
        reason: 'category_used_today',
        drink_name: 'Spritz',
        points: 25,
      },
      ingredient: {
        status: 'already_claimed',
        reason: 'category_used_today',
        display_name: 'Orgeat',
        points: 50,
      },
    })
    expect(phase).toBe('active')
  })
})
