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

export type HomeBountyRpcStatus =
  | 'active'
  | 'already_claimed'
  | 'paused'
  | 'finale'
  | 'unavailable'

export interface ListedIngredient {
  ingredient_key: string
  display_label: string
}

export interface ActiveCocktailBounty {
  status: 'active'
  offer_id: string
  slot_key: string
  /** Exact catalog offering for Claim It prefill (Phase 3B). */
  offering_id?: string | null
  drink_name: string
  designated_bar_key: string
  designated_bar_name: string
  tier: string
  points: number
  listed_ingredients: ListedIngredient[]
  public_end_utc: string
  cruise_day?: number | null
}

/** Player already claimed Cocktail today — Home uses existing Claimed overlay. */
export interface ClaimedCocktailBounty {
  status: 'already_claimed'
  reason?: string
  cruise_day?: number | null
  offer_id?: string
  slot_key?: string
  offering_id?: string | null
  drink_name?: string
  designated_bar_key?: string
  designated_bar_name?: string
  tier?: string
  /** Accepted ledger points for today (not recalculated). */
  points?: number
  listed_ingredients?: ListedIngredient[]
  public_end_utc?: string
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

/** Player already claimed Ingredient today — Home uses existing Claimed overlay. */
export interface ClaimedIngredientBounty {
  status: 'already_claimed'
  reason?: string
  cruise_day?: number | null
  offer_id?: string
  slot_key?: string
  ingredient_key?: string
  display_name?: string
  tier?: string
  /** Accepted ledger points for today (not recalculated). */
  points?: number
  known_bar_count?: number
  public_end_utc?: string
}

export interface ActiveBarBounty {
  status: 'active'
  assignment_id: string
  cruise_day: number
  bar_id: string
  bar_canonical_key: string
  bar_display_name: string
  /** Legacy parse field; B3 UI uses points_min/points_max. */
  points_base: number
  points_per_companion: number
  points_cap: number
  /** B2 band floor shown on the card (not an awarded value). */
  points_min?: number
  /** B2 band ceiling shown on the card (not an awarded value). */
  points_max?: number
  scoring?: string
  public_end_utc: string
}

export interface ClaimedBarBounty {
  status: 'already_claimed'
  reason?: string
  cruise_day?: number | null
  assignment_id?: string
  bar_display_name?: string
  /** Accepted ledger points for today (not recalculated). */
  points?: number
}

/** C1 participation intent. Honor-system only; no partner verification. */
export type DailyChallengeParticipationMode = 'all_hands' | 'bring_a_friend'

export interface ActiveDailyChallenge {
  status: 'active'
  challenge_id: string
  cruise_day: number
  title: string
  instructions: string
  location_name: string | null
  bar_canonical_key?: string | null
  meeting_time_ship_local: string | null
  is_all_hands: boolean
  participation_mode?: DailyChallengeParticipationMode
  /** Admin meetup note. Display only; never gates claims. */
  admin_announcement?: string | null
  photo_required: boolean
  points: number
  public_end_utc: string
}

export interface NonActiveBounty {
  status: Exclude<HomeBountyRpcStatus, 'active' | 'already_claimed'>
  reason?: string
  cruise_day?: number | null
}

export interface ClaimedDailyChallenge {
  status: 'already_claimed'
  reason?: string
  cruise_day?: number | null
  challenge_id?: string
  title?: string
  instructions?: string
  location_name?: string | null
  bar_canonical_key?: string | null
  is_all_hands?: boolean
  participation_mode?: DailyChallengeParticipationMode
  admin_announcement?: string | null
  photo_required?: boolean
  points?: number
  submission_id?: string
  public_end_utc?: string
}

export type CocktailBountyPayload =
  | ActiveCocktailBounty
  | ClaimedCocktailBounty
  | NonActiveBounty
export type IngredientBountyPayload =
  | ActiveIngredientBounty
  | ClaimedIngredientBounty
  | NonActiveBounty
export type BarBountyPayload = ActiveBarBounty | ClaimedBarBounty | NonActiveBounty
export type DailyChallengePayload =
  | ActiveDailyChallenge
  | ClaimedDailyChallenge
  | NonActiveBounty

/** Compact crew presentation attached to the Bar card (B3). */
export type HomeBarCrewView = {
  status: 'assigned' | 'unassigned' | 'unavailable' | 'loading' | 'error'
  mateNames?: string[]
  crewSize?: 3 | 4
  message?: string
}

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
  | 'claimed'
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
  /** Italic lead-in. Presentation only; not stored catalog text. */
  lead?: string
  detail: string
  /** Short presentation note, such as a development-fixture flag. */
  note?: string
  pointsLabel: string
  footer: string
  timerLabel: string
  timerValue: string
  /** Cocktail / Ingredient / Bar open the log wizard; Daily opens the Details flow. */
  claimEnabled: boolean
  claimTitle: string
  /** Visible CTA label. Defaults to Claim It when omitted. */
  claimLabel?: string
  /** Compact today's Bar Bounty crew (Bar card only). */
  crew?: HomeBarCrewView
  /** Prefill hints for the logging wizard or Daily challenge route. */
  claimPrefill?: {
    source: 'cocktail' | 'ingredient' | 'bar' | 'daily'
    barCanonicalKey?: string
    offeringId?: string
    drinkDisplayName?: string
    challengeId?: string
  }
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
