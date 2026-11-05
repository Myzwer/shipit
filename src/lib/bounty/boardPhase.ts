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

  if (cocktail.status === 'active' || ingredient.status === 'active') {
    return 'active'
  }

  // Both non-active (typically unavailable). Classify closed windows via ship-local wall.
  const reason = cocktail.reason ?? ingredient.reason ?? ''
  if (reason === 'no_cruise_config' || reason === 'outside_cruise') return 'unavailable'
  if (reason === 'no_active_offer' || reason === 'missed_while_paused') return 'unavailable'

  const ship = clock.ship_local ? parseShipLocal(clock.ship_local) : null
  if (!ship) return 'unavailable'

  const minutes = ship.hours * 60 + ship.minutes
  const noon = 12 * 60
  const close = 23 * 60

  if (minutes < noon) return 'pre_open'
  if (minutes >= close) return 'overnight'

  // Mid-window with no public slot (e.g. schedule missing) — do not invent an offer.
  return 'unavailable'
}

/**
 * Next public Drink It! opening (noon ship-local) as a UTC ISO string, or null.
 * Uses the frozen offset from the last clock snapshot — not the device timezone.
 */
export function nextOpeningUtcIso(clock: ShipClockState, nowEstimateUtcMs?: number): string | null {
  if (!clock.configured || clock.offset_minutes == null || !clock.ship_local || !clock.ship_date) {
    return null
  }
  const ship = parseShipLocal(clock.ship_local)
  if (!ship) return null

  const offset = clock.offset_minutes
  const minutes = ship.hours * 60 + ship.minutes
  let openDate = clock.ship_date

  if (minutes >= 12 * 60) {
    // After noon → next calendar ship day at noon (overnight / open-but-closed evening).
    const d = new Date(`${clock.ship_date}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    openDate = d.toISOString().slice(0, 10)
  }

  // Day 7 after finale is handled by finale status — callers should not request overnight.
  const shipNoonAsUtcMs =
    Date.parse(`${openDate}T12:00:00Z`) - offset * 60_000

  if (nowEstimateUtcMs != null && shipNoonAsUtcMs <= nowEstimateUtcMs) {
    // Safety: if estimate already past, push one more day.
    const d = new Date(`${openDate}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    const next = d.toISOString().slice(0, 10)
    return new Date(Date.parse(`${next}T12:00:00Z`) - offset * 60_000).toISOString()
  }

  return new Date(shipNoonAsUtcMs).toISOString()
}
