/** Phase 3B logging wizard types (client). */

export type WizardStep = 'bar' | 'drink' | 'friends' | 'photo' | 'review'

export type BarSortMode = 'alpha' | 'deck'

export type DrinkSelectionMode =
  | 'named_catalog'
  | 'generic_beer'
  | 'generic_wine'
  | 'generic_other'
  | 'unlisted_named'

export type WizardEntrySource = 'plus' | 'cocktail' | 'ingredient' | 'bar'

export interface DrinkitBarRow {
  bar_id: string
  canonical_key: string
  name: string
  deck: number
}

export interface DrinkitBarDrinkRow {
  offering_id: string
  drink_concept_id: string
  canonical_key: string
  display_name: string
  kind: string
}

export interface DrinkitCompanionRow {
  player_id: string
  display_name: string
}

export interface WizardDrinkSelection {
  mode: DrinkSelectionMode
  offeringId?: string
  displayName: string
  customName?: string
}

export interface SelectedClaimChoice {
  category: 'cocktail' | 'ingredient' | 'bar'
  offer_id?: string
  assignment_id?: string
  /** Server points for display; never client-authored for submit. */
  points: number
  /** Stable key for grace/current option choice within a category. */
  optionKey: string
}

export type PreviewCategoryStatus =
  | 'eligible'
  | 'unavailable'
  | 'already_claimed'

export interface PreviewCategoryOption {
  category: string
  points: number
  offer_id?: string
  assignment_id?: string
  slot_id?: string
  source?: string
  companion_count?: number
  [key: string]: unknown
}

export interface PreviewCategoryState {
  status: PreviewCategoryStatus | string
  reason?: string | null
  options: PreviewCategoryOption[]
}

export interface PreviewPayload {
  ok: boolean
  lifecycle?: { status?: string; reason?: string }
  categories?: {
    cocktail?: PreviewCategoryState
    ingredient?: PreviewCategoryState
    bar?: PreviewCategoryState
    daily?: PreviewCategoryState
  }
  companion_player_ids?: string[]
  bar_eligible_companion_ids?: string[]
  drink?: Record<string, unknown>
  [key: string]: unknown
}

export interface SubmitDrinkResult {
  ok: boolean
  code?: string
  message?: string
  submission_id?: string
  awarded_points?: number
  claimed_categories?: unknown[]
  gallery_event_id?: string
  idempotent_replay?: boolean
  preview?: PreviewPayload
  [key: string]: unknown
}

export type SubmitOutcomeKind =
  | 'idle'
  | 'submitting'
  | 'success'
  | 'failed'
  | 'unknown'
  | 'eligibility_changed'
  | 'already_claimed'
  | 'game_paused'
  | 'game_ended'

export interface WizardPrefill {
  source: WizardEntrySource
  barCanonicalKey?: string
  barDisplayName?: string
  offeringId?: string
  drinkDisplayName?: string
}
