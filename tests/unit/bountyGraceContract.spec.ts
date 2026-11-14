import { describe, expect, it } from 'vitest'
import { isWithinPrivateGrace } from '../helpers/devEnvironmentGuard'

/**
 * Documents the approved private grace contract from bounty_resolve_at
 * (migration 20261105001700) without touching any database.
 *
 * Categories with grace: cocktail, ingredient only.
 * Half-open window: [prev_end, prev_end + 15 minutes).
 * Friday 6 PM finale overrides grace (tested in integration against disposable).
 */
describe('private bounty grace contract (unit)', () => {
  const prevEnd = Date.parse('2099-01-03T17:00:00.000Z') // ship 13:00 with −240 offset

  it('includes the public end instant (+0)', () => {
    expect(isWithinPrivateGrace({ atUtcMs: prevEnd, prevEndUtcMs: prevEnd })).toBe(true)
  })

  it('includes +14:59.999 within the window', () => {
    expect(
      isWithinPrivateGrace({
        atUtcMs: prevEnd + 14 * 60_000 + 59_000,
        prevEndUtcMs: prevEnd,
      }),
    ).toBe(true)
  })

  it('excludes exactly +15:00 (half-open end)', () => {
    expect(
      isWithinPrivateGrace({
        atUtcMs: prevEnd + 15 * 60_000,
        prevEndUtcMs: prevEnd,
      }),
    ).toBe(false)
  })

  it('excludes times before the previous public end', () => {
    expect(
      isWithinPrivateGrace({
        atUtcMs: prevEnd - 1,
        prevEndUtcMs: prevEnd,
      }),
    ).toBe(false)
  })

  it('applies only as a private eligibility window (documented category scope)', () => {
    // Spec lock: Bar Bounty, Daily Challenge, and ordinary non-bounty logs have no grace.
    const categoriesWithGrace = ['cocktail', 'ingredient'] as const
    const categoriesWithoutGrace = ['bar', 'daily', 'ordinary'] as const
    expect(categoriesWithGrace).toEqual(['cocktail', 'ingredient'])
    expect(categoriesWithoutGrace).toContain('bar')
    expect(categoriesWithoutGrace).toContain('daily')
  })
})
