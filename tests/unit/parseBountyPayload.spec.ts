import { describe, expect, it } from 'vitest'
import {
  parseCocktailBountyPayload,
  parseIngredientBountyPayload,
} from '@/lib/bounty/parseBountyPayload'

describe('parseBountyPayload', () => {
  it('never invents active cocktail offers from incomplete data', () => {
    expect(parseCocktailBountyPayload(null).status).toBe('unavailable')
    expect(parseCocktailBountyPayload({ status: 'active', drink_name: 'X' }).status).toBe(
      'unavailable',
    )
    expect(parseCocktailBountyPayload({ status: 'paused', reason: 'drinkit_paused' })).toEqual({
      status: 'paused',
      reason: 'drinkit_paused',
    })
  })

  it('parses ingredient active payload without extra fields', () => {
    const parsed = parseIngredientBountyPayload({
      status: 'active',
      offer_id: 'i1',
      slot_key: 'ingredient:day:1:h12',
      ingredient_key: 'orgeat',
      display_name: 'Orgeat',
      tier: 'less_common',
      points: 50,
      known_bar_count: 4,
      public_end_utc: '2026-11-05T18:00:00Z',
      secret_bars: ['should-ignore'],
    })
    expect(parsed.status).toBe('active')
    if (parsed.status === 'active') {
      expect(parsed.display_name).toBe('Orgeat')
      expect(parsed.known_bar_count).toBe(4)
      expect(JSON.stringify(parsed)).not.toContain('secret_bars')
    }
  })
})
