import type { GameId } from '@/types/game'

export type WrappedOwnerType = 'player' | 'team'

export interface WrappedOwner {
  type: WrappedOwnerType
  id: string
  display_name: string
}

/** Phase 8 legacy personal stats (kept for compat / tests). */
export interface DrinkItPersonalStats {
  final_points: number
  drink_logs: number
  distinct_bars: number
  distinct_named_cocktails: number
  daily_completions: number
  achievements_earned: number
  distinct_companions: number
  bounty_claims_total: number
  bounty_claims_by_category: {
    cocktail: number
    ingredient: number
    bar: number
    daily: number
  }
}

export interface ShipItCategoryCompletion {
  category: string
  label: string
  completed: number
  total: number
  points: number
}

/** Phase 8 legacy team stats (kept for compat / tests). */
export interface ShipItTeamStats {
  final_points: number
  challenges_completed: number
  challenges_total: number
  distinct_categories: number
  category_completions: ShipItCategoryCompletion[]
  achievements_earned: number
  team_submissions: number
}

export interface WrappedAwardWinner {
  owner_id: string
  owner_name: string
  value: number
}

export interface WrappedGroupAward {
  stable_key: string
  title: string
  quip: string
  icon_key: string
  metric_key: string
  test_only: boolean
  winners: WrappedAwardWinner[]
  qualifying_value: number | null
  qualifying_label: string | null
  status: 'awarded' | 'no_winner'
}

export interface WrappedLeaderboardRow {
  id: string
  name: string
  members?: string[]
  points: number
  metric_label: string
  rank: number
  bounty_claims?: number
  completed?: number
  achievements?: number
  is_me?: boolean
  is_my_team?: boolean
}

/** Final Wrapped entry winner (sections payload). */
export interface WrappedEntryWinner {
  id: string
  name: string
  value: number | null
  detail: string | null
}

export interface WrappedEntryPhoto {
  photo_id: string
  width: number | null
  height: number | null
  crop_zoom?: number | null
  crop_center_x?: number | null
  crop_center_y?: number | null
}

/**
 * Final approved Wrapped entry from the server read model.
 * `spec_id` matches CRUISE_WRAPPED_FINAL_IMPLEMENTATION_SPEC identifiers.
 */
export interface WrappedEntry {
  spec_id: string
  label: string
  available: boolean
  kind: string
  primary: string | null
  secondary: string | null
  value_numeric: number | null
  unit: string | null
  winners: WrappedEntryWinner[]
  items: unknown[]
  photo: WrappedEntryPhoto | null
  explanation: string | null
  empty_reason: string | null
}

export interface WrappedSections {
  personal: WrappedEntry[]
  global: WrappedEntry[]
  collective: WrappedEntry[]
}

export interface WrappedPayload {
  ok: boolean
  code?: string
  message?: string
  game?: GameId
  awards_mode?: boolean
  finale_at_utc?: string
  at_utc?: string
  revealed?: boolean
  revealed_at_utc?: string | null
  owner?: WrappedOwner
  /** Final 80-entry read model (preferred). */
  sections?: WrappedSections
  /** Phase 8 legacy fields retained for tests / transitional UI. */
  personal_stats?: DrinkItPersonalStats | ShipItTeamStats
  group_awards?: WrappedGroupAward[]
  leaderboard?: WrappedLeaderboardRow[]
}

export interface RevealWrappedResult {
  ok: boolean
  code?: string
  message?: string
  revealed?: boolean
  idempotent_replay?: boolean
  revealed_at_utc?: string
  game?: GameId
}

/** Card templates for personal/team stats. */
export type WrappedStatCardKind = 'number' | 'named' | 'photo'

/** Presentation width/density for the hybrid Wrapped layout system. */
export type WrappedStatLayout = 'compact' | 'text' | 'featured'

export interface WrappedStatCard {
  kind: WrappedStatCardKind
  /** compact = numeric tile; text/featured = editorial panels */
  layout: WrappedStatLayout
  /** Grid span after packing (orphan compact metrics become full-row). */
  span: 'half' | 'full'
  key: string
  icon: string
  value: string
  label: string
  copy: string
  chip?: string
  tone: 'aqua' | 'cream'
  available?: boolean
  photo?: WrappedEntryPhoto | null
  expandableNames?: string[]
}

export interface WrappedAwardCardModel {
  key: string
  title: string
  primary: string
  secondary: string | null
  copy: string | null
  available: boolean
  tone: 'aqua' | 'cream'
  icon: string
  expandableNames?: string[]
  items?: Array<{ label: string; detail: string }>
  photo?: WrappedEntryPhoto | null
}
