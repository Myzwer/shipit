import { describe, expect, it } from 'vitest'
import {
  cardsForJustUnlockedIds,
  isAwardNewerThanCursor,
  selectJustUnlockedCards,
} from '@/lib/achievements/justUnlocked'
import { composeMineSections } from '@/lib/achievements/composeAchievementsView'
import type { AchievementCard } from '@/types/achievements'

function card(
  partial: Partial<AchievementCard> & Pick<AchievementCard, 'stable_key' | 'group_key'>,
): AchievementCard {
  return {
    definition_id: partial.definition_id ?? partial.stable_key,
    stable_key: partial.stable_key,
    game: 'drinkit',
    group_key: partial.group_key,
    exclusive: false,
    secret: false,
    icon_key: 'theme.drink-it',
    title: partial.title ?? partial.stable_key,
    description: partial.description ?? 'desc',
    earned: partial.earned ?? false,
    awarded_at_utc: partial.awarded_at_utc ?? null,
    awarded_at_ship_local: partial.awarded_at_ship_local ?? null,
    award_id: partial.award_id ?? null,
    progress: null,
    exclusive_claimed: false,
    exclusive_owner_name: null,
    masked: !!partial.masked,
    view: 'mine',
  }
}

describe('justUnlocked', () => {
  it('treats all awards as unread when there is no cursor', () => {
    expect(isAwardNewerThanCursor('2026-01-02T00:00:00Z', 'a', null)).toBe(true)
    expect(
      isAwardNewerThanCursor('2026-01-02T00:00:00Z', 'a', {
        last_seen_award_id: null,
        last_seen_at_utc: null,
      }),
    ).toBe(true)
  })

  it('compares (awarded_at, award_id) tuples like the unread RPC', () => {
    const cursor = {
      last_seen_award_id: 'bbb',
      last_seen_at_utc: '2026-01-02T12:00:00.000Z',
    }
    expect(isAwardNewerThanCursor('2026-01-02T13:00:00.000Z', 'aaa', cursor)).toBe(true)
    expect(isAwardNewerThanCursor('2026-01-02T11:00:00.000Z', 'zzz', cursor)).toBe(false)
    expect(isAwardNewerThanCursor('2026-01-02T12:00:00.000Z', 'ccc', cursor)).toBe(true)
    expect(isAwardNewerThanCursor('2026-01-02T12:00:00.000Z', 'aaa', cursor)).toBe(false)
    // Same instant, different ISO spelling must not false-positive as unread.
    expect(
      isAwardNewerThanCursor('2026-01-02T12:00:00.000+00:00', 'bbb', {
        last_seen_award_id: 'bbb',
        last_seen_at_utc: '2026-01-02T12:00:00.000Z',
      }),
    ).toBe(false)
  })

  it('selects only earned unmasked awards newer than the cursor, newest first', () => {
    const cursor = {
      last_seen_award_id: 'id-1',
      last_seen_at_utc: '2026-01-01T00:00:00.000Z',
    }
    const cards = [
      card({
        stable_key: 'old',
        group_key: 'milestones',
        earned: true,
        award_id: 'id-1',
        awarded_at_utc: '2026-01-01T00:00:00.000Z',
      }),
      card({
        stable_key: 'new-a',
        group_key: 'milestones',
        earned: true,
        award_id: 'id-2',
        awarded_at_utc: '2026-01-02T00:00:00.000Z',
      }),
      card({
        stable_key: 'new-b',
        group_key: 'firsts',
        earned: true,
        award_id: 'id-3',
        awarded_at_utc: '2026-01-03T00:00:00.000Z',
      }),
      card({
        stable_key: 'locked',
        group_key: 'milestones',
        earned: false,
        award_id: null,
      }),
      card({
        stable_key: 'masked',
        group_key: 'milestones',
        earned: true,
        masked: true,
        award_id: 'id-4',
        awarded_at_utc: '2026-01-04T00:00:00.000Z',
      }),
    ]
    expect(selectJustUnlockedCards(cards, cursor).map((c) => c.stable_key)).toEqual([
      'new-b',
      'new-a',
    ])
  })

  it('resolves snapshot ids without resurrecting masked cards', () => {
    const cards = [
      card({
        stable_key: 'a',
        group_key: 'milestones',
        earned: true,
        award_id: 'id-a',
        awarded_at_utc: '2026-01-01T00:00:00.000Z',
      }),
      card({
        stable_key: 'secret',
        group_key: 'milestones',
        earned: true,
        masked: true,
        award_id: 'id-secret',
        awarded_at_utc: '2026-01-02T00:00:00.000Z',
      }),
    ]
    expect(
      cardsForJustUnlockedIds(cards, ['id-secret', 'id-a', 'missing']).map((c) => c.stable_key),
    ).toEqual(['a'])
  })

  it('excludes just-unlocked awards from My Achievements category sections', () => {
    const cards = [
      card({
        stable_key: 'keep',
        group_key: 'milestones',
        earned: true,
        award_id: 'keep-id',
        awarded_at_utc: '2026-01-01T00:00:00.000Z',
      }),
      card({
        stable_key: 'lift',
        group_key: 'milestones',
        earned: true,
        award_id: 'lift-id',
        awarded_at_utc: '2026-01-02T00:00:00.000Z',
      }),
    ]
    const sections = composeMineSections({
      cards,
      filter: 'all',
      excludeAwardIds: new Set(['lift-id']),
    })
    expect(sections.flatMap((s) => s.items.map((i) => (i.kind === 'card' ? i.card.stable_key : '')))).toEqual([
      'keep',
    ])
  })
})
