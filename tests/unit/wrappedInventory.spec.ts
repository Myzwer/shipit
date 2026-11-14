import { describe, expect, it } from 'vitest'
import {
  ALL_WRAPPED_INVENTORY,
  DRINKIT_COLLECTIVE,
  DRINKIT_GLOBAL,
  DRINKIT_PERSONAL,
  DRINKIT_WRAPPED_INVENTORY,
  EXCLUDED_WRAPPED_LABELS,
  SHIPIT_COLLECTIVE,
  SHIPIT_GLOBAL,
  SHIPIT_PERSONAL,
  SHIPIT_WRAPPED_INVENTORY,
  assertInventoryCounts,
  inventoryIdsForGame,
} from '@/lib/wrapped/inventory'
import {
  buildCollectiveCards,
  buildGlobalAwardCards,
  buildPersonalCards,
} from '@/lib/wrapped/buildFinalCards'
import type { WrappedEntry } from '@/types/wrapped'

function stubEntry(specId: string, label: string, overrides: Partial<WrappedEntry> = {}): WrappedEntry {
  return {
    spec_id: specId,
    label,
    available: true,
    kind: 'count',
    primary: '1',
    secondary: null,
    value_numeric: 1,
    unit: 'count',
    winners: [],
    items: [],
    photo: null,
    explanation: null,
    empty_reason: null,
    ...overrides,
  }
}

