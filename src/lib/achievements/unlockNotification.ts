import type { AchievementCard } from '@/types/achievements'

/**
 * One row per newly awarded achievement in a single submission batch.
 * Duplicate award ids count once, in first-seen order. Rows without an
 * award id are not part of the new-award batch.
 */
export function distinctUnlockCards(cards: readonly AchievementCard[]): AchievementCard[] {
  const seen = new Set<string>()
  const distinct: AchievementCard[] = []
  for (const card of cards) {
    const id = card.award_id
    if (!id || seen.has(id)) continue
    seen.add(id)
    distinct.push(card)
  }
  return distinct
}
