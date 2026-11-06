import { supabase } from '@/lib/supabase'
import type { GameId } from '@/types/game'
import type {
  AchievementView,
  AchievementsListResult,
  AchievementsUnreadState,
} from '@/types/achievements'

function requireClient() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

async function rpc(fn: string, args?: Record<string, unknown>) {
  const client = requireClient()
  return client.rpc(fn as 'get_ship_clock_state', (args ?? {}) as never)
}

export async function listAchievements(
  game: GameId,
  view: AchievementView = 'all',
): Promise<AchievementsListResult> {
  const { data, error } = await rpc('list_achievements', {
    p_game: game,
    p_view: view,
  })
  if (error) throw error
  const row = data as AchievementsListResult
  if (!row?.ok) {
    throw new Error(row?.message ?? row?.code ?? 'Achievements unavailable')
  }
  return {
    ...row,
    achievements: Array.isArray(row.achievements) ? row.achievements : [],
  }
}

export async function fetchAchievementsUnread(game: GameId): Promise<AchievementsUnreadState> {
  const { data, error } = await rpc('get_achievements_unread', { p_game: game })
  if (error) throw error
  return data as AchievementsUnreadState
}

export async function markAchievementsSeen(
  game: GameId,
  awardId: string,
  awardedAtUtc: string,
): Promise<void> {
  const { data, error } = await rpc('mark_achievements_seen', {
    p_game: game,
    p_award_id: awardId,
    p_awarded_at_utc: awardedAtUtc,
  })
  if (error) throw error
  const row = data as { ok?: boolean; code?: string }
  if (!row?.ok) throw new Error(row?.code ?? 'Could not mark achievements seen')
}