describe('Wrapped final inventory', () => {
  it('defines exactly 80 approved entries in order', () => {
    const counts = assertInventoryCounts()
    expect(counts).toEqual({ drinkit: 46, shipit: 34, total: 80 })
    expect(DRINKIT_PERSONAL).toHaveLength(18)
    expect(DRINKIT_GLOBAL).toHaveLength(16)
    expect(DRINKIT_COLLECTIVE).toHaveLength(12)
    expect(SHIPIT_PERSONAL).toHaveLength(10)
    expect(SHIPIT_GLOBAL).toHaveLength(12)
    expect(SHIPIT_COLLECTIVE).toHaveLength(12)
  })

  it('preserves DI-* and SI-* identifiers in approved order', () => {
    expect(inventoryIdsForGame('drinkit')).toEqual([
      ...DRINKIT_PERSONAL.map((e) => e.specId),
      ...DRINKIT_GLOBAL.map((e) => e.specId),
      ...DRINKIT_COLLECTIVE.map((e) => e.specId),
    ])
    expect(inventoryIdsForGame('shipit')[0]).toBe('SI-P01')
    expect(inventoryIdsForGame('shipit').at(-1)).toBe('SI-C12')
    expect(DRINKIT_WRAPPED_INVENTORY.map((e) => e.specId)).toContain('DI-G11')
    expect(DRINKIT_WRAPPED_INVENTORY.map((e) => e.specId)).toContain('DI-G12')
    expect(SHIPIT_WRAPPED_INVENTORY.map((e) => e.specId)).toContain('SI-G09')
    expect(SHIPIT_WRAPPED_INVENTORY.map((e) => e.specId)).toContain('SI-G10')
  })

  it('does not include explicitly rejected labels', () => {
    const labels = ALL_WRAPPED_INVENTORY.map((e) => e.label)
    for (const excluded of EXCLUDED_WRAPPED_LABELS) {
      // Highest-Value Challenge (team personal) is excluded; global SI-G10 stays.
      if (excluded === 'Highest-Value Challenge') {
        expect(labels).not.toContain(excluded)
        expect(labels).toContain('Highest-Value Challenge Completed')
        continue
      }
      expect(labels).not.toContain(excluded)
    }
    expect(labels).not.toContain('Drinking Buddies')
    expect(labels).not.toContain('Most Social Drinks')
    expect(labels).not.toContain('Categories Explored')
  })

  it('builds personal cards with unavailable favorites as No qualifying data', () => {
    const cards = buildPersonalCards([
      stubEntry('DI-P01', 'Drinks Logged', { primary: '0', value_numeric: 0 }),
      stubEntry('DI-P12', 'Favorite Drink', {
        available: false,
        kind: 'named_count',
        primary: 'No qualifying data',
      }),
    ])
    expect(cards[0]?.value).toBe('0')
    expect(cards[0]?.layout).toBe('compact')
    expect(cards[1]?.value).toBe('No qualifying data')
    expect(cards[1]?.available).toBe(false)
    expect(cards[1]?.layout).toBe('text')
  })

  it('maps Drink It! personal stats to hybrid compact/full layouts', () => {
    const cards = buildPersonalCards([
      stubEntry('DI-P01', 'Drinks Logged', { primary: '6', value_numeric: 6 }),
      stubEntry('DI-P03', 'Final Rank', { kind: 'rank', primary: '2', secondary: 'of 11' }),
      stubEntry('DI-P04', 'Achievements Unlocked', { primary: '14', value_numeric: 14 }),
      stubEntry('DI-P11', 'Bars Visited', { primary: '5', value_numeric: 5 }),
      stubEntry('DI-P12', 'Favorite Drink', {
        kind: 'named_count',
        primary: 'Sand Meets the Sea',
        secondary: '2 drinks',
      }),
      stubEntry('DI-P14', 'Favorite Ingredient', {
        kind: 'named_count',
        primary: 'agave, lime wheel, lychee liqueur',
        secondary: '3 drinks',
        winners: [
          { id: '1', name: 'agave', value: 3, detail: null },
          { id: '2', name: 'lime wheel', value: 3, detail: null },
          { id: '3', name: 'lychee liqueur', value: 3, detail: null },
        ],
      }),
    ])
    expect(cards.map((c) => [c.key, c.layout, c.span])).toEqual([
      ['DI-P01', 'compact', 'half'],
      ['DI-P03', 'compact', 'half'],
      ['DI-P04', 'compact', 'half'],
      ['DI-P11', 'compact', 'half'],
      ['DI-P12', 'text', 'full'],
      ['DI-P14', 'text', 'full'],
    ])
    // Compact half-pairs checkerboard; full-width keeps sequential stream tones.
    expect(cards.map((c) => c.tone)).toEqual([
      'aqua',
      'cream',
      'cream',
      'aqua',
      'aqua',
      'cream',
    ])
  })

  it('spans an orphan compact metric across the full row', () => {
    const cards = buildPersonalCards([
      stubEntry('DI-P01', 'Drinks Logged', { primary: '6' }),
      stubEntry('DI-P11', 'Bars Visited', { primary: '5' }),
      stubEntry('DI-P12', 'Favorite Drink', {
        kind: 'named_count',
        primary: 'Gin Fizz',
      }),
    ])
    // P01+P11 pair as halves when consecutive compact…
    expect(cards[0]?.span).toBe('half')
    expect(cards[1]?.span).toBe('half')
    expect(cards[2]?.span).toBe('full')

    const orphan = buildPersonalCards([
      stubEntry('DI-P01', 'Drinks Logged', { primary: '6' }),
      stubEntry('DI-P12', 'Favorite Drink', {
        kind: 'named_count',
        primary: 'Gin Fizz',
      }),
    ])
    expect(orphan[0]?.layout).toBe('compact')
    expect(orphan[0]?.span).toBe('full')
    expect(orphan[1]?.span).toBe('full')
  })

  it('renders tied global awards without inventing a single winner', () => {
    const cards = buildGlobalAwardCards([
      stubEntry('DI-G02', 'Most Drinks Logged', {
        kind: 'winners',
        primary: 'Cindy & Dan (tied)',
        winners: [
          { id: '1', name: 'Cindy', value: 7, detail: null },
          { id: '2', name: 'Dan', value: 7, detail: null },
        ],
        secondary: '7 drinks',
      }),
    ])
    expect(cards[0]?.primary).toContain('Cindy')
    expect(cards[0]?.primary).toContain('Dan')
  })

  it('keeps Category Leaders as one grouped award with items', () => {
    const cards = buildGlobalAwardCards([
      stubEntry('SI-G09', 'Category Leaders', {
        kind: 'category_leaders',
        primary: 'Category Leaders',
        items: [
          {
            category: 'classic_ship_landmarks',
            label: 'Classic Ship Landmarks',
            count: 4,
            winners: [{ name: 'Team 5' }],
          },
        ],
      }),
    ])
    expect(cards).toHaveLength(1)
    expect(cards[0]?.items?.[0]?.label).toBe('Classic Ship Landmarks')
  })

  it('shows Every challenge was completed for empty SI-C08 list', () => {
    const cards = buildCollectiveCards([
      stubEntry('SI-C08', 'Uncompleted Challenge List', {
        kind: 'list',
        primary: 'Every challenge was completed!',
        items: [],
      }),
    ])
    expect(cards[0]?.primary).toBe('Every challenge was completed!')
  })
})
