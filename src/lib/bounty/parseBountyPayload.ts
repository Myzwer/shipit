import type {
  ActiveCocktailBounty,
  ActiveIngredientBounty,
  CocktailBountyPayload,
  IngredientBountyPayload,
  ListedIngredient,
  NonActiveBounty,
} from '@/types/bountyHome'

function asListedIngredients(raw: unknown): ListedIngredient[] {
  if (!Array.isArray(raw)) return []
  const out: ListedIngredient[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const key = typeof row.ingredient_key === 'string' ? row.ingredient_key : ''
    const label = typeof row.display_label === 'string' ? row.display_label : ''
    if (!label) continue
    out.push({ ingredient_key: key, display_label: label })
  }
  return out
}

function asNonActive(raw: Record<string, unknown>): NonActiveBounty {
  const status = raw.status
  if (status === 'paused' || status === 'finale' || status === 'unavailable') {
    return {
      status,
      reason: typeof raw.reason === 'string' ? raw.reason : undefined,
    }
  }
  return { status: 'unavailable', reason: 'unexpected_payload' }
}

/** Narrow RPC jsonb into a typed Cocktail payload. Never invents an active offer. */
export function parseCocktailBountyPayload(raw: unknown): CocktailBountyPayload {
  if (!raw || typeof raw !== 'object') {
    return { status: 'unavailable', reason: 'empty_payload' }
  }
  const row = raw as Record<string, unknown>
  if (row.status !== 'active') return asNonActive(row)

  const drink_name = typeof row.drink_name === 'string' ? row.drink_name : ''
  const designated_bar_name =
    typeof row.designated_bar_name === 'string' ? row.designated_bar_name : ''
  const offer_id = typeof row.offer_id === 'string' ? row.offer_id : ''
  const public_end_utc = typeof row.public_end_utc === 'string' ? row.public_end_utc : ''
  const points = typeof row.points === 'number' ? row.points : Number(row.points)

  if (!drink_name || !offer_id || !public_end_utc || !Number.isFinite(points)) {
    return { status: 'unavailable', reason: 'incomplete_active_payload' }
  }

  const active: ActiveCocktailBounty = {
    status: 'active',
    offer_id,
    slot_key: typeof row.slot_key === 'string' ? row.slot_key : '',
    drink_name,
    designated_bar_key:
      typeof row.designated_bar_key === 'string' ? row.designated_bar_key : '',
    designated_bar_name,
    tier: typeof row.tier === 'string' ? row.tier : '',
    points,
    listed_ingredients: asListedIngredients(row.listed_ingredients),
    public_end_utc,
  }
  return active
}

/** Narrow RPC jsonb into a typed Ingredient payload. Never invents an active offer. */
export function parseIngredientBountyPayload(raw: unknown): IngredientBountyPayload {
  if (!raw || typeof raw !== 'object') {
    return { status: 'unavailable', reason: 'empty_payload' }
  }
  const row = raw as Record<string, unknown>
  if (row.status !== 'active') return asNonActive(row)

  const display_name = typeof row.display_name === 'string' ? row.display_name : ''
  const offer_id = typeof row.offer_id === 'string' ? row.offer_id : ''
  const public_end_utc = typeof row.public_end_utc === 'string' ? row.public_end_utc : ''
  const points = typeof row.points === 'number' ? row.points : Number(row.points)
  const known_bar_count =
    typeof row.known_bar_count === 'number'
      ? row.known_bar_count
      : Number(row.known_bar_count)

  if (
    !display_name ||
    !offer_id ||
    !public_end_utc ||
    !Number.isFinite(points) ||
    !Number.isFinite(known_bar_count)
  ) {
    return { status: 'unavailable', reason: 'incomplete_active_payload' }
  }

  const active: ActiveIngredientBounty = {
    status: 'active',
    offer_id,
    slot_key: typeof row.slot_key === 'string' ? row.slot_key : '',
    ingredient_key: typeof row.ingredient_key === 'string' ? row.ingredient_key : '',
    display_name,
    tier: typeof row.tier === 'string' ? row.tier : '',
    points,
    known_bar_count,
    public_end_utc,
  }
  return active
}
