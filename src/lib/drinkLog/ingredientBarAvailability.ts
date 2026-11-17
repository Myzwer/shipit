/**
 * Phase 2C.13A — Ingredient Claim bar availability helpers (presentation + parse).
 * Server remains the eligibility source of truth; this never invents matching.
 */

export type IngredientBarAvailabilityStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'unavailable'
  | 'error'

export type IngredientBarAvailabilityPayload = {
  status: string
  reason?: string | null
  offer_id?: string | null
  slot_key?: string | null
  ingredient_key?: string | null
  bar_count: number
  bar_canonical_keys: string[]
}

/** True only when the wizard was opened specifically to claim Ingredient Bounty. */
export function isIngredientClaimBarGuideActive(entrySource: string | null | undefined): boolean {
  return entrySource === 'ingredient'
}

export function parseIngredientBarAvailability(raw: unknown): IngredientBarAvailabilityPayload | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  const status = typeof row.status === 'string' ? row.status : ''
  if (!status) return null

  const keysRaw = row.bar_canonical_keys
  const bar_canonical_keys = Array.isArray(keysRaw)
    ? keysRaw.map((k) => String(k ?? '').trim()).filter(Boolean)
    : []

  const countRaw =
    typeof row.bar_count === 'number' ? row.bar_count : Number(row.bar_count)
  const bar_count = Number.isFinite(countRaw)
    ? Math.max(0, Math.trunc(countRaw))
    : bar_canonical_keys.length

  return {
    status,
    reason: typeof row.reason === 'string' ? row.reason : null,
    offer_id: typeof row.offer_id === 'string' ? row.offer_id : null,
    slot_key: typeof row.slot_key === 'string' ? row.slot_key : null,
    ingredient_key: typeof row.ingredient_key === 'string' ? row.ingredient_key : null,
    bar_count,
    bar_canonical_keys: [...new Set(bar_canonical_keys)],
  }
}

/**
 * Whether a bar may be selected during Ingredient Claim guidance.
 * When guide is inactive, or availability is not ready, all bars remain selectable
 * (ordinary logging / incomplete data must not soft-lock the wizard).
 */
export function isBarSelectableForIngredientClaim(input: {
  guideActive: boolean
  availabilityReady: boolean
  eligibleKeys: ReadonlySet<string> | null
  barCanonicalKey: string
}): boolean {
  if (!input.guideActive || !input.availabilityReady || !input.eligibleKeys) return true
  return input.eligibleKeys.has(input.barCanonicalKey)
}

export function ingredientBarEligibilityCue(input: {
  guideActive: boolean
  availabilityReady: boolean
  eligibleKeys: ReadonlySet<string> | null
  barCanonicalKey: string
}): 'eligible' | 'not_listed' | 'none' {
  if (!input.guideActive || !input.availabilityReady || !input.eligibleKeys) return 'none'
  return input.eligibleKeys.has(input.barCanonicalKey) ? 'eligible' : 'not_listed'
}

/** Payload must never leak drink/cocktail names (defense-in-depth for tests/UI). */
export function availabilityPayloadDisclosesDrinkNames(payload: IngredientBarAvailabilityPayload): boolean {
  const blob = JSON.stringify(payload).toLowerCase()
  return (
    blob.includes('drink_name') ||
    blob.includes('cocktail_name') ||
    blob.includes('qualifying_drink') ||
    blob.includes('offering_name')
  )
}
