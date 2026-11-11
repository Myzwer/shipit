/**
 * Source-controlled achievement category metadata for All-view ordering.
 * Do not hardcode category names or order in Vue — import this module.
 */
import categoriesDoc from '../../../content/achievements/categories.json'
import type { AchievementGroup } from '@/types/achievements'
import type { GameId } from '@/types/game'

export interface AchievementCategoryMeta {
  key: string
  name: string
  group_key: AchievementGroup
  all_view_order: number
  organize_children_by?: string
  description?: string
  games?: GameId[]
}

export const ACHIEVEMENT_CATEGORIES: AchievementCategoryMeta[] = (
  categoriesDoc.categories as AchievementCategoryMeta[]
).slice()

export function achievementCategoriesOrdered(game?: GameId): AchievementCategoryMeta[] {
  const rows = game
    ? ACHIEVEMENT_CATEGORIES.filter((c) => !c.games || c.games.includes(game))
    : ACHIEVEMENT_CATEGORIES
  return [...rows].sort((a, b) => a.all_view_order - b.all_view_order)
}

export function categoryMetaForGroup(groupKey: string): AchievementCategoryMeta | null {
  return ACHIEVEMENT_CATEGORIES.find((c) => c.group_key === groupKey) ?? null
}

export function categoryKeyForGroup(groupKey: string): string {
  return categoryMetaForGroup(groupKey)?.key ?? groupKey
}
