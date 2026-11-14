/**
 * Visit-scoped "Just Unlocked" presentation helpers.
 * Unread identity follows the achievements_mine read cursor (same tuple order as the RPC).
 */
import type { AchievementCard, AchievementsReadCursor } from '@/types/achievements'

export type { AchievementsReadCursor }

/** Compare award timestamps as instants (matches timestamptz), not raw ISO strings. */
function compareUtcInstants(a: string, b: string): number {
  const aMs = Date.parse(a)
  const bMs = Date.parse(b)
  if (Number.isFinite(aMs) && Number.isFinite(bMs) && aMs !== bMs) {
    return aMs < bMs ? -1 : 1
  }
  // Fallback for unparsable values: lexicographic ISO compare.
  if (a === b) return 0
  return a < b ? -1 : 1
}

/** True when (awardedAt, awardId) is strictly after the achievements_mine cursor. */
export function isAwardNewerThanCursor(
  awardedAtUtc: string,
  awardId: string,
  cursor: AchievementsReadCursor | null,
): boolean {
  if (!cursor?.last_seen_award_id) return true
  const seenAt = cursor.last_seen_at_utc
  if (!seenAt) return true
  const byTime = compareUtcInstants(awardedAtUtc, seenAt)
  if (byTime !== 0) return byTime > 0
  return awardId > cursor.last_seen_award_id
}

/**
 * Earned, active (list) awards the player has not reviewed yet.
 * Newest first. Only cards with award_id + awarded_at_utc qualify.
 */
export function selectJustUnlockedCards(
  cards: AchievementCard[],
  cursor: AchievementsReadCursor | null,
): AchievementCard[] {
  const unread = cards.filter(
    (c) =>
      c.earned &&
      !c.masked &&
      !!c.award_id &&
      !!c.awarded_at_utc &&
      isAwardNewerThanCursor(c.awarded_at_utc, c.award_id, cursor),
  )
  return unread.sort((a, b) => {
    const byTime = compareUtcInstants(b.awarded_at_utc!, a.awarded_at_utc!)
    if (byTime !== 0) return byTime
    return (b.award_id ?? '').localeCompare(a.award_id ?? '')
  })
}

/** Resolve showcase cards for a frozen visit snapshot of award IDs (order preserved). */
export function cardsForJustUnlockedIds(
  cards: AchievementCard[],
  awardIds: readonly string[],
): AchievementCard[] {
  if (awardIds.length === 0) return []
  const byId = new Map<string, AchievementCard>()
  for (const card of cards) {
    if (card.earned && card.award_id && !card.masked) {
      byId.set(card.award_id, card)
    }
  }
  const out: AchievementCard[] = []
  for (const id of awardIds) {
    const card = byId.get(id)
    if (card) out.push(card)
  }
  return out
}
