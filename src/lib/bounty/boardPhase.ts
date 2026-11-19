import { parseShipLocal } from '@/lib/shipClockFormat'
import type {
  CocktailBountyPayload,
  HomeBoardPhase,
  IngredientBountyPayload,
} from '@/types/bountyHome'
import type { ShipClockState } from '@/types/shipClock'

/**
 * Derive Home board phase from authoritative RPC payloads + clock.
 * Does not invent active objectives when the server reports none.
 */
export function deriveHomeBoardPhase(input: {
  cocktail: CocktailBountyPayload | null
  ingredient: IngredientBountyPayload | null
  clock: ShipClockState | null
  fetchStatus: 'loading' | 'ready' | 'unavailable' | 'error' | 'stale' | 'idle'
}): HomeBoardPhase {
  const { cocktail, ingredient, clock, fetchStatus } = input

  if (fetchStatus === 'loading' || fetchStatus === 'idle') return 'loading'
  if (fetchStatus === 'error' || fetchStatus === 'unavailable' || fetchStatus === 'stale') {
    return fetchStatus === 'stale' ? 'unavailable' : fetchStatus === 'error' ? 'error' : 'unavailable'
  }

  if (!cocktail || !ingredient || !clock?.configured) return 'unavailable'

  if (cocktail.status === 'finale' || ingredient.status === 'finale' || clock.finalized) {
    return 'finale'
  }
  if (cocktail.status === 'paused' || ingredient.status === 'paused' || clock.games?.drinkit?.paused) {
    return 'paused'
  }

  // Claimed rotating cards still count as mid-day content (do not collapse to overnight).
  if (
    cocktail.status === 'active' ||
    ingredient.status === 'active' ||
    cocktail.status === 'already_claimed' ||
    ingredient.status === 'already_claimed'
  ) {
    return 'active'
  }

  // Both non-active (typically unavailable). Classify closed windows via ship-local wall.
  const reason = cocktail.reason ?? ingredient.reason ?? ''
  if (reason === 'no_cruise_config' || reason === 'outside_cruise') return 'unavailable'
  if (reason === 'no_active_offer' || reason === 'missed_while_paused') return 'unavailable'

  const ship = clock.ship_local ? parseShipLocal(clock.ship_local) : null
  if (!ship) return 'unavailable'

  const minutes = ship.hours * 60 + ship.minutes
  // Day 1 public bounty open is 14:00; Days 2–7 remain noon (server drinkit_lifecycle_at).
  const openMinutes = clock.cruise_day === 1 ? 14 * 60 : 12 * 60
  const close = 23 * 60

  if (minutes < openMinutes) return 'pre_open'
  if (minutes >= close) return 'overnight'

  // Mid-window with no public slot (e.g. schedule missing) — do not invent an offer.
  return 'unavailable'
}

/**
 * Next public Drink It! opening as a UTC ISO string, or null.
 * Day 1 opens 14:00; later days noon. Uses frozen offset from the clock snapshot.
 */
export function nextOpeningUtcIso(clock: ShipClockState, nowEstimateUtcMs?: number): string | null {
  if (!clock.configured || clock.offset_minutes == null || !clock.ship_local || !clock.ship_date) {
    return null
  }
  // Prefer authoritative Day-1 bounty open from the server when still pre-open.
  if (clock.drinkit_bounty_opens_at_utc && clock.lifecycle === 'pre_cruise') {
    return clock.drinkit_bounty_opens_at_utc
  }
  const ship = parseShipLocal(clock.ship_local)
  if (!ship) return null

  const offset = clock.offset_minutes
  const minutes = ship.hours * 60 + ship.minutes
  const openHour = clock.cruise_day === 1 ? 14 : 12
  const wallUtcMs = (date: string, hour: number) =>
    Date.parse(`${date}T${String(hour).padStart(2, '0')}:00:00Z`) - offset * 60_000

  let openDate = clock.ship_date
  let hour = openHour
  if (minutes >= openHour * 60) {
    // After today's open → next calendar ship day at noon.
    const d = new Date(`${clock.ship_date}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    openDate = d.toISOString().slice(0, 10)
    hour = 12
  }

  let targetMs = wallUtcMs(openDate, hour)
  if (nowEstimateUtcMs != null && targetMs <= nowEstimateUtcMs) {
    const d = new Date(`${openDate}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    targetMs = wallUtcMs(d.toISOString().slice(0, 10), 12)
  }

  return new Date(targetMs).toISOString()
}
