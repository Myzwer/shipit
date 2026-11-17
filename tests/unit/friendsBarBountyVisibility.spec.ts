/**
 * Phase 2C.11 — Friends-step Bar Bounty chrome visibility (presentation only).
 */
import { describe, expect, it } from 'vitest'
import { computeShowBarBountyFriendsUi } from '@/lib/drinkLog/friendsBarBountyUi'

describe('computeShowBarBountyFriendsUi (2C.11)', () => {
  it('A: featured bar + reminder + unclaimed → show crew chrome', () => {
    expect(
      computeShowBarBountyFriendsUi({
        showBarReminder: true,
        selectedBarCanonicalKey: 'featured-bar',
        preview: {
          claimable: true,
          status: 'eligible',
          already_claimed: false,
        },
      }),
    ).toBe(true)
  })

  it('B: different bar + unclaimed → hide even with assigned crew context', () => {
    expect(
      computeShowBarBountyFriendsUi({
        showBarReminder: false,
        selectedBarCanonicalKey: 'other-bar',
        preview: {
          claimable: false,
          already_claimed: false,
          status: 'unavailable',
          reason: 'not_featured_bar',
          featured_bar_key: 'featured-bar',
        },
      }),
    ).toBe(false)
  })

  it('C: different bar + already claimed → hide (no claimed banner on Friends)', () => {
    expect(
      computeShowBarBountyFriendsUi({
        showBarReminder: false,
        selectedBarCanonicalKey: 'other-bar',
        preview: {
          claimable: false,
          already_claimed: true,
          status: 'already_claimed',
        },
      }),
    ).toBe(false)
  })

  it('D: featured bar + already claimed → hide', () => {
    expect(
      computeShowBarBountyFriendsUi({
        showBarReminder: false,
        selectedBarCanonicalKey: 'featured-bar',
        preview: {
          claimable: false,
          already_claimed: true,
          status: 'already_claimed',
        },
      }),
    ).toBe(false)
  })

  it('E: Ingredient-style ordinary log at unrelated bar → hide', () => {
    expect(
      computeShowBarBountyFriendsUi({
        showBarReminder: false,
        selectedBarCanonicalKey: 'ingredient-bar',
        preview: {
          claimable: false,
          status: 'unavailable',
          reason: 'not_featured_bar',
          featured_bar_key: 'featured-bar',
        },
      }),
    ).toBe(false)
  })

  it('F: bar change from featured→other recalculates off', () => {
    expect(
      computeShowBarBountyFriendsUi({
        showBarReminder: true,
        selectedBarCanonicalKey: 'featured-bar',
        preview: { claimable: true, status: 'eligible' },
      }),
    ).toBe(true)

    expect(
      computeShowBarBountyFriendsUi({
        showBarReminder: false,
        selectedBarCanonicalKey: 'other-bar',
        preview: {
          claimable: false,
          status: 'unavailable',
          reason: 'not_featured_bar',
          featured_bar_key: 'featured-bar',
        },
      }),
    ).toBe(false)
  })

  it('hides when claim flips to already_claimed while reminder still true', () => {
    expect(
      computeShowBarBountyFriendsUi({
        showBarReminder: true,
        selectedBarCanonicalKey: 'featured-bar',
        preview: {
          already_claimed: true,
          status: 'already_claimed',
          claimable: false,
        },
      }),
    ).toBe(false)
  })

  it('preview claimable fallback when reminder lagged', () => {
    expect(
      computeShowBarBountyFriendsUi({
        showBarReminder: false,
        selectedBarCanonicalKey: 'featured-bar',
        preview: { claimable: true, status: 'eligible' },
      }),
    ).toBe(true)
  })

  it('no active bounty / no selected bar → hide', () => {
    expect(
      computeShowBarBountyFriendsUi({
        showBarReminder: false,
        selectedBarCanonicalKey: null,
        preview: null,
      }),
    ).toBe(false)
  })
})
