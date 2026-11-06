import { describe, expect, it } from 'vitest'
import { buildSubmitPayload } from '@/lib/drinkLog/api'

describe('buildSubmitPayload photo_id', () => {
  const base = {
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    barCanonicalKey: 'wake-view',
    drink: {
      mode: 'generic_beer' as const,
      displayName: 'Beer',
    },
    companionIds: [] as string[],
    selectedClaims: [] as Array<{ category: string }>,
    caption: null as string | null,
  }

  it('omits photo_id when no photo so legacy fingerprints stay compatible', () => {
    const payload = buildSubmitPayload(base)
    expect(payload).not.toHaveProperty('photo_id')
    expect(payload.photo_storage_key).toBeNull()
  })

  it('includes photo_id when staged', () => {
    const payload = buildSubmitPayload({
      ...base,
      photoId: '22222222-2222-4222-8222-222222222222',
    })
    expect(payload.photo_id).toBe('22222222-2222-4222-8222-222222222222')
    expect(payload.photo_storage_key).toBeNull()
  })
})
