import { describe, expect, it } from 'vitest'
import { sortDrinkitBars } from '@/lib/drinkLog/sortBars'
import type { DrinkitBarRow } from '@/types/drinkLog'

const bars: DrinkitBarRow[] = [
  { bar_id: '1', canonical_key: 'wake-view', name: 'Wake View', deck: 15 },
  { bar_id: '2', canonical_key: 'poolside', name: 'Poolside', deck: 16 },
  { bar_id: '3', canonical_key: 'good-spirits', name: 'Good Spirits', deck: 7 },
]

const withMobile: DrinkitBarRow[] = [
  ...bars,
  {
    bar_id: 'mo',
    canonical_key: 'mobile-order',
    name: 'Mobile Order',
    deck: 0,
    is_virtual: true,
  },
]

describe('sortDrinkitBars', () => {
  it('sorts alphabetically by default', () => {
    const sorted = sortDrinkitBars(bars, 'alpha')
    expect(sorted.map((b) => b.name)).toEqual(['Good Spirits', 'Poolside', 'Wake View'])
  })

  it('sorts by deck ascending', () => {
    const sorted = sortDrinkitBars(bars, 'deck')
    expect(sorted.map((b) => b.deck)).toEqual([7, 15, 16])
  })

  it('keeps Mobile Order last for alpha and deck sorts', () => {
    expect(sortDrinkitBars(withMobile, 'alpha').at(-1)?.canonical_key).toBe('mobile-order')
    expect(sortDrinkitBars(withMobile, 'deck').at(-1)?.canonical_key).toBe('mobile-order')
  })
})
