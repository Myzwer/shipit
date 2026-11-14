import type { GameId } from '@/types/game'

export type AchievementView = 'all' | 'mine'
export type AchievementGroup =
  | 'milestones'
  | 'firsts'
  | 'other'
  | 'drinking_with_davids'
  | 'bar_gauntlets'
  | 'firsts_early_wins'
  | 'bounties_competition'
  | 'bars_exploration'
  | 'spirits_ingredients'
  | 'friends_social'
  | 'ship_time_milestones'
  | 'progress_completion'
  | 'challenge_spotlights'

export interface AchievementProgress {
  current: number
  target: number
  kind?: 'collection' | string
}

/** Lightweight collection summary on list cards (no cocktail checklist). */
export interface AchievementCollectionSummary {
  scope: 'personal' | 'collective' | string
  bar_key: string | null
  live_current: number
  live_target: number
  /** Historically earned badge (pinned award), independent of current-menu completeness. */
  badge_earned: boolean
  pin_target: number | null
  current_menu_complete: boolean
}

export interface AchievementCard {
  definition_id: string
  stable_key: string
  game: GameId
  group_key: AchievementGroup
  exclusive: boolean
  secret: boolean
  icon_key: string | null
  title: string
  description: string
  earned: boolean
  awarded_at_utc: string | null
  /** Server-authoritative historical ship-local wall time (never device TZ). */
  awarded_at_ship_local?: string | null
  award_id: string | null
  progress: AchievementProgress | null
  collection?: AchievementCollectionSummary | null
  exclusive_claimed: boolean
  exclusive_owner_name: string | null
  masked: boolean
  view: AchievementView
}

export interface AchievementCategoryMeta {
  key: string
  name: string
  group_key: AchievementGroup
  all_view_order: number
  organize_children_by?: string
  description?: string
  games?: Array<'drinkit' | 'shipit'>
}

export interface AchievementsListResult {
  ok: boolean
  game: GameId
  view: AchievementView
  finale_revealed: boolean
  achievements: AchievementCard[]
  /** Present when client enriches listAchievements with categories.json ordering. */
  categories?: AchievementCategoryMeta[]
  code?: string
  message?: string
}

export interface AchievementsUnreadState {
  ok: boolean
  game: GameId
  has_unread: boolean
  latest_award_id: string | null
  latest_awarded_at_utc: string | null
}

/** Player's achievements_mine read cursor (same watermark mark_achievements_seen advances). */
export interface AchievementsReadCursor {
  last_seen_award_id: string | null
  last_seen_at_utc: string | null
}

export interface BarGauntletSideSummary {
  definition_id: string
  stable_key: string
  earned: boolean
  badge_earned: boolean
  live_current: number
  live_target: number
  pin_target: number | null
  icon_key: string | null
}

export interface BarGauntletSummary {
  bar_key: string
  bar_name: string
  live_target: number
  /** True when menu price/offerings are not yet verified (e.g. Good Spirits). */
  verification_pending?: boolean
  personal: BarGauntletSideSummary
  collective: BarGauntletSideSummary
}

export interface BarGauntletSummariesResult {
  ok: boolean
  bars: BarGauntletSummary[]
  code?: string
  message?: string
}

export interface CollectionChecklistItem {
  offering_id: string
  concept_key: string
  display_name: string
  mine: boolean
  everyone: boolean
}

export interface CollectionChecklistSide {
  definition_id: string
  stable_key: string
  badge_earned: boolean
  live_current: number
  live_target: number
  pin_target: number | null
  current_menu_complete: boolean
}

export interface CollectionChecklistResult {
  ok: boolean
  bar_key: string
  bar_name: string
  items: CollectionChecklistItem[]
  personal: CollectionChecklistSide | null
  collective: CollectionChecklistSide | null
  code?: string
  message?: string
}

/** Presentation-only filters derived from checklist items (never award eligibility). */
export type CollectionChecklistFilter = 'all' | 'i_need' | 'we_need'

export function filterCollectionChecklistItems(
  items: CollectionChecklistItem[],
  filter: CollectionChecklistFilter,
): CollectionChecklistItem[] {
  if (filter === 'i_need') return items.filter((i) => !i.mine)
  if (filter === 'we_need') return items.filter((i) => !i.everyone)
  return items
}
