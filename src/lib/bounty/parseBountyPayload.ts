import type {
  ActiveBarBounty,
  ActiveCocktailBounty,
  ActiveDailyChallenge,
  ActiveIngredientBounty,
  BarBountyPayload,
  CocktailBountyPayload,
  DailyChallengePayload,
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
  const cruiseDay =
    typeof raw.cruise_day === 'number'
      ? raw.cruise_day
      : raw.cruise_day != null
        ? Number(raw.cruise_day)
        : null
  if (status === 'paused' || status === 'finale' || status === 'unavailable') {
    return {
      status,
      reason: typeof raw.reason === 'string' ? raw.reason : undefined,
      cruise_day: Number.isFinite(cruiseDay as number) ? (cruiseDay as number) : null,
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
    offering_id: typeof row.offering_id === 'string' ? row.offering_id : null,
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

export function parseBarBountyPayload(raw: unknown): BarBountyPayload {
  if (!raw || typeof raw !== 'object') {
    return { status: 'unavailable', reason: 'empty_payload' }
  }
  const row = raw as Record<string, unknown>
  if (row.status !== 'active') return asNonActive(row)

  const assignment_id = typeof row.assignment_id === 'string' ? row.assignment_id : ''
  const bar_display_name = typeof row.bar_display_name === 'string' ? row.bar_display_name : ''
  const public_end_utc = typeof row.public_end_utc === 'string' ? row.public_end_utc : ''
  const cruise_day = typeof row.cruise_day === 'number' ? row.cruise_day : Number(row.cruise_day)
  const points_base = typeof row.points_base === 'number' ? row.points_base : Number(row.points_base)
  const points_per_companion =
    typeof row.points_per_companion === 'number'
      ? row.points_per_companion
      : Number(row.points_per_companion)
  const points_cap = typeof row.points_cap === 'number' ? row.points_cap : Number(row.points_cap)

  if (
    !assignment_id ||
    !bar_display_name ||
    !public_end_utc ||
    !Number.isFinite(cruise_day) ||
    !Number.isFinite(points_base)
  ) {
    return { status: 'unavailable', reason: 'incomplete_active_payload' }
  }

  const active: ActiveBarBounty = {
    status: 'active',
    assignment_id,
    cruise_day,
    bar_id: typeof row.bar_id === 'string' ? row.bar_id : '',
    bar_canonical_key: typeof row.bar_canonical_key === 'string' ? row.bar_canonical_key : '',
    bar_display_name,
    points_base,
    points_per_companion: Number.isFinite(points_per_companion) ? points_per_companion : 10,
    points_cap: Number.isFinite(points_cap) ? points_cap : 95,
    public_end_utc,
  }
  return active
}

export function parseDailyChallengePayload(raw: unknown): DailyChallengePayload {
  if (!raw || typeof raw !== 'object') {
    return { status: 'unavailable', reason: 'empty_payload' }
  }
  const row = raw as Record<string, unknown>
  if (row.status !== 'active') return asNonActive(row)

  const challenge_id = typeof row.challenge_id === 'string' ? row.challenge_id : ''
  const title = typeof row.title === 'string' ? row.title : ''
  const instructions = typeof row.instructions === 'string' ? row.instructions : ''
  const public_end_utc = typeof row.public_end_utc === 'string' ? row.public_end_utc : ''
  const cruise_day = typeof row.cruise_day === 'number' ? row.cruise_day : Number(row.cruise_day)
  const points = typeof row.points === 'number' ? row.points : Number(row.points)

  if (
    !challenge_id ||
    !title ||
    !instructions ||
    !public_end_utc ||
    !Number.isFinite(cruise_day) ||
    points !== 50
  ) {
    return { status: 'unavailable', reason: 'incomplete_active_payload' }
  }

  const active: ActiveDailyChallenge = {
    status: 'active',
    challenge_id,
    cruise_day,
    title,
    instructions,
    location_name: typeof row.location_name === 'string' ? row.location_name : null,
    meeting_time_ship_local:
      typeof row.meeting_time_ship_local === 'string' ? row.meeting_time_ship_local : null,
    is_all_hands: Boolean(row.is_all_hands),
    photo_required: row.photo_required !== false,
    points: 50,
    public_end_utc,
  }
  return active
}
