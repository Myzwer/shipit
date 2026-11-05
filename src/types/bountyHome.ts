import type { BountyCategory } from '@/types/game'
import type { ShipClockState } from '@/types/shipClock'

/** Cocktail oddity tiers from catalog / schedule snapshots. */
export type CocktailBountyTier = 'familiar' | 'interesting' | 'unusual' | 'adventurous'

/** Ingredient rarity tiers from catalog / schedule snapshots. */
export type IngredientBountyTier =
  | 'easy_to_find'
  | 'less_common'
  | 'hard_to_find'
  | 'elusive'

export type HomeBountyRpcStatus = 'active' | 'paused' | 'finale' | 'unavailable'

export interface ListedIngredient {
  ingredient_key: string
  display_label: string
}

export interface ActiveCocktailBounty {
  status: 'active'
  offer_id: string
  slot_key: string
  drink_name: string
  designated_bar_key: string
  designated_bar_name: string
  tier: string
  points: number
  listed_ingredients: ListedIngredient[]
  public_end_utc: string
  cruise_day?: number | null
}

export interface ActiveIngredientBounty {
  status: 'active'
  offer_id: string
  slot_key: string
  ingredient_key: string
  display_name: string
  tier: string
  points: number
  known_bar_count: number
  public_end_utc: string
  cruise_day?: number | null
}

export interface ActiveBarBounty {
  status: 'active'
  assignment_id: string
  cruise_day: number
  bar_id: string
  bar_canonical_key: string
  bar_display_name: string
  points_base: number
  points_per_companion: number
  points_cap: number
  public_end_utc: string
}

export interface ActiveDailyChallenge {
  status: 'active'
  challenge_id: string
  cruise_day: number
  title: string
  instructions: string
  location_name: string | null
  meeting_time_ship_local: string | null
  is_all_hands: boolean
  photo_required: boolean
  points: number
  public_end_utc: string
}

export interface NonActiveBounty {
  status: Exclude<HomeBountyRpcStatus, 'active'>
  reason?: string
  cruise_day?: number | null
}

export type CocktailBountyPayload = ActiveCocktailBounty | NonActiveBounty
export type IngredientBountyPayload = ActiveIngredientBounty | NonActiveBounty
export type BarBountyPayload = ActiveBarBounty | NonActiveBounty
export type DailyChallengePayload = ActiveDailyChallenge | NonActiveBounty

/** Shared board lifecycle derived from clock + bounty RPCs. */
export type HomeBoardPhase =
  | 'loading'
  | 'active'
  | 'pre_open'
  | 'overnight'
  | 'paused'
  | 'finale'
  | 'unavailable'
  | 'error'

export type HomeCardPresentation =
  | 'active'
  | 'closed'
  | 'paused'
  | 'finale'
  | 'loading'
  | 'unavailable'
  | 'shell'

export interface HomeBountyCardView {
  id: BountyCategory
  heading: string
  presentation: HomeCardPresentation
  tierOrEyebrow: string
  title: string
  detail: string
  pointsLabel: string
  footer: string
  timerLabel: string
  timerValue: string
  /** Always false until Phase 3 wizard / Daily photo path. */
  claimEnabled: false
  claimTitle: string
}

export interface HomeBountySnapshot {
  cocktail: CocktailBountyPayload | null
  ingredient: IngredientBountyPayload | null
  bar: BarBountyPayload | null
  daily: DailyChallengePayload | null
  clock: ShipClockState | null
  cruiseDay: number | null
  fetchedAtMs: number
  serverAtUtc: string | null
}

export type HomeBountyFetchStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'unavailable'
  | 'error'
  | 'stale'
