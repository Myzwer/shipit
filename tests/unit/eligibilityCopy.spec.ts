import { describe, expect, it } from 'vitest'
import { eligibilityReasonLabel } from '@/lib/drinkLog/eligibilityCopy'
import { copy } from '@/ui/copy'

describe('eligibilityReasonLabel', () => {
  it('maps companion and mismatch reasons from server codes', () => {
    expect(eligibilityReasonLabel('companion_required')).toBe(copy.wizard.reasonCompanion)
    expect(eligibilityReasonLabel('solo_or_no_crewmate_selected')).toBe(
      copy.wizard.reasonCrewmate,
    )
    expect(eligibilityReasonLabel('drink_or_bar_mismatch')).toBe(
      copy.wizard.reasonWrongDrinkOrBar,
    )
    expect(eligibilityReasonLabel('category_used_today')).toBe(copy.wizard.alreadyClaimed)
    expect(eligibilityReasonLabel('no_public_slot')).toBe(copy.wizard.reasonNotOpen)
  })

  it('falls back without inventing a success state', () => {
    expect(eligibilityReasonLabel(undefined)).toBe(copy.wizard.reasonGenericUnavailable)
    expect(eligibilityReasonLabel('totally_unknown')).toBe(copy.wizard.reasonGenericUnavailable)
  })
})
