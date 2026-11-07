import { describe, expect, it } from 'vitest'
import {
  buildDrinkItStatCards,
  buildShipItStatCards,
} from '@/lib/wrapped/buildStatCards'
import type { DrinkItPersonalStats, ShipItTeamStats } from '@/types/wrapped'

describe('buildStatCards', () => {
  it('shows genuine zero personal stats as 0', () => {
    const stats: DrinkItPersonalStats = {
      final_points: 0,
      drink_logs: 0,
      distinct_bars: 0,
      distinct_named_cocktails: 0,
      daily_completions: 0,
      achievements_earned: 0,
      distinct_companions: 0,
      bounty_claims_total: 0,
      bounty_claims_by_category: { cocktail: 0, ingredient: 0, bar: 0, daily: 0 },
    }
    const cards = buildDrinkItStatCards(stats)
    expect(cards.find((c) => c.key === 'final_points')?.value).toBe('0')
    expect(cards.find((c) => c.key === 'drink_logs')?.value).toBe('0')
  })

  it('builds Ship It! ratio cards from team stats', () => {
    const stats: ShipItTeamStats = {
      final_points: 300,
      challenges_completed: 2,
      challenges_total: 50,
      distinct_categories: 1,
      category_completions: [],
      achievements_earned: 0,
      team_submissions: 2,
    }
    const cards = buildShipItStatCards(stats)
    expect(cards.find((c) => c.key === 'challenges')?.value).toBe('2/50')
    expect(cards.find((c) => c.key === 'final_points')?.value).toBe('300')
  })
})
