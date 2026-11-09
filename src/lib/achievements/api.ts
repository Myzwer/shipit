import { supabase } from '@/lib/supabase'
import type { GameId } from '@/types/game'
import type {
  AchievementView,
  AchievementsListResult,
  AchievementsUnreadState,
  BarGauntletSummariesResult,
  CollectionChecklistResult,
} from '@/types/achievements'
import { achievementCategoriesOrdered, categoryKeyForGroup } from './categories'

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
  const achievements = Array.isArray(row.achievements) ? row.achievements : []
  return {
    ...row,
    achievements,
    // Client-side category ordering metadata for A5 (not hardcoded names in Vue).
    categories: achievementCategoriesOrdered(),
  } as AchievementsListResult & { categories: ReturnType<typeof achievementCategoriesOrdered> }
}

export function withCategoryKeys<T extends { group_key: string }>(rows: T[]) {
  return rows.map((row) => ({
    ...row,
    category_key: categoryKeyForGroup(row.group_key),
  }))
}

export async function listDrinkItBarGauntletSummaries(): Promise<BarGauntletSummariesResult> {
  const { data, error } = await rpc('list_drinkit_bar_gauntlet_summaries')
  if (error) throw error
  const row = data as BarGauntletSummariesResult
  if (!row?.ok) {
    throw new Error(row?.message ?? row?.code ?? 'Gauntlet summaries unavailable')
  }
  return { ...row, bars: Array.isArray(row.bars) ? row.bars : [] }
}

export async function getDrinkItCollectionChecklist(
  barKey: string,
): Promise<CollectionChecklistResult> {
  const { data, error } = await rpc('get_drinkit_collection_checklist', {
    p_bar_key: barKey,
  })
  if (error) throw error
  const row = data as CollectionChecklistResult
  if (!row?.ok) {
    throw new Error(row?.message ?? row?.code ?? 'Collection checklist unavailable')
  }
  return { ...row, items: Array.isArray(row.items) ? row.items : [] }
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
