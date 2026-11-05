import { describe, expect, it } from 'vitest'
import { mapHomeBountyCards } from '@/lib/bounty/mapHomeCards'
import { copy } from '@/ui/copy'
import type { ShipClockState } from '@/types/shipClock'

const baseClock = (shipLocal: string, extras: Partial<ShipClockState> = {}): ShipClockState => ({
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
  ...extras,
})

describe('mapHomeBountyCards', () => {
  it('A/B active Cocktail and Ingredient show approved fields only', () => {
    const { phase, cards } = mapHomeBountyCards({
      fetchStatus: 'ready',
      fetchedAtMs: Date.parse('2026-11-05T17:00:00.000Z'),
      nowMs: Date.parse('2026-11-05T17:00:00.000Z'),
      clock: baseClock('2099-01-03T13:00:00'),
      cocktail: {
        status: 'active',
        offer_id: 'c1',
        slot_key: 'cocktail:day:1:h13',
        drink_name: 'Fixture Spritz',
        designated_bar_key: 'piazza',
        designated_bar_name: 'Fixture Piazza',
        tier: 'familiar',
        points: 25,
        listed_ingredients: [
          { ingredient_key: 'prosecco', display_label: 'Prosecco' },
          { ingredient_key: 'aperol', display_label: 'Aperol' },
        ],
        public_end_utc: '2026-11-05T18:00:00.000Z',
      },
      ingredient: {
        status: 'active',
        offer_id: 'i1',
        slot_key: 'ingredient:day:1:h12',
        ingredient_key: 'orgeat',
        display_name: 'Orgeat',
        tier: 'less_common',
        points: 50,
        known_bar_count: 5,
        public_end_utc: '2026-11-05T19:00:00.000Z',
      },
      bar: {
        status: 'active',
        assignment_id: 'b1',
        cruise_day: 1,
        bar_id: 'uuid-bar',
        bar_canonical_key: 'wake-view',
        bar_display_name: 'Wake View',
        points_base: 25,
        points_per_companion: 10,
        points_cap: 95,
        public_end_utc: '2026-11-05T23:00:00.000Z',
      },
      daily: {
        status: 'active',
        challenge_id: 'd1',
        cruise_day: 1,
        title: 'Fixture Easy Stretch',
        instructions: 'Stretch and photograph.',
        location_name: null,
        meeting_time_ship_local: null,
        is_all_hands: false,
        photo_required: true,
        points: 50,
        public_end_utc: '2026-11-05T23:00:00.000Z',
      },
    })

    expect(phase).toBe('active')
    const cocktail = cards.find((c) => c.id === 'cocktail')!
    expect(cocktail.presentation).toBe('active')
    expect(cocktail.title).toBe('Fixture Spritz')
    expect(cocktail.tierOrEyebrow).toBe('Familiar')
    expect(cocktail.pointsLabel).toBe('25 Points')
    expect(cocktail.detail).toContain('Location: Fixture Piazza')
    expect(cocktail.detail).toContain('Prosecco')
    expect(cocktail.claimEnabled).toBe(false)

    const ingredient = cards.find((c) => c.id === 'ingredient')!
    expect(ingredient.title).toBe('Orgeat')
    expect(ingredient.tierOrEyebrow).toBe('Less Common')
    expect(ingredient.detail).toBe('Available at 5 bars')
    expect(ingredient.detail).not.toMatch(/wake|piazza|qualifying/i)

    const bar = cards.find((c) => c.id === 'bar')!
    expect(bar.presentation).toBe('active')
    expect(bar.title).toBe('Wake View')
    expect(bar.pointsLabel).toBe('35–95 Points')
    expect(bar.timerLabel).toContain('11:00 PM')

    const daily = cards.find((c) => c.id === 'daily')!
    expect(daily.presentation).toBe('active')
    expect(daily.title).toBe('Fixture Easy Stretch')
    expect(daily.pointsLabel).toBe('50 Points')
    expect(daily.claimEnabled).toBe(false)
  })

  it('E pre-opening hides objectives', () => {
    const { phase, cards } = mapHomeBountyCards({
      fetchStatus: 'ready',
      fetchedAtMs: 1,
      clock: baseClock('2099-01-03T10:00:00'),
      cocktail: { status: 'unavailable', reason: 'no_public_slot' },
      ingredient: { status: 'unavailable', reason: 'no_public_slot' },
    })
    expect(phase).toBe('pre_open')
    expect(cards.every((c) => c.presentation === 'closed')).toBe(true)
    expect(cards[0].title).toBe(copy.bounty.preOpening)
    expect(cards.every((c) => !c.title.includes('Spritz'))).toBe(true)
  })

  it('F overnight closes without leaking offers', () => {
    const { phase, cards } = mapHomeBountyCards({
      fetchStatus: 'ready',
      fetchedAtMs: 1,
      clock: baseClock('2099-01-03T23:30:00'),
      cocktail: { status: 'unavailable', reason: 'no_public_slot' },
      ingredient: { status: 'unavailable', reason: 'no_public_slot' },
    })
    expect(phase).toBe('overnight')
    expect(cards[0].title).toBe(copy.bounty.seeYouTomorrow)
  })

  it('G finale disables active bounty presentation', () => {
    const { phase, cards } = mapHomeBountyCards({
      fetchStatus: 'ready',
      fetchedAtMs: 1,
      clock: baseClock('2099-01-09T18:30:00', {
        cruise_day: 7,
        finalized: true,
        games: {
          drinkit: { status: 'final', paused: false, finalized_at_utc: 'x' },
          shipit: { status: 'final', paused: false, finalized_at_utc: 'x' },
        },
      }),
      cocktail: { status: 'finale', reason: 'friday_6pm_cutoff' },
      ingredient: { status: 'finale', reason: 'friday_6pm_cutoff' },
    })
    expect(phase).toBe('finale')
    expect(cards.every((c) => c.presentation === 'finale')).toBe(true)
    expect(cards.every((c) => c.claimEnabled === false)).toBe(true)
  })

  it('H pause shows approved unavailable messaging', () => {
    const { phase, cards } = mapHomeBountyCards({
      fetchStatus: 'ready',
      fetchedAtMs: 1,
      clock: baseClock('2099-01-03T14:00:00', {
        games: {
          drinkit: { status: 'paused', paused: true, finalized_at_utc: null },
          shipit: { status: 'active', paused: false, finalized_at_utc: null },
        },
      }),
      cocktail: { status: 'paused', reason: 'drinkit_paused' },
      ingredient: { status: 'paused', reason: 'drinkit_paused' },
    })
    expect(phase).toBe('paused')
    expect(cards[0].title).toBe(copy.bounty.pausedTitle)
    expect(cards[0].detail).toContain(copy.bounty.pausedSecondary)
  })

  it('does not invent active offers when server returns unavailable', () => {
    const { phase, cards } = mapHomeBountyCards({
      fetchStatus: 'ready',
      fetchedAtMs: 1,
      clock: baseClock('2099-01-03T14:00:00'),
      cocktail: { status: 'unavailable', reason: 'no_active_offer' },
      ingredient: { status: 'unavailable', reason: 'no_active_offer' },
    })
    expect(phase).toBe('unavailable')
    expect(cards.every((c) => c.presentation === 'unavailable')).toBe(true)
  })
})
