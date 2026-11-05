import { describe, expect, it } from 'vitest'
import {
  buildDefaultSelections,
  hasManuallyUnselectedEligible,
  reconcileSelections,
} from '@/lib/drinkLog/claims'
import { buildSubmitPayload } from '@/lib/drinkLog/api'
import type { PreviewPayload } from '@/types/drinkLog'

const eligiblePreview = {
  ok: true,
  categories: {
    cocktail: {
      status: 'eligible',
      options: [{ category: 'cocktail', offer_id: 'o1', points: 25, source: 'current' }],
    },
    ingredient: {
      status: 'eligible',
      options: [{ category: 'ingredient', offer_id: 'o2', points: 50, source: 'current' }],
    },
    bar: {
      status: 'eligible',
      options: [{ category: 'bar', assignment_id: 'a1', points: 35, source: 'daily' }],
    },
  },
} as PreviewPayload

describe('drink log claim helpers', () => {
  it('preselects all eligible categories', () => {
    const sel = buildDefaultSelections(eligiblePreview)
    expect(sel.map((s) => s.category).sort()).toEqual(['bar', 'cocktail', 'ingredient'])
  })

  it('preserves manual deselection until eligibility identity changes', () => {
    const previous = buildDefaultSelections(eligiblePreview).filter((s) => s.category !== 'bar')
    const manuallyDeselected = new Set(['bar'])
    const next = reconcileSelections({
      preview: eligiblePreview,
      previous,
      manuallyDeselected,
    })
    expect(next.find((s) => s.category === 'bar')).toBeUndefined()
    expect(hasManuallyUnselectedEligible({ preview: eligiblePreview, selected: next })).toBe(true)
  })

  it('auto-fills bar_eligible_companion_ids from companions', () => {
    const payload = buildSubmitPayload({
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
      barCanonicalKey: 'wake-view',
      drink: { mode: 'generic_beer', displayName: 'Beer' },
      companionIds: ['11111111-1111-4111-8111-111111111111'],
      selectedClaims: [],
      caption: null,
    })
    expect(payload.companion_player_ids).toEqual(payload.bar_eligible_companion_ids)
    expect(payload.bar_eligible_companion_ids).toHaveLength(1)
  })
})
