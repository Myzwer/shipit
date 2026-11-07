import type { GameId } from '@/types/game'

export type WrappedOwnerType = 'player' | 'team'

export interface WrappedOwner {
  type: WrappedOwnerType
  id: string
  display_name: string
}

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
  is_me?: boolean
  is_my_team?: boolean
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

/** Card templates for personal stats (factual labels; creative quips later). */
export type WrappedStatCardKind = 'number' | 'named'

export interface WrappedStatCard {
  kind: WrappedStatCardKind
  key: string
  icon: string
  value: string
  label: string
  copy: string
  chip?: string
  tone: 'aqua' | 'cream'
}
