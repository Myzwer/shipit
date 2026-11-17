/**
 * Phase 2C.13A — Ingredient Bounty bar availability parse + claim-intent gating.
 */
import { describe, expect, it } from 'vitest'
import {
  availabilityPayloadDisclosesDrinkNames,
  ingredientBarEligibilityCue,
  isBarSelectableForIngredientClaim,
  isIngredientClaimBarGuideActive,
  parseIngredientBarAvailability,
} from '@/lib/drinkLog/ingredientBarAvailability'

describe('ingredientBarAvailability (2C.13A)', () => {
  it('activates guide only for Ingredient Claim entry', () => {
    expect(isIngredientClaimBarGuideActive('ingredient')).toBe(true)
    expect(isIngredientClaimBarGuideActive('plus')).toBe(false)
    expect(isIngredientClaimBarGuideActive('cocktail')).toBe(false)
    expect(isIngredientClaimBarGuideActive('bar')).toBe(false)
    expect(isIngredientClaimBarGuideActive(undefined)).toBe(false)
  })

  it('parses one eligible bar', () => {
    const parsed = parseIngredientBarAvailability({
      status: 'active',
      bar_count: 1,
      bar_canonical_keys: ['wake-view-bar'],
      ingredient_key: 'orgeat',
    })
    expect(parsed?.bar_count).toBe(1)
    expect(parsed?.bar_canonical_keys).toEqual(['wake-view-bar'])
  })

  it('parses multiple eligible bars and dedupes keys', () => {
    const parsed = parseIngredientBarAvailability({
      status: 'active',
      bar_count: 3,
      bar_canonical_keys: ['a', 'b', 'a', 'c'],
    })
    expect(parsed?.bar_canonical_keys).toEqual(['a', 'b', 'c'])
    expect(parsed?.bar_count).toBe(3)
  })

  it('treats multiple offerings at one bar as one key', () => {
    const parsed = parseIngredientBarAvailability({
      status: 'active',
      bar_count: 1,
      bar_canonical_keys: ['crooners', 'crooners'],
    })
    expect(parsed?.bar_canonical_keys).toEqual(['crooners'])
  })

  it('does not disclose drink names in parsed payload shape', () => {
    const parsed = parseIngredientBarAvailability({
      status: 'active',
      bar_count: 2,
      bar_canonical_keys: ['lido-bar', 'sea-view-bar'],
      ingredient_key: 'falernum',
    })
    expect(parsed).toBeTruthy()
    expect(availabilityPayloadDisclosesDrinkNames(parsed!)).toBe(false)
    expect(JSON.stringify(parsed)).not.toMatch(/drink_name|cocktail_name|qualifying/i)
  })

  it('gates selection only when Ingredient Claim availability is ready', () => {
    const eligible = new Set(['wake-view-bar', 'crooners'])
    expect(
      isBarSelectableForIngredientClaim({
        guideActive: true,
        availabilityReady: true,
        eligibleKeys: eligible,
        barCanonicalKey: 'wake-view-bar',
      }),
    ).toBe(true)
    expect(
      isBarSelectableForIngredientClaim({
        guideActive: true,
        availabilityReady: true,
        eligibleKeys: eligible,
        barCanonicalKey: 'lido-bar',
      }),
    ).toBe(false)
    expect(
      isBarSelectableForIngredientClaim({
        guideActive: false,
        availabilityReady: true,
        eligibleKeys: eligible,
        barCanonicalKey: 'lido-bar',
      }),
    ).toBe(true)
    expect(
      isBarSelectableForIngredientClaim({
        guideActive: true,
        availabilityReady: false,
        eligibleKeys: eligible,
        barCanonicalKey: 'lido-bar',
      }),
    ).toBe(true)
  })

  it('uses text cue not_listed for ineligible bars under ready guidance', () => {
    const eligible = new Set(['crooners'])
    expect(
      ingredientBarEligibilityCue({
        guideActive: true,
        availabilityReady: true,
        eligibleKeys: eligible,
        barCanonicalKey: 'lido-bar',
      }),
    ).toBe('not_listed')
    expect(
      ingredientBarEligibilityCue({
        guideActive: true,
        availabilityReady: true,
        eligibleKeys: eligible,
        barCanonicalKey: 'crooners',
      }),
    ).toBe('eligible')
    expect(
      ingredientBarEligibilityCue({
        guideActive: false,
        availabilityReady: true,
        eligibleKeys: eligible,
        barCanonicalKey: 'lido-bar',
      }),
    ).toBe('none')
  })

  it('handles unavailable / incomplete payloads honestly', () => {
    expect(parseIngredientBarAvailability(null)).toBeNull()
    expect(parseIngredientBarAvailability({ status: 'unavailable', reason: 'no_active_catalog' })).toEqual(
      expect.objectContaining({
        status: 'unavailable',
        bar_count: 0,
        bar_canonical_keys: [],
      }),
    )
  })
})
