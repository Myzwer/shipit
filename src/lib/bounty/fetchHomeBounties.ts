/**
 * Player-facing Home bounty reads — combined board RPC (one server now()).
 * No client-supplied timestamps.
 */
import { supabase, isSupabaseConfigured } from '@/lib/supabase'
import {
  parseBarBountyPayload,
  parseCocktailBountyPayload,
  parseDailyChallengePayload,
  parseIngredientBountyPayload,
} from '@/lib/bounty/parseBountyPayload'
import type { HomeBountySnapshot } from '@/types/bountyHome'
import type { ShipClockState } from '@/types/shipClock'

export class HomeBountyError extends Error {
  code: 'unavailable' | 'error' | 'not_configured' | 'inconsistent'

  constructor(
    message: string,
    code: 'unavailable' | 'error' | 'not_configured' | 'inconsistent' = 'error',
  ) {
    super(message)
    this.name = 'HomeBountyError'
    this.code = code
  }
}

function activeDays(parts: Array<{ status: string; cruise_day?: number | null }>): number[] {
  const days: number[] = []
  for (const p of parts) {
    if (p.status === 'active' && typeof p.cruise_day === 'number' && Number.isFinite(p.cruise_day)) {
      days.push(p.cruise_day)
    }
  }
  return days
}

export async function fetchHomeBountySnapshot(): Promise<HomeBountySnapshot> {
  if (!isSupabaseConfigured || !supabase) {
    throw new HomeBountyError('Supabase is not configured.', 'unavailable')
  }

  const { data, error } = await supabase.rpc('get_my_drinkit_home_board')
  if (error) throw new HomeBountyError(error.message, 'error')

  const board = data as Record<string, unknown> | null
  if (!board || typeof board !== 'object') {
    throw new HomeBountyError('Empty home board payload.', 'error')
  }

  const clock = board.clock as ShipClockState
  if (!clock?.configured) {
    throw new HomeBountyError(
      (clock as { error?: string } | null)?.error ?? 'NO_ACTIVE_CRUISE_CONFIG',
      'not_configured',
    )
  }

  const cocktail = parseCocktailBountyPayload(board.cocktail)
  const ingredient = parseIngredientBountyPayload(board.ingredient)
  const bar = parseBarBountyPayload(board.bar)
  const daily = parseDailyChallengePayload(board.daily)

  const cruiseDayRaw = board.cruise_day
  const cruiseDay =
    typeof cruiseDayRaw === 'number'
      ? cruiseDayRaw
      : cruiseDayRaw != null
        ? Number(cruiseDayRaw)
        : clock.cruise_day ?? null

  // Reject combining active fixed-daily cards from different cruise days.
  const days = activeDays([bar, daily])
  if (
    days.length >= 2 &&
    new Set(days).size > 1
  ) {
    throw new HomeBountyError('Inconsistent cruise day across home board cards.', 'inconsistent')
  }
  if (
    typeof cruiseDay === 'number' &&
    days.length >= 1 &&
    days.some((d) => d !== cruiseDay)
  ) {
    throw new HomeBountyError('Home board cruise day mismatch.', 'inconsistent')
  }

  return {
    cocktail,
    ingredient,
    bar,
    daily,
    clock,
    cruiseDay: Number.isFinite(cruiseDay as number) ? (cruiseDay as number) : null,
    fetchedAtMs: Date.now(),
    serverAtUtc: typeof clock.at_utc === 'string' ? clock.at_utc : null,
  }
}
