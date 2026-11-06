import type { GameId } from '@/types/game'

export type AchievementView = 'all' | 'mine'
export type AchievementGroup = 'milestones' | 'firsts' | 'other'

export interface AchievementProgress {
  current: number
  target: number
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
  award_id: string | null
  progress: AchievementProgress | null
  exclusive_claimed: boolean
  exclusive_owner_name: string | null
  masked: boolean
  view: AchievementView
}

export interface AchievementsListResult {
  ok: boolean
  game: GameId
  view: AchievementView
  finale_revealed: boolean
  achievements: AchievementCard[]
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
