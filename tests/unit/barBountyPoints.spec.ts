import { describe, expect, it } from 'vitest'
import { pointsFromSelectedMates, provisionalBarCrewPoints } from '@/lib/bounty/barBountyPoints'

describe('provisionalBarCrewPoints', () => {
  it('matches B2 crew bands', () => {
    expect(provisionalBarCrewPoints(3, 1)).toBe(0)
    expect(provisionalBarCrewPoints(3, 2)).toBe(20)
    expect(provisionalBarCrewPoints(3, 3)).toBe(40)
    expect(provisionalBarCrewPoints(4, 1)).toBe(0)
    expect(provisionalBarCrewPoints(4, 2)).toBe(20)
    expect(provisionalBarCrewPoints(4, 3)).toBe(30)
    expect(provisionalBarCrewPoints(4, 4)).toBe(40)
  })

  it('selected mates map through claimant + mates', () => {
    expect(pointsFromSelectedMates(3, 0)).toBe(0)
    expect(pointsFromSelectedMates(3, 1)).toBe(20)
    expect(pointsFromSelectedMates(3, 2)).toBe(40)
    expect(pointsFromSelectedMates(4, 2)).toBe(30)
    expect(pointsFromSelectedMates(4, 3)).toBe(40)
  })
})
