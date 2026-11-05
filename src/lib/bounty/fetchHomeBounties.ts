/**
 * Player-facing Home bounty reads — zero-arg RPCs only. No client timestamps.
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import { parseCocktailBountyPayload, parseIngredientBountyPayload } from '@/lib/bounty/parseBountyPayload'
import type {
  CocktailBountyPayload,
  HomeBountySnapshot,
  IngredientBountyPayload,
} from '@/types/bountyHome'
import type { ShipClockState } from '@/types/shipClock'

export class HomeBountyError extends Error {
  code: 'unavailable' | 'error' | 'not_configured'

  constructor(message: string, code: 'unavailable' | 'error' | 'not_configured' = 'error') {
    super(message)
    this.name = 'HomeBountyError'
    this.code = code
  }
}

export async function fetchHomeBountySnapshot(): Promise<HomeBountySnapshot> {
  if (!isSupabaseConfigured || !supabase) {
    throw new HomeBountyError('Supabase is not configured.', 'unavailable')
  }

  const [cocktailRes, ingredientRes, clockRes] = await Promise.all([
    supabase.rpc('get_my_current_cocktail_bounty'),
    supabase.rpc('get_my_current_ingredient_bounty'),
    supabase.rpc('get_ship_clock_state'),
  ])

  if (cocktailRes.error) throw new HomeBountyError(cocktailRes.error.message, 'error')
  if (ingredientRes.error) throw new HomeBountyError(ingredientRes.error.message, 'error')
  if (clockRes.error) throw new HomeBountyError(clockRes.error.message, 'error')

  const clock = clockRes.data as ShipClockState
  if (!clock?.configured) {
    throw new HomeBountyError(clock?.error ?? 'NO_ACTIVE_CRUISE_CONFIG', 'not_configured')
  }

  const cocktail: CocktailBountyPayload = parseCocktailBountyPayload(cocktailRes.data)
  const ingredient: IngredientBountyPayload = parseIngredientBountyPayload(ingredientRes.data)

  return {
    cocktail,
    ingredient,
    clock,
    fetchedAtMs: Date.now(),
    serverAtUtc: typeof clock.at_utc === 'string' ? clock.at_utc : null,
  }
}
